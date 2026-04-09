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
    CategoryScraper,
    CategoryItem,
    scrape_category,
    ItemDetailScraper,
    ItemDetail,
    scrape_item_detail,
    detect_game_version,
    detect_game_version_async,
    detect_game_version_model,
    get_version_for_url,
)
from src.services.indexer import (
    ChromaDBIndexer,
    IndexerError,
    get_indexer,
    index_items,
    check_indexer_health,
)
from src.services.job_manager import (
    JobStatus,
    JobType,
    JobPriority,
    ScrapingJob,
    RateLimiter,
    ScrapingJobManager,
    get_job_manager,
    check_job_manager_health,
)
from src.services.scrape_timestamps import (
    ScrapeTimestampStore,
    TimestampStorageError,
    TimestampReadError,
    TimestampWriteError,
    get_timestamp_store,
    get_scrape_timestamps,
    get_scrape_timestamp,
    update_timestamp,
    check_timestamp_storage_health,
)
from src.services.conversation_history import (
    ConversationStore,
    ConversationHistoryError,
    ConversationNotFoundError,
    get_conversation_store,
    reset_conversation_store,
    check_conversation_history_health,
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
    from src.services.scraper.category import __all__ as category_exports
    from src.services.scraper.item_detail import __all__ as item_detail_exports

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
            "category": {
                "file": "category.py",
                "description": "Category page scraper with pagination support",
                "exports": category_exports,
            },
            "item_detail": {
                "file": "item_detail.py",
                "description": "Item detail page scraper for individual items/skills/gems",
                "exports": item_detail_exports,
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


class CategoryScrapeRequest(BaseModel):
    """Request model for category page scraping."""
    category_name: str = Field(
        ...,
        description="Human-readable name of the category (e.g. 'Unique', 'Gem')",
        min_length=1,
        max_length=200,
    )
    url: str = Field(
        ...,
        description="Full URL of the category page on poedb.tw",
    )
    follow_pagination: bool = Field(
        default=True,
        description="Whether to follow pagination links",
    )
    max_pages: int = Field(
        default=10,
        description="Maximum number of pagination pages to scrape",
        ge=1,
        le=50,
    )

    @field_validator("url")
    @classmethod
    def validate_url(cls, v):
        """Validate URL format."""
        if not v.startswith(("http://", "https://")):
            raise ValueError("URL must start with http:// or https://")
        return v

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "category_name": "Unique",
                    "url": "https://poedb.tw/us/Unique",
                    "follow_pagination": True,
                    "max_pages": 10,
                }
            ]
        }
    }


@api_router.post("/test/scraper/category", tags=["Scraper"])
async def test_scraper_category(request: CategoryScrapeRequest):
    """
    Scrape a category index page and extract item/skill links.

    This endpoint uses the :class:`CategoryScraper` to fetch a category
    page from poedb.tw, extract all valid item/skill links, and optionally
    follow pagination to collect items from all pages.

    Returns structured data including:
    - List of items with titles, URLs, and metadata
    - Page title and total item count
    - Number of pages scraped and whether more exist
    """
    try:
        async with CategoryScraper(max_pages=request.max_pages) as scraper:
            result = await scraper.scrape_category(
                category_name=request.category_name,
                url=request.url,
                follow_pagination=request.follow_pagination,
            )

        # Truncate items list for readability in API responses
        items_preview = result.get("items", [])[:20]
        total_items = result.get("total_items", 0)

        return {
            "success": True,
            "category": result.get("category"),
            "url": result.get("url"),
            "page_title": result.get("page_title"),
            "total_items": total_items,
            "pages_scraped": result.get("pages_scraped"),
            "has_more_pages": result.get("has_more_pages"),
            "items_preview": items_preview,
            "items_preview_count": len(items_preview),
            "message": (
                f"Scraped category '{request.category_name}': "
                f"{total_items} items across {result.get('pages_scraped', 0)} page(s)"
            ),
        }
    except ScraperError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@api_router.get("/test/scraper/category/categories", tags=["Scraper"])
async def test_scraper_category_list():
    """
    List known poedb.tw category pages.

    Returns a list of common category names and their URLs on poedb.tw
    that can be used with the ``/test/scraper/category`` endpoint.
    """
    categories = [
        {"name": "Gem", "url": "https://poedb.tw/us/Gem"},
        {"name": "Currency", "url": "https://poedb.tw/us/Currency"},
        {"name": "Map", "url": "https://poedb.tw/us/Map"},
        {"name": "Passive Skill", "url": "https://poedb.tw/us/Passive_Skill"},
        {"name": "Divination Card", "url": "https://poedb.tw/us/Divination_Card"},
        {"name": "Unique Weapon", "url": "https://poedb.tw/us/Unique_Weapon"},
        {"name": "Unique Armour", "url": "https://poedb.tw/us/Unique_Armour"},
        {"name": "Skill Gem", "url": "https://poedb.tw/us/Skill_Gem"},
        {"name": "Support Gem", "url": "https://poedb.tw/us/Support_Gem"},
        {"name": "Boss", "url": "https://poedb.tw/us/Boss"},
        {"name": "Area", "url": "https://poedb.tw/us/Area"},
    ]
    return {
        "success": True,
        "categories": categories,
        "total": len(categories),
        "message": "Known category pages on poedb.tw",
    }


class ItemDetailScrapeRequest(BaseModel):
    """Request model for item detail page scraping."""
    url: str = Field(
        ...,
        description="Full URL of the item detail page on poedb.tw",
    )
    category: str | None = Field(
        default=None,
        description="Optional category name for metadata enrichment",
        max_length=200,
    )

    @field_validator("url")
    @classmethod
    def validate_url(cls, v):
        """Validate URL format."""
        if not v.startswith(("http://", "https://")):
            raise ValueError("URL must start with http:// or https://")
        return v

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "url": "https://poedb.tw/us/Tabula_Rasa",
                    "category": "Unique Body Armour",
                }
            ]
        }
    }


class ItemDetailBatchRequest(BaseModel):
    """Request model for batch item detail page scraping."""
    urls: list[str] = Field(
        ...,
        description="List of item detail page URLs to scrape",
        min_length=1,
        max_length=50,
    )
    category: str | None = Field(
        default=None,
        description="Optional category name applied to all items",
        max_length=200,
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "urls": [
                        "https://poedb.tw/us/Tabula_Rasa",
                        "https://poedb.tw/us/Shavronnes_Wrappings",
                    ],
                    "category": "Unique Body Armour",
                }
            ]
        }
    }


@api_router.post("/test/scraper/item", tags=["Scraper"])
async def test_scraper_item_detail(request: ItemDetailScrapeRequest):
    """
    Scrape a single item detail page from poedb.tw.

    This endpoint uses the :class:`ItemDetailScraper` to fetch an item
    detail page, extract comprehensive structured data including name,
    type, properties, requirements, modifiers, flavour text, image URL,
    tags, categories, and related items.

    Returns structured item data with all extracted fields.
    """
    try:
        async with ItemDetailScraper() as scraper:
            result = await scraper.scrape_item(
                url=request.url,
                category=request.category,
            )

        return {
            "success": True,
            "item": result,
            "message": (
                f"Scraped item '{result.get('name', 'unknown')}' "
                f"(type={result.get('item_type', 'unknown')})"
            ),
        }
    except ScraperError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@api_router.post("/test/scraper/item/batch", tags=["Scraper"])
async def test_scraper_item_detail_batch(request: ItemDetailBatchRequest):
    """
    Scrape multiple item detail pages from poedb.tw.

    This endpoint scrapes multiple item pages sequentially and returns
    aggregated results with success/failure counts.

    Limited to 50 items per request to prevent abuse.
    """
    try:
        async with ItemDetailScraper() as scraper:
            result = await scraper.scrape_items_batch(
                urls=request.urls,
                category=request.category,
            )

        # Truncate items for API response readability
        items_preview = result.get("items", [])[:10]

        return {
            "success": True,
            "total": result.get("total", 0),
            "succeeded": result.get("succeeded", 0),
            "failed": result.get("failed", 0),
            "errors": result.get("errors", []),
            "items_preview": items_preview,
            "items_preview_count": len(items_preview),
            "message": (
                f"Batch scrape complete: "
                f"{result.get('succeeded', 0)}/{result.get('total', 0)} succeeded"
            ),
        }
    except ScraperError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@api_router.get("/test/scraper/item/examples", tags=["Scraper"])
async def test_scraper_item_examples():
    """
    List example item detail page URLs on poedb.tw.

    Returns a list of well-known item pages that can be used with the
    ``/test/scraper/item`` endpoint for testing and demonstration.
    """
    examples = [
        {
            "name": "Tabula Rasa",
            "url": "https://poedb.tw/us/Tabula_Rasa",
            "category": "Unique Body Armour",
            "description": "Simple Tabula Rasa unique item page",
        },
        {
            "name": "Shavronne's Wrappings",
            "url": "https://poedb.tw/us/Shavronnes_Wrappings",
            "category": "Unique Body Armour",
            "description": "Unique item with explicit modifiers",
        },
        {
            "name": "Headhunter",
            "url": "https://poedb.tw/us/Headhunter",
            "category": "Unique Belt",
            "description": "Highly sought-after unique belt",
        },
        {
            "name": "Fireball",
            "url": "https://poedb.tw/us/Fireball",
            "category": "Skill Gem",
            "description": "Active skill gem page",
        },
        {
            "name": "Chaos Orb",
            "url": "https://poedb.tw/us/Chaos_Orb",
            "category": "Currency",
            "description": "Currency item page",
        },
        {
            "name": "The Doctor",
            "url": "https://poedb.tw/us/The_Doctor",
            "category": "Divination Card",
            "description": "Divination card page",
        },
    ]
    return {
        "success": True,
        "examples": examples,
        "total": len(examples),
        "message": "Example item detail pages on poedb.tw",
    }


class GameVersionDetectRequest(BaseModel):
    """Request model for game version detection."""
    url: str = Field(
        ...,
        description="Full URL to detect game version for",
    )
    fetch_content: bool = Field(
        default=False,
        description="If True, fetch the page and use content-based detection. "
                    "If False, only URL-based heuristics are used.",
    )

    @field_validator("url")
    @classmethod
    def validate_url(cls, v):
        """Validate URL format."""
        if not v.startswith(("http://", "https://")):
            raise ValueError("URL must start with http:// or https://")
        return v

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "url": "https://poedb.tw/us/Tabula_Rasa",
                    "fetch_content": False,
                },
                {
                    "url": "https://poe2db.tw/us/Fireball",
                    "fetch_content": True,
                },
            ]
        }
    }


@api_router.post("/test/scraper/game-version", tags=["Scraper"])
async def test_detect_game_version(request: GameVersionDetectRequest):
    """
    Detect whether a URL belongs to PoE1 or PoE2.

    This endpoint analyses the URL structure (domain, path) and optionally
    the page content to determine if the URL points to Path of Exile 1 or
    Path of Exile 2 content.

    When ``fetch_content`` is ``True``, the page is fetched and the HTML
    content is analysed for additional version indicators (page title,
    meta tags, etc.) for more accurate detection.

    Returns:
        dict: Detection result with ``game_version`` ('poe1' or 'poe2'),
        ``url``, ``detection_method``, and optional ``content_signals``.
    """
    try:
        if request.fetch_content:
            version = await detect_game_version_async(request.url)
            method = "url_and_content"
        else:
            version = get_version_for_url(request.url)
            method = "url_only"

        return {
            "success": True,
            "url": request.url,
            "game_version": version,
            "detection_method": method,
            "message": f"Detected {version.upper()} for {request.url}",
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Game version detection failed: {str(e)}",
        )


class GameVersionBatchRequest(BaseModel):
    """Request model for batch game version detection."""
    urls: list[str] = Field(
        ...,
        description="List of URLs to detect game versions for",
        min_length=1,
        max_length=100,
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "urls": [
                        "https://poedb.tw/us/Tabula_Rasa",
                        "https://poe2db.tw/us/Fireball",
                        "https://poedb.tw/us/Headhunter",
                    ],
                }
            ]
        }
    }


@api_router.post("/test/scraper/game-version/batch", tags=["Scraper"])
async def test_detect_game_version_batch(request: GameVersionBatchRequest):
    """
    Detect game versions for multiple URLs at once.

    Accepts a JSON body with a ``urls`` list and returns the detected version
    for each.  Only URL-based detection is used (no page fetching).

    Returns:
        dict: Batch detection results with per-URL versions and summary.
    """
    try:
        results = []
        poe1_count = 0
        poe2_count = 0

        for url in request.urls:
            try:
                version = get_version_for_url(url)
                if version == "poe1":
                    poe1_count += 1
                else:
                    poe2_count += 1
                results.append({
                    "url": url,
                    "game_version": version,
                    "success": True,
                })
            except Exception as exc:
                results.append({
                    "url": url,
                    "game_version": None,
                    "success": False,
                    "error": str(exc),
                })

        return {
            "success": True,
            "results": results,
            "total": len(request.urls),
            "poe1_count": poe1_count,
            "poe2_count": poe2_count,
            "message": (
                f"Detected versions for {len(request.urls)} URLs: "
                f"{poe1_count} PoE1, {poe2_count} PoE2"
            ),
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Batch game version detection failed: {str(e)}",
        )


# ------------------------------------------------------------------
# Job Manager endpoints
# ------------------------------------------------------------------


class AddJobRequest(BaseModel):
    """Request model for adding a scraping job."""
    name: str = Field(
        ...,
        description="Human-readable name for the job",
        min_length=1,
        max_length=200,
    )
    job_type: str = Field(
        default="category",
        description="Type of scraping job: category, item_detail, batch_items, full_category",
    )
    url: Optional[str] = Field(
        default=None,
        description="Target URL for the job",
        max_length=2000,
    )
    priority: int = Field(
        default=5,
        description="Priority level (1=critical, 3=high, 5=normal, 7=low, 10=background)",
        ge=1,
        le=10,
    )
    max_retries: Optional[int] = Field(
        default=None,
        description="Maximum retry attempts (defaults to manager setting)",
        ge=0,
        le=10,
    )
    metadata: Optional[dict] = Field(
        default=None,
        description="Additional metadata for the job",
    )
    urls: Optional[list[str]] = Field(
        default=None,
        description="List of URLs for batch jobs",
        max_length=500,
    )
    game: Optional[str] = Field(
        default=None,
        description="Game version (poe1 or poe2)",
    )
    category: Optional[str] = Field(
        default=None,
        description="Category name for the job",
        max_length=200,
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "name": "Scrape Unique Weapons",
                    "job_type": "category",
                    "url": "https://poedb.tw/us/Unique_Weapon",
                    "priority": 5,
                    "game": "poe1",
                    "category": "Unique Weapon",
                }
            ]
        }
    }


class ListJobsRequest(BaseModel):
    """Request model for listing jobs with optional filters."""
    status: Optional[str] = Field(
        default=None,
        description="Filter by status: pending, running, completed, failed, cancelled",
    )
    job_type: Optional[str] = Field(
        default=None,
        description="Filter by job type: category, item_detail, batch_items, full_category",
    )
    limit: int = Field(
        default=100,
        description="Maximum number of jobs to return",
        ge=1,
        le=500,
    )
    offset: int = Field(
        default=0,
        description="Number of jobs to skip",
        ge=0,
    )


@api_router.get("/jobs/health", tags=["Jobs"])
async def jobs_health():
    """
    Health check for the scraping job manager.

    Returns:
        dict: Job manager health status and statistics.
    """
    try:
        health = check_job_manager_health()
        return {
            "success": True,
            **health,
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Job manager health check failed: {str(e)}",
        )


@api_router.get("/jobs/stats", tags=["Jobs"])
async def jobs_stats():
    """
    Get comprehensive job manager statistics.

    Returns queue size, running jobs, completed/failed counts,
    rate limiter status, and configuration.
    """
    try:
        manager = get_job_manager()
        stats = manager.get_stats()
        return {
            "success": True,
            **stats,
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get job stats: {str(e)}",
        )


@api_router.post("/jobs/add", tags=["Jobs"])
async def jobs_add(request: AddJobRequest):
    """
    Add a new scraping job to the job queue.

    Jobs are processed according to their priority (lower number = higher
    priority). Rate limiting and concurrency controls are applied
    automatically during processing.

    Supported job types:
    - **category**: Scrape a category index page for item links
    - **item_detail**: Scrape a single item detail page
    - **batch_items**: Scrape multiple item detail pages
    - **full_category**: Scrape category + all item details

    The job manager must be started (via ``/jobs/start``) before
    jobs will be processed.
    """
    try:
        manager = get_job_manager()
        result = manager.add_job(
            name=request.name,
            job_type=request.job_type,
            url=request.url,
            priority=request.priority,
            max_retries=request.max_retries,
            metadata=request.metadata,
            urls=request.urls,
            game=request.game,
            category=request.category,
        )
        return {
            "success": True,
            **result,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to add job: {str(e)}",
        )


@api_router.get("/jobs/{job_id}", tags=["Jobs"])
async def jobs_get_status(job_id: str):
    """
    Get the status of a specific job.

    Returns all job details including status, progress, result,
    error (if any), timestamps, and metadata.
    """
    try:
        manager = get_job_manager()
        status = manager.get_job_status(job_id)

        if status is None:
            raise HTTPException(
                status_code=404,
                detail=f"Job '{job_id}' not found",
            )

        return {
            "success": True,
            **status,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get job status: {str(e)}",
        )


@api_router.post("/jobs/list", tags=["Jobs"])
async def jobs_list(request: ListJobsRequest):
    """
    List jobs with optional filtering and pagination.

    Returns a paginated list of jobs. Can be filtered by status
    and/or job type.
    """
    try:
        manager = get_job_manager()
        result = manager.list_jobs(
            status=request.status,
            job_type=request.job_type,
            limit=request.limit,
            offset=request.offset,
        )
        return {
            "success": True,
            **result,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list jobs: {str(e)}",
        )


@api_router.post("/jobs/{job_id}/cancel", tags=["Jobs"])
async def jobs_cancel(job_id: str):
    """
    Cancel a pending or running job.

    Pending jobs are cancelled immediately. Running jobs are
    signalled to stop at the next checkpoint.
    """
    try:
        manager = get_job_manager()
        result = manager.cancel_job(job_id)
        return {
            "success": True,
            **result,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to cancel job: {str(e)}",
        )


@api_router.post("/jobs/start", tags=["Jobs"])
async def jobs_start():
    """
    Start the job processing loop.

    This begins processing jobs from the priority queue. The
    processing loop runs in the background until stopped.
    """
    try:
        manager = get_job_manager()
        await manager.start()
        return {
            "success": True,
            "message": "Job processing started",
            "stats": manager.get_stats(),
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to start job processing: {str(e)}",
        )


@api_router.post("/jobs/stop", tags=["Jobs"])
async def jobs_stop():
    """
    Stop the job processing loop gracefully.

    Currently running jobs are allowed to complete. Pending
    jobs remain in the queue for when processing resumes.
    """
    try:
        manager = get_job_manager()
        await manager.stop()
        return {
            "success": True,
            "message": "Job processing stopped",
            "stats": manager.get_stats(),
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to stop job processing: {str(e)}",
        )


@api_router.post("/jobs/clear", tags=["Jobs"])
async def jobs_clear():
    """
    Clear completed, failed, and cancelled jobs from history.

    Pending and running jobs are not affected.
    """
    try:
        manager = get_job_manager()
        result = manager.clear_completed_jobs()
        return {
            "success": True,
            **result,
            "message": f"Cleared {result['cleared_count']} finished jobs",
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to clear jobs: {str(e)}",
        )


@api_router.get("/jobs/config/info", tags=["Jobs"])
async def jobs_config():
    """
    Get job manager configuration and supported values.

    Returns the current configuration including concurrency limits,
    rate limiting settings, supported job types and statuses.
    """
    try:
        manager = get_job_manager()
        stats = manager.get_stats()

        return {
            "success": True,
            "config": {
                "max_concurrent_jobs": stats["max_concurrent_jobs"],
                "rate_limiter": stats["rate_limiter"],
                "job_timeout_seconds": stats["job_timeout_seconds"],
            },
            "supported_job_types": [t.value for t in JobType],
            "supported_statuses": [s.value for s in JobStatus],
            "priority_levels": {
                "critical": JobPriority.CRITICAL,
                "high": JobPriority.HIGH,
                "normal": JobPriority.NORMAL,
                "low": JobPriority.LOW,
                "background": JobPriority.BACKGROUND,
            },
            "message": "Job manager configuration retrieved successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get job config: {str(e)}",
        )


# ------------------------------------------------------------------
# Scrape Timestamp endpoints
# ------------------------------------------------------------------


@api_router.get("/scrape-timestamps/health", tags=["Scrape Timestamps"])
async def scrape_timestamps_health():
    """
    Health check for the scrape timestamp storage.

    Returns:
        dict: Health status including file path, existence, and size.
    """
    try:
        health = check_timestamp_storage_health()
        return {
            "success": True,
            **health,
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Scrape timestamp health check failed: {str(e)}",
        )


@api_router.get("/scrape-timestamps", tags=["Scrape Timestamps"])
async def scrape_timestamps_get_all():
    """
    Get last scrape timestamps for all game versions.

    Returns the full timestamp record including PoE1 and PoE2 last-scrape
    times, cumulative item/category counts, and associated job IDs.

    Returns:
        dict: Timestamp data for all game versions plus metadata.
    """
    try:
        data = get_scrape_timestamps()
        return {
            "success": True,
            "timestamps": {
                "poe1": data.get("poe1"),
                "poe2": data.get("poe2"),
            },
            "metadata": data.get("metadata"),
            "message": "Scrape timestamps retrieved successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve scrape timestamps: {str(e)}",
        )


@api_router.get("/scrape-timestamps/{game}", tags=["Scrape Timestamps"])
async def scrape_timestamps_get_game(game: str):
    """
    Get the last scrape timestamp for a specific game version.

    Args:
        game: Game version (``'poe1'`` or ``'poe2'``).

    Returns:
        dict: Timestamp data for the requested game version.
    """
    try:
        game_lower = game.lower().strip()
        if game_lower not in ("poe1", "poe2"):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid game version '{game}'. Must be 'poe1' or 'poe2'.",
            )

        data = get_scrape_timestamp(game_lower)
        return {
            "success": True,
            "game": game_lower,
            "timestamp": data,
            "message": f"Scrape timestamp for {game_lower.upper()} retrieved successfully",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve scrape timestamp for {game}: {str(e)}",
        )


class ScrapeTimestampUpdateRequest(BaseModel):
    """Request model for manually updating a scrape timestamp."""
    game: str = Field(
        ...,
        description="Game version ('poe1' or 'poe2')",
    )
    job_id: Optional[str] = Field(
        default=None,
        description="Optional job ID to associate with the timestamp",
    )
    items_scraped: int = Field(
        default=0,
        description="Number of items scraped",
        ge=0,
    )
    categories_scraped: int = Field(
        default=0,
        description="Number of categories scraped",
        ge=0,
    )

    @field_validator("game")
    @classmethod
    def validate_game(cls, v):
        """Validate game version."""
        v_lower = v.lower().strip()
        if v_lower not in ("poe1", "poe2"):
            raise ValueError("Game version must be 'poe1' or 'poe2'")
        return v_lower

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "game": "poe2",
                    "job_id": "job-category-abc12345",
                    "items_scraped": 150,
                    "categories_scraped": 12,
                }
            ]
        }
    }


@api_router.post("/scrape-timestamps/update", tags=["Scrape Timestamps"])
async def scrape_timestamps_update(request: ScrapeTimestampUpdateRequest):
    """
    Manually update the scrape timestamp for a game version.

    This endpoint is typically called automatically by the job manager
    upon successful job completion, but can also be called manually.

    Returns:
        dict: Updated timestamp entry for the game version.
    """
    try:
        result = update_timestamp(
            game=request.game,
            job_id=request.job_id,
            items_scraped=request.items_scraped,
            categories_scraped=request.categories_scraped,
        )
        return {
            "success": True,
            "game": request.game,
            "timestamp": result,
            "message": f"Scrape timestamp for {request.game.upper()} updated successfully",
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except TimestampWriteError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update scrape timestamp: {str(e)}",
        )


class ScrapeTimestampResetRequest(BaseModel):
    """Request model for resetting scrape timestamps."""
    game: Optional[str] = Field(
        default=None,
        description=(
            "Game version to reset ('poe1' or 'poe2'). "
            "If omitted, timestamps for both games are reset."
        ),
    )

    @field_validator("game")
    @classmethod
    def validate_game(cls, v):
        """Validate game version."""
        if v is None:
            return v
        v_lower = v.lower().strip()
        if v_lower not in ("poe1", "poe2"):
            raise ValueError("Game version must be 'poe1' or 'poe2'")
        return v_lower

    model_config = {
        "json_schema_extra": {
            "examples": [
                {"game": "poe1"},
                {"game": None},
            ]
        }
    }


@api_router.post("/scrape-timestamps/reset", tags=["Scrape Timestamps"])
async def scrape_timestamps_reset(request: ScrapeTimestampResetRequest):
    """
    Reset scrape timestamps for a game version or all game versions.

    Args:
        request: Contains optional ``game`` parameter.  If ``None``,
            timestamps for **both** games are reset.

    Returns:
        dict: Confirmation of the reset operation.
    """
    try:
        store = get_timestamp_store()
        if request.game is None:
            data = store.reset_all_timestamps()
            return {
                "success": True,
                "action": "reset_all",
                "timestamps": {
                    "poe1": data.get("poe1"),
                    "poe2": data.get("poe2"),
                },
                "message": "All scrape timestamps have been reset",
            }
        else:
            entry = store.reset_timestamp(request.game)
            return {
                "success": True,
                "action": f"reset_{request.game}",
                "game": request.game,
                "timestamp": entry,
                "message": f"Scrape timestamp for {request.game.upper()} has been reset",
            }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except TimestampWriteError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to reset scrape timestamps: {str(e)}",
        )


# ------------------------------------------------------------------
# Data Freshness endpoint
# ------------------------------------------------------------------


_STALENESS_THRESHOLD_DAYS = 30


def _compute_relative_time(dt: datetime) -> str:
    """
    Compute a human-readable relative time string from a datetime to now.

    Args:
        dt: A timezone-aware datetime in UTC.

    Returns:
        A human-readable string such as ``'2 hours ago'``,
        ``'3 days ago'``, or ``'just now'``.
    """
    now = datetime.now(timezone.utc)
    diff = now - dt
    seconds = int(diff.total_seconds())

    if seconds < 0:
        return "just now"

    intervals = [
        (365 * 24 * 3600, "year"),
        (30 * 24 * 3600, "month"),
        (7 * 24 * 3600, "week"),
        (24 * 3600, "day"),
        (3600, "hour"),
        (60, "minute"),
        (1, "second"),
    ]

    for threshold, label in intervals:
        count = seconds // threshold
        if count >= 1:
            plural = "s" if count != 1 else ""
            return f"{count} {label}{plural} ago"

    return "just now"


def _is_stale(dt: datetime) -> bool:
    """Return True if *dt* is older than the staleness threshold."""
    now = datetime.now(timezone.utc)
    diff = now - dt
    return diff.days > _STALENESS_THRESHOLD_DAYS


def _build_freshness_entry(game: str, data: dict) -> dict:
    """
    Build a freshness entry for a single game version.

    Args:
        game: Game version key (``'poe1'`` or ``'poe2'``).
        data: The raw timestamp dictionary for that game version.

    Returns:
        A dictionary with freshness metadata.
    """
    last_scraped_at = data.get("last_scraped_at")

    if last_scraped_at is None:
        return {
            "game": game,
            "last_scraped_at": None,
            "relative_time": None,
            "is_stale": False,
            "staleness_warning": None,
            "has_data": False,
            "items_scraped": data.get("items_scraped", 0),
            "categories_scraped": data.get("categories_scraped", 0),
            "last_successful_job_id": data.get("last_successful_job_id"),
        }

    # Parse the ISO-8601 timestamp.
    try:
        dt = datetime.fromisoformat(last_scraped_at)
        # Ensure timezone-aware.
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return {
            "game": game,
            "last_scraped_at": last_scraped_at,
            "relative_time": "unknown",
            "is_stale": False,
            "staleness_warning": "Could not parse timestamp",
            "has_data": True,
            "items_scraped": data.get("items_scraped", 0),
            "categories_scraped": data.get("categories_scraped", 0),
            "last_successful_job_id": data.get("last_successful_job_id"),
        }

    relative_time = _compute_relative_time(dt)
    stale = _is_stale(dt)
    warning = None
    if stale:
        warning = (
            f"Data for {game.upper()} is more than "
            f"{_STALENESS_THRESHOLD_DAYS} days old. "
            "Consider running a new scrape to update the knowledge base."
        )

    return {
        "game": game,
        "last_scraped_at": last_scraped_at,
        "relative_time": relative_time,
        "is_stale": stale,
        "staleness_warning": warning,
        "has_data": True,
        "items_scraped": data.get("items_scraped", 0),
        "categories_scraped": data.get("categories_scraped", 0),
        "last_successful_job_id": data.get("last_successful_job_id"),
    }


@api_router.get("/freshness", tags=["Data Freshness"])
async def data_freshness():
    """
    Get data freshness information for all game versions.

    Returns the last scrape timestamp, a human-readable relative time
    (e.g. ``'2 hours ago'``), separate entries for PoE1 and PoE2, and
    a staleness warning when data is older than 30 days.

    When no scrape has occurred yet, the ``relative_time`` field will be
    ``null`` and ``has_data`` will be ``false``.

    Returns:
        dict: Freshness status for both PoE1 and PoE2.
    """
    try:
        all_data = get_scrape_timestamps()

        poe1_entry = _build_freshness_entry("poe1", all_data.get("poe1", {}))
        poe2_entry = _build_freshness_entry("poe2", all_data.get("poe2", {}))

        any_stale = poe1_entry["is_stale"] or poe2_entry["is_stale"]
        any_has_data = poe1_entry["has_data"] or poe2_entry["has_data"]

        return {
            "success": True,
            "freshness": {
                "poe1": poe1_entry,
                "poe2": poe2_entry,
            },
            "summary": {
                "any_stale": any_stale,
                "any_data_available": any_has_data,
                "staleness_threshold_days": _STALENESS_THRESHOLD_DAYS,
            },
            "message": "Data freshness retrieved successfully",
        }
    except Exception as e:
        logger.error("Failed to compute data freshness: %s", e)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve data freshness: {str(e)}",
        )


# ------------------------------------------------------------------
# Admin endpoints
# ------------------------------------------------------------------


# Known category URLs for each game version
_POE1_CATEGORIES: list[dict[str, str]] = [
    {"name": "Unique Weapon", "url": "https://poedb.tw/us/Unique_Weapon"},
    {"name": "Unique Armour", "url": "https://poedb.tw/us/Unique_Armour"},
    {"name": "Unique Accessory", "url": "https://poedb.tw/us/Unique_Accessory"},
    {"name": "Unique Flask", "url": "https://poedb.tw/us/Unique_Flask"},
    {"name": "Unique Jewel", "url": "https://poedb.tw/us/Unique_Jewel"},
    {"name": "Skill Gem", "url": "https://poedb.tw/us/Skill_Gem"},
    {"name": "Support Gem", "url": "https://poedb.tw/us/Support_Gem"},
    {"name": "Currency", "url": "https://poedb.tw/us/Currency"},
    {"name": "Map", "url": "https://poedb.tw/us/Map"},
    {"name": "Divination Card", "url": "https://poedb.tw/us/Divination_Card"},
    {"name": "Boss", "url": "https://poedb.tw/us/Boss"},
    {"name": "Area", "url": "https://poedb.tw/us/Area"},
]

_POE2_CATEGORIES: list[dict[str, str]] = [
    {"name": "Unique Weapon", "url": "https://poe2db.tw/us/Unique_Weapon"},
    {"name": "Unique Armour", "url": "https://poe2db.tw/us/Unique_Armour"},
    {"name": "Unique Accessory", "url": "https://poe2db.tw/us/Unique_Accessory"},
    {"name": "Unique Flask", "url": "https://poe2db.tw/us/Unique_Flask"},
    {"name": "Unique Jewel", "url": "https://poe2db.tw/us/Unique_Jewel"},
    {"name": "Skill Gem", "url": "https://poe2db.tw/us/Skill_Gem"},
    {"name": "Support Gem", "url": "https://poe2db.tw/us/Support_Gem"},
    {"name": "Currency", "url": "https://poe2db.tw/us/Currency"},
    {"name": "Map", "url": "https://poe2db.tw/us/Map"},
    {"name": "Divination Card", "url": "https://poe2db.tw/us/Divination_Card"},
    {"name": "Boss", "url": "https://poe2db.tw/us/Boss"},
    {"name": "Area", "url": "https://poe2db.tw/us/Area"},
]


class ScrapeTriggerRequest(BaseModel):
    """Request model for triggering a scraping job via admin endpoint."""
    game: Optional[str] = Field(
        default=None,
        description=(
            "Game version to scrape: 'poe1', 'poe2', or null/omitted for both. "
            "Must be one of: poe1, poe2."
        ),
    )
    depth: str = Field(
        default="shallow",
        description=(
            "Scraping depth: 'shallow' scrapes category pages only, "
            "'deep' scrapes categories plus all item detail pages."
        ),
    )

    @field_validator("game")
    @classmethod
    def validate_game(cls, v):
        """Validate game parameter."""
        if v is None:
            return v
        v_lower = v.lower().strip()
        if v_lower not in ("poe1", "poe2"):
            raise ValueError(
                f"Invalid game parameter '{v}'. Must be one of: poe1, poe2, or null for both."
            )
        return v_lower

    @field_validator("depth")
    @classmethod
    def validate_depth(cls, v):
        """Validate depth parameter."""
        v_lower = v.lower().strip()
        if v_lower not in ("shallow", "deep"):
            raise ValueError(
                f"Invalid depth parameter '{v}'. Must be 'shallow' or 'deep'."
            )
        return v_lower

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "game": "poe1",
                    "depth": "shallow",
                },
                {
                    "game": "poe2",
                    "depth": "deep",
                },
                {
                    "game": None,
                    "depth": "shallow",
                },
            ]
        }
    }


class ScrapeTriggerResponse(BaseModel):
    """Response model for the scrape trigger endpoint."""
    success: bool = Field(description="Whether the scrape was successfully triggered")
    job_ids: list[str] = Field(description="List of created job IDs")
    games: list[str] = Field(description="List of games being scraped")
    depth: str = Field(description="Scraping depth used")
    total_jobs: int = Field(description="Total number of jobs created")
    status: str = Field(description="Overall status of the trigger request")
    message: str = Field(description="Human-readable status message")


@api_router.post("/admin/scrape", tags=["Admin"], response_model=ScrapeTriggerResponse)
async def admin_scrape_trigger(request: ScrapeTriggerRequest):
    """
    Trigger a knowledge base scraping operation.

    Creates scraping jobs for the specified game(s) and depth level,
    adds them to the job queue, and starts the job processing loop
    asynchronously.

    **Game Parameter**:
    - ``poe1``: Scrape Path of Exile 1 data from poedb.tw
    - ``poe2``: Scrape Path of Exile 2 data from poe2db.tw
    - ``null`` (omit): Scrape both games

    **Depth Parameter**:
    - ``shallow``: Only scrape category index pages to discover item links
    - ``deep``: Scrape category pages AND all individual item detail pages

    The scraping runs asynchronously in the background. Use the returned
    job IDs with the ``/api/jobs/{job_id}`` endpoint to monitor progress.

    Returns:
        ScrapeTriggerResponse with job IDs, games, and status info.
    """
    try:
        manager = get_job_manager()

        # Determine which games to scrape
        if request.game is None:
            games_to_scrape = ["poe1", "poe2"]
        else:
            games_to_scrape = [request.game]

        is_deep = request.depth == "deep"
        job_type = "full_category" if is_deep else "category"

        all_job_ids: list[str] = []

        for game in games_to_scrape:
            categories = _POE1_CATEGORIES if game == "poe1" else _POE2_CATEGORIES

            for cat in categories:
                job_name = (
                    f"{'Deep' if is_deep else 'Shallow'} scrape: "
                    f"{cat['name']} ({game.upper()})"
                )
                result = manager.add_job(
                    name=job_name,
                    job_type=job_type,
                    url=cat["url"],
                    priority=JobPriority.NORMAL,
                    game=game,
                    category=cat["name"],
                    metadata={
                        "depth": request.depth,
                        "trigger_source": "admin_api",
                    },
                )
                all_job_ids.append(result["job_id"])

        # Ensure the job manager processing loop is running
        if not manager._running:
            await manager.start()

        return ScrapeTriggerResponse(
            success=True,
            job_ids=all_job_ids,
            games=games_to_scrape,
            depth=request.depth,
            total_jobs=len(all_job_ids),
            status="started",
            message=(
                f"Scraping triggered for {', '.join(g.upper() for g in games_to_scrape)} "
                f"with {request.depth} depth. {len(all_job_ids)} jobs created."
            ),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Failed to trigger scrape: %s", e)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to trigger scrape: {str(e)}",
        )


# ------------------------------------------------------------------
# Admin scrape status endpoint
# ------------------------------------------------------------------


class ScrapeStatusResponse(BaseModel):
    """Response model for the scrape status endpoint."""
    success: bool = Field(description="Whether the request was successful")
    job_id: str = Field(description="The job identifier")
    status: str = Field(description="Current job status: pending, running, completed, failed, cancelled")
    name: str = Field(default="", description="Human-readable job name")
    job_type: str = Field(default="", description="Type of scraping job")
    game: Optional[str] = Field(default=None, description="Game version being scraped (poe1 or poe2)")
    category: Optional[str] = Field(default=None, description="Current category being scraped")
    url: Optional[str] = Field(default=None, description="Target URL for the job")
    pages_scraped: int = Field(default=0, description="Number of pages scraped so far")
    documents_indexed: int = Field(default=0, description="Number of documents indexed so far")
    items_scraped: int = Field(default=0, description="Number of items scraped")
    categories_scraped: int = Field(default=0, description="Number of categories scraped")
    progress: float = Field(default=0.0, description="Progress percentage (0-100)")
    error: Optional[str] = Field(default=None, description="Error message if the job failed")
    created_at: Optional[str] = Field(default=None, description="ISO 8601 timestamp when the job was created")
    started_at: Optional[str] = Field(default=None, description="ISO 8601 timestamp when the job started")
    completed_at: Optional[str] = Field(default=None, description="ISO 8601 timestamp when the job completed")
    retries: int = Field(default=0, description="Number of retry attempts so far")
    max_retries: int = Field(default=3, description="Maximum number of retries allowed")
    message: str = Field(default="", description="Human-readable status message")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "success": True,
                    "job_id": "job-category-a1b2c3d4",
                    "status": "running",
                    "name": "Shallow scrape: Unique Weapon (POE1)",
                    "job_type": "category",
                    "game": "poe1",
                    "category": "Unique Weapon",
                    "url": "https://poedb.tw/us/Unique_Weapon",
                    "pages_scraped": 3,
                    "documents_indexed": 45,
                    "items_scraped": 45,
                    "categories_scraped": 1,
                    "progress": 75.0,
                    "error": None,
                    "created_at": "2024-01-15T10:00:00+00:00",
                    "started_at": "2024-01-15T10:00:01+00:00",
                    "completed_at": None,
                    "retries": 0,
                    "max_retries": 3,
                    "message": "Job is currently running",
                }
            ]
        }
    }


@api_router.get("/admin/scrape/status", tags=["Admin"], response_model=ScrapeStatusResponse)
async def admin_scrape_status(job_id: str):
    """
    Get the status of a scraping job.

    Accepts a ``job_id`` query parameter and returns detailed status
    information about the scraping job, including progress counts,
    current category, and error details.

    **Status Values**:
    - ``pending``: Job is queued and waiting to be processed
    - ``running``: Job is actively being processed
    - ``completed``: Job finished successfully
    - ``failed``: Job failed (check ``error`` field for details)
    - ``cancelled``: Job was cancelled by a user

    **Query Parameters**:
    - ``job_id`` (required): The job identifier returned by ``POST /api/admin/scrape``

    Returns:
        ScrapeStatusResponse with full job details.

    Raises:
        400: If job_id parameter is missing or empty.
        404: If the specified job_id does not exist.
        500: If an unexpected error occurs.
    """
    if not job_id or not job_id.strip():
        raise HTTPException(
            status_code=400,
            detail="Query parameter 'job_id' is required and cannot be empty",
        )

    try:
        manager = get_job_manager()
        job_data = manager.get_job_status(job_id.strip())

        if job_data is None:
            raise HTTPException(
                status_code=404,
                detail=f"Job '{job_id}' not found",
            )

        # Extract result data for richer status information
        result = job_data.get("result") or {}
        status_val = job_data.get("status", "unknown")

        # Derive pages_scraped and documents_indexed from result
        pages_scraped = 0
        documents_indexed = 0
        if isinstance(result, dict):
            pages_scraped = result.get("pages_scraped", 0)
            documents_indexed = result.get("items_scraped", result.get("items_found", 0))

        # Build a human-readable message based on status
        if status_val == "pending":
            message = f"Job '{job_data.get('name', job_id)}' is queued and waiting to be processed"
        elif status_val == "running":
            message = f"Job '{job_data.get('name', job_id)}' is currently running ({job_data.get('progress', 0):.1f}% complete)"
        elif status_val == "completed":
            message = f"Job '{job_data.get('name', job_id)}' completed successfully"
        elif status_val == "failed":
            message = f"Job '{job_data.get('name', job_id)}' failed: {job_data.get('error', 'Unknown error')}"
        elif status_val == "cancelled":
            message = f"Job '{job_data.get('name', job_id)}' was cancelled"
        else:
            message = f"Job '{job_data.get('name', job_id)}' has status: {status_val}"

        return ScrapeStatusResponse(
            success=True,
            job_id=job_data.get("job_id", job_id),
            status=status_val,
            name=job_data.get("name", ""),
            job_type=job_data.get("job_type", ""),
            game=job_data.get("game"),
            category=job_data.get("category"),
            url=job_data.get("url"),
            pages_scraped=pages_scraped,
            documents_indexed=documents_indexed,
            items_scraped=documents_indexed,
            categories_scraped=1 if status_val == "completed" and job_data.get("job_type") == "category" else 0,
            progress=job_data.get("progress", 0.0),
            error=job_data.get("error"),
            created_at=job_data.get("created_at"),
            started_at=job_data.get("started_at"),
            completed_at=job_data.get("completed_at"),
            retries=job_data.get("retries", 0),
            max_retries=job_data.get("max_retries", 3),
            message=message,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get scrape status for job_id=%s: %s", job_id, e)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get scrape status: {str(e)}",
        )


# ------------------------------------------------------------------
# Indexer endpoints
# ------------------------------------------------------------------


class IndexItemsRequest(BaseModel):
    """Request model for indexing scraped items."""
    items: list[dict] = Field(
        ...,
        description="List of scraped item dictionaries to index",
        min_length=1,
        max_length=500,
    )
    batch_size: int | None = Field(
        default=None,
        description="Override batch size for indexing (default: 100)",
        ge=1,
        le=500,
    )
    upsert: bool = Field(
        default=True,
        description="If True, update existing documents with same ID. "
                    "If False, skip duplicates.",
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "items": [
                        {
                            "name": "Tabula Rasa",
                            "item_type": "armor",
                            "url": "https://poedb.tw/us/Tabula_Rasa",
                            "game": "poe1",
                            "description": "Simple Robe",
                        },
                    ],
                    "upsert": True,
                }
            ]
        }
    }


class IndexSampleRequest(BaseModel):
    """Request model for indexing sample items (for testing)."""
    game: str = Field(
        default="poe2",
        description="Game version for sample items ('poe1' or 'poe2')",
    )
    count: int = Field(
        default=5,
        description="Number of sample items to generate and index",
        ge=1,
        le=50,
    )

    @field_validator("game")
    @classmethod
    def validate_game(cls, v):
        """Validate game version."""
        if v.lower() not in ["poe1", "poe2"]:
            raise ValueError("Game version must be 'poe1' or 'poe2'")
        return v.lower()


class DeleteItemsRequest(BaseModel):
    """Request model for deleting indexed items by URL."""
    urls: list[str] = Field(
        ...,
        description="List of item URLs to delete from the index",
        min_length=1,
        max_length=500,
    )


@api_router.get("/test/indexer/health", tags=["Indexer"])
async def test_indexer_health():
    """
    Check the health of the ChromaDB indexer.

    Verifies that the vector store is ready and returns collection statistics.

    Returns:
        dict: Indexer health status and document count.
    """
    try:
        health = check_indexer_health()
        return {
            "success": True,
            **health,
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Indexer health check failed: {str(e)}",
        )


@api_router.get("/test/indexer/stats", tags=["Indexer"])
async def test_indexer_stats():
    """
    Get indexing statistics from the ChromaDB collection.

    Returns:
        dict: Total documents, collection name, and vector store status.
    """
    try:
        indexer = get_indexer()
        stats = indexer.get_stats()
        return {
            "success": True,
            **stats,
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get indexer stats: {str(e)}",
        )


@api_router.post("/test/indexer/index", tags=["Indexer"])
async def test_indexer_index(request: IndexItemsRequest):
    """
    Index a list of scraped item dictionaries into ChromaDB.

    Each item must have at least a ``name`` field.  The indexer generates
    deterministic document IDs based on the item URL, builds searchable
    document text from all available fields, and creates rich metadata
    including game version, item type, categories, tags, and more.

    When ``upsert`` is ``True`` (default), existing documents with the same
    ID are updated rather than duplicated.

    Returns:
        dict: Indexing results with counts and any errors.
    """
    try:
        result = index_items(
            items=request.items,
            batch_size=request.batch_size,
            upsert=request.upsert,
        )
        return {
            "success": True,
            **result,
            "message": (
                f"Indexed {result['indexed_count']} items, "
                f"skipped {result['skipped_count']} duplicates, "
                f"failed {result['failed_count']}"
            ),
        }
    except IndexerError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Indexing failed: {str(e)}",
        )


@api_router.post("/test/indexer/index-samples", tags=["Indexer"])
async def test_indexer_index_samples(request: IndexSampleRequest):
    """
    Generate and index sample PoE items for testing.

    Creates realistic sample items and indexes them into ChromaDB.
    Useful for testing the indexer and vector search without
    needing to scrape real data.

    Returns:
        dict: Indexing results with sample item details.
    """
    try:
        sample_items = _generate_sample_items(request.game, request.count)
        result = index_items(items=sample_items, upsert=True)

        return {
            "success": True,
            "game": request.game,
            "sample_items_count": len(sample_items),
            "sample_items": [
                {"name": item["name"], "item_type": item["item_type"], "url": item["url"]}
                for item in sample_items
            ],
            **result,
            "message": (
                f"Generated and indexed {result['indexed_count']} sample "
                f"{request.game.upper()} items"
            ),
        }
    except IndexerError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Sample indexing failed: {str(e)}",
        )


@api_router.post("/test/indexer/delete", tags=["Indexer"])
async def test_indexer_delete(request: DeleteItemsRequest):
    """
    Delete indexed items by their source URLs.

    Returns:
        dict: Deletion results with count and any errors.
    """
    try:
        indexer = get_indexer()
        result = indexer.delete_items_by_urls(request.urls)
        return {
            "success": True,
            **result,
            "message": f"Deleted {result['deleted_count']} items",
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Deletion failed: {str(e)}",
        )


@api_router.post("/test/indexer/search", tags=["Indexer"])
async def test_indexer_search(request: VectorStoreSearchRequest):
    """
    Search indexed items in ChromaDB.

    This is a convenience endpoint that searches the same collection
    used by the indexer, with optional game version filtering.

    Returns:
        dict: Search results with document content and metadata.
    """
    try:
        vector_store = get_vector_store()

        if request.game:
            results = vector_store.search_by_game(
                query=request.query,
                game=request.game,
                k=request.k,
            )
        else:
            results = vector_store.similarity_search(
                query=request.query,
                k=request.k,
            )

        formatted = []
        for doc in results:
            formatted.append({
                "content": doc.page_content,
                "metadata": doc.metadata,
            })

        return {
            "success": True,
            "query": request.query,
            "game_filter": request.game,
            "results_count": len(results),
            "results": formatted,
            "message": f"Found {len(results)} matching documents",
        }
    except VectorStoreError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Search failed: {str(e)}",
        )


def _generate_sample_items(game: str, count: int) -> list[dict]:
    """
    Generate sample PoE item dictionaries for testing.

    Args:
        game: Game version ('poe1' or 'poe2').
        count: Number of items to generate.

    Returns:
        List of sample item dictionaries.
    """
    poe1_samples = [
        {
            "name": "Tabula Rasa",
            "item_type": "armor",
            "base_type": "Simple Robe",
            "rarity": "Unique",
            "url": "https://poedb.tw/us/Tabula_Rasa",
            "game": "poe1",
            "description": "Tabula Rasa has 6 linked white sockets.",
            "properties": {
                "Energy Shield": "0",
                "Socket": "6",
                "Link": "6",
            },
            "requirements": {"Level": "1"},
            "tags": ["body_armour", "intelligence", "unique"],
            "categories": ["Unique Body Armour"],
        },
        {
            "name": "Headhunter",
            "item_type": "accessory",
            "base_type": "Leather Belt",
            "rarity": "Unique",
            "url": "https://poedb.tw/us/Headhunter",
            "game": "poe1",
            "description": "When you kill a Rare monster, you gain its mods for 20 seconds.",
            "properties": {
                "Life": "40",
                "Strength": "20",
            },
            "requirements": {"Level": "40"},
            "tags": ["belt", "accessory", "unique"],
            "categories": ["Unique Belt"],
        },
        {
            "name": "Shavronne's Wrappings",
            "item_type": "armor",
            "base_type": "Occultist's Vestment",
            "rarity": "Unique",
            "url": "https://poedb.tw/us/Shavronnes_Wrappings",
            "game": "poe1",
            "description": "Chaos Damage does not bypass Energy Shield.",
            "properties": {
                "Energy Shield": "400-500",
            },
            "requirements": {"Level": "62", "Int": "180"},
            "tags": ["body_armour", "intelligence", "unique"],
            "categories": ["Unique Body Armour"],
        },
        {
            "name": "Fireball",
            "item_type": "gem",
            "url": "https://poedb.tw/us/Fireball",
            "game": "poe1",
            "description": "Fires a projectile that deals fire damage to targets it hits.",
            "properties": {
                "Damage": "100-150",
                "Cast Time": "0.75s",
            },
            "tags": ["fire", "spell", "projectile", "aoe"],
            "categories": ["Skill Gem"],
        },
        {
            "name": "Chaos Orb",
            "item_type": "currency",
            "url": "https://poedb.tw/us/Chaos_Orb",
            "game": "poe1",
            "description": "Reforges a rare item with new random modifiers.",
            "tags": ["currency"],
            "categories": ["Currency"],
        },
    ]

    poe2_samples = [
        {
            "name": "Kalandra's Touch",
            "item_type": "accessory",
            "base_type": "Ring",
            "rarity": "Unique",
            "url": "https://poe2db.tw/us/Kalandras_Touch",
            "game": "poe2",
            "description": "Mirrors the stats and effects of the ring in the other slot.",
            "properties": {
                "Effect": "Mirrored",
            },
            "tags": ["ring", "accessory", "unique"],
            "categories": ["Unique Ring"],
        },
        {
            "name": "Frostbolt",
            "item_type": "gem",
            "url": "https://poe2db.tw/us/Frostbolt",
            "game": "poe2",
            "description": "Fires a slow-moving projectile that pierces through enemies.",
            "properties": {
                "Damage": "80-120",
                "Cast Time": "0.70s",
            },
            "tags": ["cold", "spell", "projectile"],
            "categories": ["Skill Gem"],
        },
        {
            "name": "Searing Touch",
            "item_type": "weapon",
            "base_type": "Staff",
            "rarity": "Unique",
            "url": "https://poe2db.tw/us/Searing_Touch",
            "game": "poe2",
            "description": "Increases fire damage and spell damage significantly.",
            "properties": {
                "Fire Damage": "+30%",
                "Spell Damage": "+40%",
            },
            "tags": ["staff", "weapon", "fire", "unique"],
            "categories": ["Unique Weapon"],
        },
        {
            "name": "Void Sphere",
            "item_type": "gem",
            "url": "https://poe2db.tw/us/Void_Sphere",
            "game": "poe2",
            "description": "Creates a void sphere that damages and pulls enemies.",
            "properties": {
                "Damage": "50-80",
                "Duration": "3s",
            },
            "tags": ["chaos", "spell", "aoe"],
            "categories": ["Skill Gem"],
        },
        {
            "name": "Exalted Orb",
            "item_type": "currency",
            "url": "https://poe2db.tw/us/Exalted_Orb",
            "game": "poe2",
            "description": "Adds a new random modifier to a rare item.",
            "tags": ["currency"],
            "categories": ["Currency"],
        },
    ]

    pool = poe1_samples if game == "poe1" else poe2_samples
    items = []
    for i in range(count):
        item = dict(pool[i % len(pool)])
        # Add a unique suffix for items beyond the pool size to prevent
        # ID collisions when generating more items than available samples
        if i >= len(pool):
            suffix_num = i // len(pool) + 1
            item["name"] = f"{item['name']} #{suffix_num}"
            item["url"] = f"{item['url']}_{suffix_num}"
        items.append(item)

    return items


class ChatApiRequest(BaseModel):
    """
    Request model for POST /api/chat endpoint.

    Accepts a question, game version, and optional build context,
    and returns a streaming SSE response with citations.

    Attributes:
        question: The user's question about Path of Exile
        game_version: Game version to query ('poe1' or 'poe2')
        build_context: Optional build context (e.g., class, ascendancy)
        conversation_id: Optional conversation ID for context continuity
        conversation_history: Optional list of previous messages
    """
    question: str = Field(
        ...,
        description="User's question about Path of Exile",
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

    @field_validator("question")
    @classmethod
    def validate_question(cls, v):
        """Ensure question is not just whitespace."""
        if not v or not v.strip():
            raise ValueError("Question cannot be empty or only whitespace")
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
                    "question": "What are the best skills for a Witch in PoE2?",
                    "game_version": "poe2",
                    "build_context": "Witch - Blood Mage",
                    "conversation_id": "conv-abc123",
                }
            ]
        }
    }


@api_router.post(
    "/chat",
    tags=["Chat"],
    summary="Chat with the POE Knowledge Assistant via SSE streaming",
    response_class=StreamingResponse,
)
async def chat(request: ChatApiRequest):
    """
    Main chat endpoint that accepts a question and returns a streaming
    SSE response with citations to source documents.

    This endpoint:
    1. Validates the incoming request (question, game_version, build_context)
    2. Retrieves relevant documents from the vector store using the RAG chain
    3. Streams the LLM-generated response token by token via SSE
    4. Includes source citations in the response

    SSE Event Types:
        - **sources**: Sent first, contains retrieved source citations with
          relevance scores and source URLs
        - **token**: Sent for each chunk/token of the LLM response
        - **done**: Sent when the full response is complete, includes metadata
        - **error**: Sent if an error occurs at any stage

    Each SSE event follows the format:
        ```
        event: <event_type>
        data: <json_payload>

        ```

    Example SSE stream:
        ```
        event: sources
        data: {"sources": [{"content": "...", "source": "https://poedb.tw/...", "relevance_score": 0.92}], "conversation_id": "conv-abc", "document_count": 3}

        event: token
        data: {"token": "Based", "chunk_index": 1}

        event: token
        data: {"token": " on", "chunk_index": 2}

        event: done
        data: {"conversation_id": "conv-abc", "game": "poe2", "total_chunks": 42, "timestamp": "..."}
        ```

    Args:
        request: ChatApiRequest with question, game_version, and optional context

    Returns:
        StreamingResponse with content-type text/event-stream

    Raises:
        HTTPException 400: If the request body is invalid
        HTTPException 500: If the server encounters an internal error
    """
    logger.info(
        f"Chat request: question='{request.question[:50]}...', "
        f"game_version={request.game_version}, "
        f"build_context={request.build_context}, "
        f"conversation_id={request.conversation_id}"
    )

    return StreamingResponse(
        generate_streaming_response(
            query=request.question,
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


# ---------------------------------------------------------------------------
# Conversation History Endpoints
# ---------------------------------------------------------------------------


@api_router.get(
    "/chat/history/stats",
    tags=["Chat History"],
    summary="Get conversation store statistics",
)
async def get_conversation_stats():
    """
    Get statistics about the conversation history store.

    Returns:
        dict: Store statistics including total conversations, messages, and
              configuration limits
    """
    try:
        store = get_conversation_store()
        stats = store.get_stats()
        return {
            "success": True,
            "data": stats,
            "message": "Conversation store statistics retrieved",
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get conversation stats: {str(e)}",
        )


@api_router.get(
    "/chat/history",
    tags=["Chat History"],
    summary="List all conversations",
)
async def list_conversations():
    """
    List all conversations stored in memory.

    Returns a summary of each conversation including the conversation ID,
    message count, timestamps, and metadata.

    Returns:
        dict: List of conversation summaries
    """
    try:
        store = get_conversation_store()
        conversations = store.list_conversations()
        return {
            "success": True,
            "data": conversations,
            "total": len(conversations),
            "message": "Conversations retrieved successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list conversations: {str(e)}",
        )


@api_router.get(
    "/chat/history/{conversation_id}",
    tags=["Chat History"],
    summary="Get conversation history by ID",
)
async def get_conversation_history(conversation_id: str):
    """
    Retrieve the full conversation history for a given conversation ID.

    Returns all messages in the conversation including their roles, content,
    and timestamps.

    Path Parameters:
        conversation_id: The unique conversation identifier

    Returns:
        dict: Conversation history with messages and metadata

    Raises:
        HTTPException 404: If the conversation is not found
    """
    try:
        store = get_conversation_store()
        conv = store.get_conversation(conversation_id)
        return {
            "success": True,
            "data": {
                "conversation_id": conv.conversation_id,
                "messages": [
                    {
                        "role": msg.role.value,
                        "content": msg.content,
                        "timestamp": msg.timestamp.isoformat(),
                        "metadata": msg.metadata,
                    }
                    for msg in conv.messages
                ],
                "created_at": conv.created_at.isoformat(),
                "updated_at": conv.updated_at.isoformat(),
                "game_version": conv.game_version.value,
                "build_context": conv.build_context,
                "message_count": len(conv.messages),
            },
            "message": "Conversation history retrieved successfully",
        }
    except ConversationNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"Conversation '{conversation_id}' not found",
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get conversation history: {str(e)}",
        )


@api_router.delete(
    "/chat/history/{conversation_id}",
    tags=["Chat History"],
    summary="Delete a conversation by ID",
)
async def delete_conversation(conversation_id: str):
    """
    Delete a conversation and all its messages from the store.

    Path Parameters:
        conversation_id: The unique conversation identifier

    Returns:
        dict: Confirmation of deletion

    Raises:
        HTTPException 404: If the conversation is not found
    """
    try:
        store = get_conversation_store()
        deleted = store.delete_conversation(conversation_id)
        if deleted:
            return {
                "success": True,
                "message": f"Conversation '{conversation_id}' deleted successfully",
            }
        else:
            raise HTTPException(
                status_code=404,
                detail=f"Conversation '{conversation_id}' not found",
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete conversation: {str(e)}",
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
