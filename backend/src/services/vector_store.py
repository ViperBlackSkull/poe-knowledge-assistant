"""
Vector store service for POE Knowledge Assistant.
Wraps ChromaDB with LangChain's vector store interface.
"""
import logging
from typing import Any, Dict, List, Optional, Union

from langchain_community.vectorstores import Chroma
from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings

from src.config import get_settings
from src.services.chroma_db import ChromaDBManager, get_chroma_manager
from src.services.embeddings import (
    LocalEmbeddings,
    OpenAIEmbeddings,
    create_embeddings,
)

logger = logging.getLogger(__name__)


class VectorStoreError(Exception):
    """Custom exception for vector store errors."""
    pass


class VectorStore:
    """
    Vector store wrapper that integrates ChromaDB with LangChain.

    This class provides:
    - LangChain-compatible vector store interface
    - Integration with ChromaDBManager for persistence
    - Support for local and OpenAI embeddings
    - Similarity search with optional metadata filtering
    - Game version filtering (poe1, poe2)
    """

    def __init__(
        self,
        collection_name: Optional[str] = None,
        persist_directory: Optional[str] = None,
        embeddings: Optional[Embeddings] = None,
        chroma_manager: Optional[ChromaDBManager] = None,
    ):
        """
        Initialize the vector store.

        Args:
            collection_name: Name of the ChromaDB collection (defaults to config)
            persist_directory: Directory for ChromaDB persistence (defaults to config)
            embeddings: Embeddings instance (defaults to create_embeddings())
            chroma_manager: ChromaDB manager instance (defaults to get_chroma_manager())
        """
        settings = get_settings()

        # Get configuration
        self.collection_name = collection_name or settings.chromadb.collection_name
        self.persist_directory = persist_directory or settings.chromadb.persist_directory

        # Initialize embeddings
        self._embeddings = embeddings or create_embeddings()

        # Initialize ChromaDB manager
        self._chroma_manager = chroma_manager or get_chroma_manager()

        # Initialize LangChain Chroma vector store
        self._vectorstore: Optional[Chroma] = None
        self._initialization_error: Optional[str] = None

        # Initialize the vector store
        self._initialize_vectorstore()

    def _initialize_vectorstore(self) -> None:
        """Initialize the LangChain Chroma vector store."""
        try:
            logger.info(
                f"Initializing LangChain Chroma vector store "
                f"(collection: {self.collection_name})"
            )

            # Create LangChain Chroma vector store
            # This wraps the existing ChromaDB collection
            self._vectorstore = Chroma(
                collection_name=self.collection_name,
                embedding_function=self._embeddings,
                persist_directory=self.persist_directory,
            )

            logger.info("Vector store initialized successfully")

        except Exception as e:
            error_msg = f"Failed to initialize vector store: {str(e)}"
            logger.error(error_msg)
            self._initialization_error = error_msg
            self._vectorstore = None

    @property
    def embeddings(self) -> Embeddings:
        """Get the embeddings instance."""
        return self._embeddings

    @property
    def vectorstore(self) -> Optional[Chroma]:
        """Get the LangChain Chroma vector store."""
        return self._vectorstore

    def is_ready(self) -> bool:
        """
        Check if the vector store is ready for use.

        Returns:
            bool: True if vector store is initialized and ready
        """
        return self._vectorstore is not None

    def similarity_search(
        self,
        query: str,
        k: int = 4,
        filter: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> List[Document]:
        """
        Perform similarity search for relevant documents.

        Args:
            query: The search query text
            k: Number of documents to return (default: 4)
            filter: Optional metadata filter (e.g., {"game": "poe1"})
            **kwargs: Additional arguments passed to the underlying search

        Returns:
            List[Document]: List of relevant documents with content and metadata

        Raises:
            VectorStoreError: If vector store is not initialized or search fails
        """
        if not self.is_ready():
            if self._initialization_error:
                raise VectorStoreError(self._initialization_error)
            raise VectorStoreError("Vector store not initialized")

        if not query or not isinstance(query, str):
            raise VectorStoreError("Query must be a non-empty string")

        try:
            logger.debug(
                f"Performing similarity search (k={k}, filter={filter}): {query[:50]}..."
            )

            # Use LangChain's similarity_search method
            results = self._vectorstore.similarity_search(
                query=query,
                k=k,
                filter=filter,
                **kwargs,
            )

            logger.debug(f"Found {len(results)} documents")
            return results

        except Exception as e:
            error_msg = f"Similarity search failed: {str(e)}"
            logger.error(error_msg)
            raise VectorStoreError(error_msg)

    def similarity_search_with_score(
        self,
        query: str,
        k: int = 4,
        filter: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> List[tuple[Document, float]]:
        """
        Perform similarity search and return documents with relevance scores.

        Args:
            query: The search query text
            k: Number of documents to return (default: 4)
            filter: Optional metadata filter
            **kwargs: Additional arguments passed to the underlying search

        Returns:
            List[Tuple[Document, float]]: List of (document, score) tuples

        Raises:
            VectorStoreError: If vector store is not initialized or search fails
        """
        if not self.is_ready():
            if self._initialization_error:
                raise VectorStoreError(self._initialization_error)
            raise VectorStoreError("Vector store not initialized")

        if not query or not isinstance(query, str):
            raise VectorStoreError("Query must be a non-empty string")

        try:
            logger.debug(
                f"Performing similarity search with score (k={k}, filter={filter}): {query[:50]}..."
            )

            # Use LangChain's similarity_search_with_score method
            results = self._vectorstore.similarity_search_with_score(
                query=query,
                k=k,
                filter=filter,
                **kwargs,
            )

            logger.debug(f"Found {len(results)} documents with scores")
            return results

        except Exception as e:
            error_msg = f"Similarity search with score failed: {str(e)}"
            logger.error(error_msg)
            raise VectorStoreError(error_msg)

    def search_by_game(
        self,
        query: str,
        game: str,
        k: int = 4,
        **kwargs: Any,
    ) -> List[Document]:
        """
        Search for documents filtered by game version (poe1 or poe2).

        Args:
            query: The search query text
            game: Game version filter ("poe1" or "poe2")
            k: Number of documents to return (default: 4)
            **kwargs: Additional arguments passed to the underlying search

        Returns:
            List[Document]: List of relevant documents for the specified game

        Raises:
            VectorStoreError: If game is invalid or search fails
        """
        # Validate game parameter
        if game not in ["poe1", "poe2"]:
            raise VectorStoreError(
                f"Invalid game '{game}'. Must be 'poe1' or 'poe2'"
            )

        # Create metadata filter
        filter_dict = {"game": game}

        return self.similarity_search(
            query=query,
            k=k,
            filter=filter_dict,
            **kwargs,
        )

    def add_documents(
        self,
        documents: List[Document],
        **kwargs: Any,
    ) -> List[str]:
        """
        Add documents to the vector store.

        Args:
            documents: List of Document objects to add
            **kwargs: Additional arguments passed to add_documents

        Returns:
            List[str]: List of document IDs

        Raises:
            VectorStoreError: If vector store is not initialized or addition fails
        """
        if not self.is_ready():
            if self._initialization_error:
                raise VectorStoreError(self._initialization_error)
            raise VectorStoreError("Vector store not initialized")

        if not documents:
            raise VectorStoreError("Documents list cannot be empty")

        try:
            logger.info(f"Adding {len(documents)} documents to vector store")

            # Use LangChain's add_documents method
            ids = self._vectorstore.add_documents(documents, **kwargs)

            logger.info(f"Successfully added {len(ids)} documents")
            return ids

        except Exception as e:
            error_msg = f"Failed to add documents: {str(e)}"
            logger.error(error_msg)
            raise VectorStoreError(error_msg)

    def add_texts(
        self,
        texts: List[str],
        metadatas: Optional[List[Dict[str, Any]]] = None,
        **kwargs: Any,
    ) -> List[str]:
        """
        Add texts to the vector store with optional metadata.

        Args:
            texts: List of text strings to add
            metadatas: Optional list of metadata dicts for each text
            **kwargs: Additional arguments passed to add_texts

        Returns:
            List[str]: List of document IDs

        Raises:
            VectorStoreError: If vector store is not initialized or addition fails
        """
        if not self.is_ready():
            if self._initialization_error:
                raise VectorStoreError(self._initialization_error)
            raise VectorStoreError("Vector store not initialized")

        if not texts:
            raise VectorStoreError("Texts list cannot be empty")

        try:
            logger.info(f"Adding {len(texts)} texts to vector store")

            # Use LangChain's add_texts method
            ids = self._vectorstore.add_texts(
                texts=texts,
                metadatas=metadatas,
                **kwargs,
            )

            logger.info(f"Successfully added {len(ids)} texts")
            return ids

        except Exception as e:
            error_msg = f"Failed to add texts: {str(e)}"
            logger.error(error_msg)
            raise VectorStoreError(error_msg)

    def delete(
        self,
        ids: Optional[List[str]] = None,
        **kwargs: Any,
    ) -> Optional[bool]:
        """
        Delete documents from the vector store.

        Args:
            ids: List of document IDs to delete
            **kwargs: Additional arguments passed to delete

        Returns:
            Optional[bool]: True if deletion was successful

        Raises:
            VectorStoreError: If vector store is not initialized or deletion fails
        """
        if not self.is_ready():
            if self._initialization_error:
                raise VectorStoreError(self._initialization_error)
            raise VectorStoreError("Vector store not initialized")

        try:
            logger.info(f"Deleting {len(ids) if ids else 'all'} documents from vector store")

            # Use LangChain's delete method
            result = self._vectorstore.delete(ids=ids, **kwargs)

            logger.info("Successfully deleted documents")
            return result

        except Exception as e:
            error_msg = f"Failed to delete documents: {str(e)}"
            logger.error(error_msg)
            raise VectorStoreError(error_msg)

    def health_check(self) -> dict:
        """
        Perform a health check on the vector store.

        Returns:
            dict with keys:
                - status: "ready" or "error"
                - collection_name: Name of the collection
                - embeddings_type: Type of embeddings being used
                - message: Description of the status
        """
        result = {
            "status": "error",
            "collection_name": self.collection_name,
            "embeddings_type": type(self._embeddings).__name__,
            "message": "Vector store not initialized",
        }

        if self._initialization_error:
            result["message"] = self._initialization_error
            return result

        if not self.is_ready():
            result["message"] = "Vector store not ready"
            return result

        try:
            # Try to get collection info from ChromaDB manager
            chroma_health = self._chroma_manager.health_check()

            if chroma_health["status"] == "connected":
                result["status"] = "ready"
                result["message"] = (
                    f"Vector store ready with {chroma_health.get('message', 'unknown documents')}"
                )
            else:
                result["message"] = f"ChromaDB not healthy: {chroma_health.get('message', 'unknown error')}"

        except Exception as e:
            result["message"] = f"Health check failed: {str(e)}"

        return result


def get_embeddings(
    provider: Optional[str] = None,
    **kwargs: Any,
) -> Union[LocalEmbeddings, OpenAIEmbeddings]:
    """
    Get embeddings instance based on provider.

    This is a convenience function that wraps create_embeddings()
    for use with the vector store.

    Args:
        provider: Embedding provider to use ('local', 'openai').
                 Defaults to config setting.
        **kwargs: Additional arguments passed to create_embeddings

    Returns:
        Union[LocalEmbeddings, OpenAIEmbeddings]: Embeddings instance

    Example:
        >>> embeddings = get_embeddings()
        >>> vector_store = VectorStore(embeddings=embeddings)
    """
    return create_embeddings(provider=provider, **kwargs)


# Global instance for convenience
_vector_store: Optional[VectorStore] = None


def get_vector_store() -> VectorStore:
    """
    Get the global VectorStore instance.

    Returns:
        VectorStore instance
    """
    global _vector_store
    if _vector_store is None:
        _vector_store = VectorStore()
    return _vector_store


def check_vector_store_health() -> dict:
    """
    Check vector store health status.

    This is a convenience function that gets the global
    VectorStore instance and performs a health check.

    Returns:
        dict with health status information
    """
    vector_store = get_vector_store()
    return vector_store.health_check()


__all__ = [
    "VectorStore",
    "VectorStoreError",
    "get_embeddings",
    "get_vector_store",
    "check_vector_store_health",
]
