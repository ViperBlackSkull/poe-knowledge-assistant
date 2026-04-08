"""
FastAPI application entry point for POE Knowledge Assistant.
"""
from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from src.config import get_settings
from src.services.chroma_db import check_chromadb_health

# Get settings instance
settings = get_settings()

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
async def health_check():
    """
    Health check endpoint.

    Returns:
        dict: Health status including:
            - status: Overall health status ("healthy" or "degraded")
            - chromadb_status: ChromaDB connection status ("connected" or "disconnected")
            - version: Application version
            - chromadb_message: Detailed ChromaDB status message
    """
    # Check ChromaDB health
    chromadb_health = check_chromadb_health()
    chromadb_status = chromadb_health.get("status", "disconnected")
    chromadb_message = chromadb_health.get("message", "Unknown status")

    # Determine overall status
    # System is "healthy" if ChromaDB is connected, "degraded" otherwise
    overall_status = "healthy" if chromadb_status == "connected" else "degraded"

    return {
        "status": overall_status,
        "chromadb_status": chromadb_status,
        "version": settings.app_version,
        "chromadb_message": chromadb_message,
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


# Include base router with /api prefix
app.include_router(api_router, prefix="/api")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host=settings.server.host,
        port=settings.server.port
    )
