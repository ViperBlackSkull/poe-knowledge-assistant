"""
FastAPI application entry point for POE Knowledge Assistant.
"""
import json
import logging
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import FastAPI, APIRouter, Response, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator
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
from src.services.llm_provider import (
    OpenAILLM,
    AnthropicLLM,
    OllamaLLM,
    LMStudioLLM,
    LLMProviderError,
    create_llm,
    check_llm_health,
)
from src.services.streaming import (
    StreamingError,
    generate_streaming_response,
    check_streaming_health,
)
from src.services.scraper import (
    ScraperError,
    ScraperConnectionError,
    ScraperHTTPError,
    ScraperRateLimitError,
    ScraperParsingError,
    ScraperTimeoutError,
    HTTPClient,
    DEFAULT_BASE_URL,
    BaseScraper,
    ScrapeResult,
    ScrapeBatchResult,
    SimpleScraper,
    check_scraper_health,
    SELECTORS,
    extract_page_title,
    extract_item_name,
    extract_stats,
    extract_flavor_text,
    extract_requirements,
    extract_image_url,
    extract_links,
    extract_table_data,
)
from langchain_core.documents import Document

logger = logging.getLogger(__name__)

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


class CreateLLMRequest(BaseModel):
    """Request model for testing the LLM provider factory."""
    provider: str = "openai"
    api_key: str | None = None
    model_name: str | None = None
    temperature: float | None = None
    max_tokens: int | None = None
    base_url: str | None = None


class LLMGenerateRequest(BaseModel):
    """Request model for testing LLM generation."""
    provider: str = "openai"
    api_key: str | None = None
    model_name: str | None = None
    prompt: str = "Hello! What is Path of Exile?"
    system_prompt: str | None = None


class ChatStreamRequest(BaseModel):
    """
    Request model for streaming chat endpoint.

    Attributes:
        message: The user's message / question
        game_version: Game version to query ('poe1' or 'poe2')
        build_context: Optional build context for personalized responses
        conversation_id: Optional conversation ID for context continuity
        conversation_history: Optional list of previous messages with role and content
    """
    message: str = Field(
        ...,
        description="User's message content",
        min_length=1,
        max_length=10000,
    )
    game_version: str = Field(
        default="poe2",
        description="Game version to query ('poe1' or 'poe2')",
    )
    build_context: Optional[str] = Field(
        default=None,
        description="Optional build context (e.g., class, ascendancy)",
        max_length=500,
    )
    conversation_id: Optional[str] = Field(
        default=None,
        description="Optional conversation ID for maintaining context",
        max_length=100,
    )
    conversation_history: Optional[List[dict]] = Field(
        default=None,
        description="Optional list of previous messages with 'role' and 'content' keys",
    )

    @field_validator("message")
    @classmethod
    def validate_message(cls, v):
        """Ensure message is not just whitespace."""
        if not v or not v.strip():
            raise ValueError("Message cannot be empty or only whitespace")
        return v.strip()

    @field_validator("game_version")
    @classmethod
    def validate_game_version(cls, v):
        """Validate game version."""
        if v.lower() not in ["poe1", "poe2"]:
            raise ValueError("Game version must be 'poe1' or 'poe2'")
        return v.lower()

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "message": "What are the best skills for a Witch in PoE2?",
                    "game_version": "poe2",
                    "build_context": "Witch - Blood Mage",
                    "conversation_id": "conv-abc123",
                    "conversation_history": [
                        {"role": "user", "content": "Hello!"},
                        {"role": "assistant", "content": "Hi! How can I help you?"}
                    ],
                }
            ]
        }
    }


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


@api_router.get("/test/llm/health", tags=["Testing"])
async def test_llm_health():
    """
    Test endpoint for LLM provider health check.

    Returns:
        dict: LLM provider health status
    """
    try:
        health = check_llm_health()
        return {
            "success": True,
            **health
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM health check failed: {str(e)}")


@api_router.post("/test/llm/factory", tags=["Testing"])
async def test_llm_factory(request: CreateLLMRequest):
    """
    Test endpoint for the LLM provider factory function.

    This endpoint tests the create_llm factory function which creates
    the appropriate LLM provider instance based on the provider parameter.

    Args:
        request: Contains provider and optional configuration parameters

    Returns:
        dict: Contains information about the created LLM provider instance
    """
    try:
        # Prepare kwargs for factory function
        kwargs = {}
        if request.api_key:
            kwargs['api_key'] = request.api_key
        if request.model_name:
            kwargs['model_name'] = request.model_name
        if request.temperature is not None:
            kwargs['temperature'] = request.temperature
        if request.max_tokens:
            kwargs['max_tokens'] = request.max_tokens
        if request.base_url:
            kwargs['base_url'] = request.base_url

        # Create LLM using factory function
        llm = create_llm(provider=request.provider, **kwargs)

        # Determine the type
        provider_type = llm.provider_name

        # Get basic info
        result = {
            "success": True,
            "provider_requested": request.provider,
            "provider_created": provider_type,
            "model_name": llm.model_name,
            "is_ready": llm.is_ready(),
        }

        # Add provider-specific info
        health = llm.health_check()
        result["health"] = health
        result["message"] = health.get("message", "No message")

        return result

    except LLMProviderError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@api_router.post("/test/llm/providers", tags=["Testing"])
async def test_llm_providers():
    """
    Test endpoint that lists all available LLM providers.

    Returns:
        dict: Information about all supported providers and their default config
    """
    from src.config import LLMProvider as LLMProviderEnum

    settings = get_settings()

    providers = []
    for p in LLMProviderEnum:
        providers.append({
            "name": p.value,
            "is_default": p == settings.llm.provider,
        })

    return {
        "success": True,
        "available_providers": providers,
        "default_provider": settings.llm.provider.value,
        "default_model_by_provider": {
            "openai": settings.llm.openai_model,
            "anthropic": settings.llm.anthropic_model,
            "ollama": settings.llm.ollama_model,
            "lmstudio": settings.llm.lmstudio_model,
        },
    }


@api_router.get("/test/scraper/health", tags=["Scraper"])
async def test_scraper_health():
    """
    Health check for the scraper HTTP client.

    Verifies connectivity to poedb.tw.

    Returns:
        dict: Scraper health status including response time.
    """
    try:
        health = await check_scraper_health()
        return {
            "success": True,
            **health,
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Scraper health check failed: {str(e)}",
        )


class ScraperFetchRequest(BaseModel):
    """Request model for scraper fetch test."""
    path: str = Field(
        default="/",
        description="Relative URL path to fetch from poedb.tw",
        max_length=500,
    )


@api_router.post("/test/scraper/fetch", tags=["Scraper"])
async def test_scraper_fetch(request: ScraperFetchRequest):
    """
    Test endpoint for fetching a single page from poedb.tw.

    This endpoint uses the synchronous SimpleScraper to fetch a page
    and return basic information about the response.

    Args:
        request: Contains the path to fetch.

    Returns:
        dict: Contains fetch result including URL, success status, timing,
              and basic page info (title, html length).
    """
    try:
        scraper = SimpleScraper()
        result = scraper.fetch(request.path)

        response = {
            "success": result.success,
            "url": result.url,
            "elapsed_s": round(result.elapsed_s, 3),
        }

        if result.success and result.soup:
            title_tag = result.soup.find("title")
            response["page_title"] = title_tag.get_text(strip=True) if title_tag else None
            response["html_length"] = len(result.html) if result.html else 0
            response["message"] = "Page fetched successfully"
        else:
            response["error"] = result.error
            response["message"] = f"Failed to fetch page: {result.error}"

        return response

    except ScraperError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@api_router.post("/test/scraper/fetch-async", tags=["Scraper"])
async def test_scraper_fetch_async(request: ScraperFetchRequest):
    """
    Test endpoint for async-fetching a single page from poedb.tw.

    Uses the async HTTPClient to fetch a page and return structured
    information including parsed HTML metadata.

    Args:
        request: Contains the path to fetch.

    Returns:
        dict: Contains fetch result with timing, page title, HTML length,
              and HTTP client configuration details.
    """
    try:
        async with HTTPClient() as client:
            html = await client.get(request.path)
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(html, "lxml")
            title_tag = soup.find("title")

            return {
                "success": True,
                "url": f"{DEFAULT_BASE_URL}{request.path}",
                "page_title": title_tag.get_text(strip=True) if title_tag else None,
                "html_length": len(html),
                "message": "Page fetched successfully with async client",
                "client_config": {
                    "base_url": client.base_url,
                    "timeout": client.timeout,
                    "max_retries": client.max_retries,
                    "rate_limit_delay": client.rate_limit_delay,
                    "user_agent": client.user_agent,
                },
            }
    except ScraperError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@api_router.get("/test/scraper/config", tags=["Scraper"])
async def test_scraper_config():
    """
    Get the scraper configuration from application settings.

    Returns:
        dict: Current scraper configuration values.
    """
    settings = get_settings()
    return {
        "success": True,
        "scraper_config": {
            "base_url": DEFAULT_BASE_URL,
            "rate_limit_delay": settings.scraper.rate_limit_delay,
            "max_retries": settings.scraper.max_retries,
            "timeout": settings.scraper.timeout,
            "user_agent": settings.scraper.user_agent,
            "concurrent_requests": settings.scraper.concurrent_requests,
        },
        "message": "Scraper configuration retrieved successfully",
    }


@api_router.get("/test/scraper/modules", tags=["Scraper"])
async def test_scraper_modules():
    """
    List all modules and exports in the scraper package.

    This endpoint is useful for verifying that the scraper base module
    structure is complete and all components are importable.

    Returns:
        dict: Module structure, exported classes/functions, and version info.
    """
    from src.services.scraper import __all__ as scraper_exports
    from src.services.scraper.exceptions import __all__ as exception_exports
    from src.services.scraper.http_client import __all__ as http_exports
    from src.services.scraper.base import __all__ as base_exports
    from src.services.scraper.parsers import __all__ as parser_exports

    return {
        "success": True,
        "scraper_modules": {
            "exceptions": {
                "file": "exceptions.py",
                "description": "Custom exception hierarchy for scraper errors",
                "exports": exception_exports,
            },
            "http_client": {
                "file": "http_client.py",
                "description": "Async HTTP client with retries, rate limiting, and session management",
                "exports": http_exports,
            },
            "base": {
                "file": "base.py",
                "description": "Abstract BaseScraper, ScrapeResult, ScrapeBatchResult, SimpleScraper",
                "exports": base_exports,
            },
            "parsers": {
                "file": "parsers.py",
                "description": "DOM parsing utilities for poedb.tw pages",
                "exports": parser_exports,
            },
        },
        "total_exports": len(scraper_exports),
        "all_exports": scraper_exports,
        "message": "Scraper module structure retrieved successfully",
    }


@api_router.post("/test/scraper/parse", tags=["Scraper"])
async def test_scraper_parse(request: ScraperFetchRequest):
    """
    Test endpoint for fetching a page from poedb.tw and running DOM parsers on it.

    This endpoint fetches a page, parses it, and runs the DOM parsing
    utilities to extract structured information.

    Args:
        request: Contains the path to fetch and parse.

    Returns:
        dict: Contains parsed page data including title, links, images,
              tables, stats, and requirements extracted by the parsers.
    """
    try:
        async with HTTPClient() as client:
            html = await client.get(request.path)
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(html, "lxml")

            return {
                "success": True,
                "url": f"{DEFAULT_BASE_URL}{request.path}",
                "html_length": len(html),
                "parsed_data": {
                    "page_title": extract_page_title(soup),
                    "item_name": extract_item_name(soup),
                    "image_url": extract_image_url(soup),
                    "flavor_text": extract_flavor_text(soup),
                    "stats": extract_stats(soup),
                    "requirements": extract_requirements(soup),
                    "links_count": len(extract_links(soup)),
                    "tables_count": len(extract_table_data(soup)),
                },
                "message": "Page fetched and parsed successfully",
            }
    except ScraperError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@api_router.post(
    "/chat/stream",
    tags=["Chat"],
    summary="Stream a chat response via Server-Sent Events",
    response_class=StreamingResponse,
)
async def chat_stream(request: ChatStreamRequest):
    """
    Stream a chat response using Server-Sent Events (SSE).

    This endpoint retrieves relevant context via the RAG chain, then streams
    the LLM-generated response token by token in SSE format.

    SSE Event Types:
        - **sources**: Sent first, contains retrieved source citations
        - **token**: Sent for each chunk/token of the LLM response
        - **done**: Sent when the full response is complete
        - **error**: Sent if an error occurs at any stage

    Each event follows the format:
        ```
        event: <event_type>
        data: <json_payload>
        ```

    Example SSE stream:
        ```
        event: sources
        data: {"sources": [...], "conversation_id": "conv-abc", "document_count": 3}

        event: token
        data: {"token": "Based", "chunk_index": 1}

        event: token
        data: {"token": " on", "chunk_index": 2}

        event: done
        data: {"conversation_id": "conv-abc", "game": "poe2", "total_chunks": 42, "timestamp": "..."}
        ```

    Args:
        request: ChatStreamRequest with message, game_version, and optional context

    Returns:
        StreamingResponse with content-type text/event-stream
    """
    logger.info(
        f"Stream chat request: message='{request.message[:50]}...', "
        f"game={request.game_version}, conversation_id={request.conversation_id}"
    )

    return StreamingResponse(
        generate_streaming_response(
            query=request.message,
            game=request.game_version,
            build_context=request.build_context,
            conversation_id=request.conversation_id,
            conversation_history=request.conversation_history,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@api_router.get("/chat/stream/health", tags=["Chat"])
async def chat_stream_health():
    """
    Health check for the streaming chat service.

    Checks that all dependencies (RAG chain, LLM provider) are ready
    for streaming responses.

    Returns:
        dict: Streaming service health status
    """
    try:
        health = check_streaming_health()
        return {
            "success": True,
            **health,
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Streaming service health check failed: {str(e)}",
        )


# Include base router with /api prefix
app.include_router(api_router, prefix="/api")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host=settings.server.host,
        port=settings.server.port
    )
