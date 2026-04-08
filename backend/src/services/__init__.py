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
from src.services.vector_store import (
    VectorStore,
    VectorStoreError,
    get_embeddings,
    get_vector_store,
    check_vector_store_health,
)
from src.services.rag_chain import (
    RAGChain,
    RAGChainError,
    Citation,
    RetrievalResult,
    get_rag_chain,
    check_rag_chain_health,
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
    "VectorStore",
    "VectorStoreError",
    "get_embeddings",
    "get_vector_store",
    "check_vector_store_health",
    "RAGChain",
    "RAGChainError",
    "Citation",
    "RetrievalResult",
    "get_rag_chain",
    "check_rag_chain_health",
]
