"""
FastAPI application entry point for POE Knowledge Assistant.
"""
from datetime import datetime, timezone
from fastapi import FastAPI, APIRouter, Response, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from src.config import get_settings
from src.services.chroma_db import check_chromadb_health
from src.services.embeddings import (
    check_embeddings_health,
    LocalEmbeddings,
    OpenAIEmbeddings,
    create_embeddings,
    EmbeddingError
)
from src.services.vector_store import (
    VectorStore,
    VectorStoreError,
    get_embeddings,
    get_vector_store,
    check_vector_store_health,
)
from langchain_core.documents import Document

# Get settings instance
settings = get_settings()


# Request models for testing
class EmbedTextRequest(BaseModel):
    """Request model for embedding a single text."""
    text: str


class EmbedDocumentsRequest(BaseModel):
    """Request model for embedding multiple documents."""
    texts: list[str]


class CreateEmbeddingsRequest(BaseModel):
    """Request model for testing the factory function."""
    provider: str = "local"
    api_key: str | None = None
    model_name: str | None = None
    test_text: str = "This is a test query"


class VectorStoreSearchRequest(BaseModel):
    """Request model for vector store similarity search."""
    query: str
    k: int = 4
    game: str | None = None


class VectorStoreAddRequest(BaseModel):
    """Request model for adding documents to vector store."""
    texts: list[str]
    metadatas: list[dict] | None = None


# Create FastAPI app instance
app = FastAPI(
    title="POE Knowledge Assistant API",
    description="Backend API for POE Knowledge Assistant - A RAG-based chatbot for Path of Exile game knowledge",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configure CORS middleware for frontend origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors.get_origins_list(),
    allow_credentials=settings.cors.allow_credentials,
    allow_methods=[settings.cors.allow_methods],
    allow_headers=[settings.cors.allow_headers],
)

# Create base router
api_router = APIRouter()


@api_router.get("/", tags=["Root"])
async def root():
    """Root endpoint returning API information."""
    return {
        "message": "POE Knowledge Assistant API",
        "version": settings.app_version,
        "status": "operational"
    }


@api_router.get("/health", tags=["Health"])
async def health_check(response: Response):
    """
    Health check endpoint.

    Returns:
        dict: Health status including:
            - status: Overall health status ("healthy" or "degraded")
            - chromadb_status: ChromaDB connection status ("connected" or "disconnected")
            - embeddings_status: Embeddings service status ("ready" or "error")
            - vectorstore_status: Vector store status ("ready" or "error")
            - version: Application version
            - chromadb_message: Detailed ChromaDB status message
            - embeddings_message: Detailed embeddings status message
            - vectorstore_message: Detailed vector store status message
            - timestamp: ISO 8601 timestamp of the health check

    HTTP Status Codes:
        - 200: System is healthy (all services ready)
        - 503: System is degraded (any service not ready)
    """
    # Check ChromaDB health
    chromadb_health = check_chromadb_health()
    chromadb_status = chromadb_health.get("status", "disconnected")
    chromadb_message = chromadb_health.get("message", "Unknown status")

    # Check embeddings health
    embeddings_health = check_embeddings_health()
    embeddings_status = embeddings_health.get("status", "error")
    embeddings_message = embeddings_health.get("message", "Unknown status")

    # Check vector store health
    vectorstore_health = check_vector_store_health()
    vectorstore_status = vectorstore_health.get("status", "error")

    # Determine overall status
    # System is "healthy" if all services are ready
    overall_status = "healthy" if (
        chromadb_status == "connected" and
        embeddings_status == "ready" and
        vectorstore_status == "ready"
    ) else "degraded"

    # Set appropriate HTTP status code
    if overall_status == "healthy":
        response.status_code = 200
    else:
        response.status_code = 503

    return {
        "status": overall_status,
        "chromadb_status": chromadb_status,
        "embeddings_status": embeddings_status,
        "vectorstore_status": vectorstore_status,
        "version": settings.app_version,
        "chromadb_message": chromadb_message,
        "embeddings_message": embeddings_message,
        "vectorstore_message": vectorstore_health.get("message", "Unknown status"),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@api_router.get("/config", tags=["Configuration"])
async def get_config():
    """Get current configuration (non-sensitive)."""
    return {
        "app_name": settings.app_name,
        "app_version": settings.app_version,
        "environment": settings.environment.value,
        "llm_provider": settings.llm.provider.value,
        "embedding_provider": settings.embedding.provider.value,
        "server": {
            "host": settings.server.host,
            "port": settings.server.port,
        },
        "database": {
            "url": settings.database.database_url,
        },
        "chromadb": {
            "persist_directory": settings.chromadb.persist_directory,
            "collection_name": settings.chromadb.collection_name,
        },
        "rag": {
            "top_k": settings.rag.top_k_results,
            "chunk_size": settings.rag.chunk_size,
        }
    }


@api_router.post("/test/embeddings/query", tags=["Testing"])
async def test_embed_query(request: EmbedTextRequest):
    """
    Test endpoint for embedding a single query.

    Args:
        request: Contains the text to embed

    Returns:
        dict: Contains the embedding vector and metadata
    """
    try:
        embeddings = LocalEmbeddings()
        embedding = embeddings.embed_query(request.text)

        return {
            "success": True,
            "text": request.text,
            "embedding_dimension": len(embedding),
            "embedding_preview": embedding[:5],  # First 5 values
            "message": "Embedding generated successfully"
        }
    except EmbeddingError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@api_router.post("/test/embeddings/documents", tags=["Testing"])
async def test_embed_documents(request: EmbedDocumentsRequest):
    """
    Test endpoint for embedding multiple documents.

    Args:
        request: Contains the list of texts to embed

    Returns:
        dict: Contains the embeddings and metadata
    """
    try:
        embeddings = LocalEmbeddings()
        embeddings_list = embeddings.embed_documents(request.texts)

        return {
            "success": True,
            "document_count": len(embeddings_list),
            "embedding_dimension": len(embeddings_list[0]) if embeddings_list else 0,
            "embeddings_preview": [emb[:3] for emb in embeddings_list],  # First 3 values of each
            "message": "Embeddings generated successfully"
        }
    except EmbeddingError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@api_router.post("/test/embeddings/factory", tags=["Testing"])
async def test_embeddings_factory(request: CreateEmbeddingsRequest):
    """
    Test endpoint for the embeddings factory function.

    This endpoint tests the create_embeddings factory function which creates
    the appropriate embeddings instance based on the provider.

    Args:
        request: Contains provider, optional api_key, optional model_name, and test_text

    Returns:
        dict: Contains information about the created embeddings instance and test results
    """
    try:
        # Prepare kwargs for factory function
        kwargs = {}
        if request.api_key:
            kwargs['api_key'] = request.api_key
        if request.model_name:
            kwargs['model_name'] = request.model_name

        # Create embeddings using factory function
        embeddings = create_embeddings(provider=request.provider, **kwargs)

        # Determine the type
        provider_type = "local" if isinstance(embeddings, LocalEmbeddings) else "openai"

        # Get basic info
        result = {
            "success": True,
            "provider_requested": request.provider,
            "provider_created": provider_type,
            "model_name": embeddings.model_name,
            "embedding_dimension": embeddings.embedding_dimension,
            "is_ready": embeddings.is_ready(),
        }

        # Try to generate an embedding
        if embeddings.is_ready():
            try:
                embedding = embeddings.embed_query(request.test_text)
                result["test_embedding_dimension"] = len(embedding)
                result["test_embedding_preview"] = embedding[:5]
                result["message"] = f"Successfully created {provider_type} embeddings and generated test embedding"
            except Exception as e:
                result["test_error"] = str(e)
                result["message"] = f"Created {provider_type} embeddings but failed to generate test embedding"
        else:
            result["message"] = f"Created {provider_type} embeddings but service is not ready"

        return result

    except EmbeddingError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@api_router.post("/test/embeddings/openai", tags=["Testing"])
async def test_openai_embeddings(request: EmbedTextRequest):
    """
    Test endpoint for OpenAI embeddings directly.

    This endpoint tests OpenAIEmbeddings class initialization and embedding generation.
    Note: Requires OPENAI_API_KEY environment variable or will fail.

    Args:
        request: Contains the text to embed

    Returns:
        dict: Contains information about the OpenAI embeddings instance and test results
    """
    try:
        # Try to create OpenAI embeddings (will fail without API key)
        embeddings = OpenAIEmbeddings()

        result = {
            "success": True,
            "provider": "openai",
            "model_name": embeddings.model_name,
            "embedding_dimension": embeddings.embedding_dimension,
            "is_ready": embeddings.is_ready(),
        }

        # Try to generate an embedding
        if embeddings.is_ready():
            embedding = embeddings.embed_query(request.text)
            result["test_embedding_dimension"] = len(embedding)
            result["test_embedding_preview"] = embedding[:5]
            result["message"] = "OpenAI embeddings created and test embedding generated successfully"
        else:
            result["message"] = "OpenAI embeddings created but service is not ready"

        return result

    except EmbeddingError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@api_router.get("/test/vectorstore/health", tags=["Testing"])
async def test_vectorstore_health():
    """
    Test endpoint for vector store health check.

    Returns:
        dict: Vector store health status
    """
    try:
        health = check_vector_store_health()
        return {
            "success": True,
            **health
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Vector store health check failed: {str(e)}")


@api_router.post("/test/vectorstore/add", tags=["Testing"])
async def test_vectorstore_add(request: VectorStoreAddRequest):
    """
    Test endpoint for adding documents to vector store.

    Args:
        request: Contains texts and optional metadatas

    Returns:
        dict: Contains information about added documents
    """
    try:
        vector_store = get_vector_store()

        # Create documents
        if request.metadatas:
            documents = [
                Document(page_content=text, metadata=meta)
                for text, meta in zip(request.texts, request.metadatas)
            ]
            ids = vector_store.add_documents(documents)
        else:
            ids = vector_store.add_texts(request.texts)

        return {
            "success": True,
            "documents_added": len(ids),
            "ids": ids,
            "message": f"Successfully added {len(ids)} documents to vector store"
        }
    except VectorStoreError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@api_router.post("/test/vectorstore/search", tags=["Testing"])
async def test_vectorstore_search(request: VectorStoreSearchRequest):
    """
    Test endpoint for vector store similarity search.

    Args:
        request: Contains query, k (number of results), and optional game filter

    Returns:
        dict: Contains search results
    """
    try:
        vector_store = get_vector_store()

        # Perform search with or without game filter
        if request.game:
            results = vector_store.search_by_game(
                query=request.query,
                game=request.game,
                k=request.k
            )
        else:
            results = vector_store.similarity_search(
                query=request.query,
                k=request.k
            )

        # Format results
        formatted_results = []
        for doc in results:
            formatted_results.append({
                "content": doc.page_content,
                "metadata": doc.metadata
            })

        return {
            "success": True,
            "query": request.query,
            "game_filter": request.game,
            "results_count": len(results),
            "results": formatted_results,
            "message": f"Found {len(results)} documents"
        }
    except VectorStoreError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


# Include base router with /api prefix
app.include_router(api_router, prefix="/api")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host=settings.server.host,
        port=settings.server.port
    )
