"""
Services module for POE Knowledge Assistant.
Contains business logic and external service integrations.
"""

from src.services.chroma_db import (
    ChromaDBManager,
    ChromaDBError,
    get_chroma_manager,
    check_chromadb_health,
)
from src.services.embeddings import (
    LocalEmbeddings,
    OpenAIEmbeddings,
    EmbeddingError,
    get_local_embeddings,
    check_embeddings_health,
    create_embeddings,
)

__all__ = [
    "ChromaDBManager",
    "ChromaDBError",
    "get_chroma_manager",
    "check_chromadb_health",
    "LocalEmbeddings",
    "OpenAIEmbeddings",
    "EmbeddingError",
    "get_local_embeddings",
    "check_embeddings_health",
    "create_embeddings",
]
