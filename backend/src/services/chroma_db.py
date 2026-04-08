"""
ChromaDB service for POE Knowledge Assistant.
Manages vector database connection and operations.
"""
import logging
from pathlib import Path
from typing import Optional

import chromadb
from chromadb.config import Settings as ChromaSettings

from src.config import get_settings

logger = logging.getLogger(__name__)


class ChromaDBError(Exception):
    """Custom exception for ChromaDB errors."""
    pass


class ChromaDBManager:
    """
    Manages ChromaDB connection and collection management.

    This class provides:
    - Persistent ChromaDB client initialization
    - Collection management
    - Health check functionality
    """

    def __init__(
        self,
        persist_directory: Optional[str] = None,
        collection_name: Optional[str] = None,
    ):
        """
        Initialize ChromaDB manager.

        Args:
            persist_directory: Directory for ChromaDB persistence (defaults to config)
            collection_name: Name of the collection (defaults to config)
        """
        settings = get_settings()

        self.persist_directory = persist_directory or settings.chromadb.persist_directory
        self.collection_name = collection_name or settings.chromadb.collection_name

        self._client: Optional[chromadb.Client] = None
        self._collection: Optional[chromadb.Collection] = None
        self._connection_error: Optional[str] = None

        # Initialize the client
        self._initialize_client()

    def _ensure_persistence_directory(self) -> None:
        """Ensure the persistence directory exists."""
        persist_path = Path(self.persist_directory)
        if not persist_path.exists():
            logger.info(f"Creating ChromaDB persistence directory: {self.persist_directory}")
            persist_path.mkdir(parents=True, exist_ok=True)

    def _initialize_client(self) -> None:
        """Initialize the ChromaDB client."""
        try:
            # Ensure directory exists
            self._ensure_persistence_directory()

            # Create persistent client
            self._client = chromadb.PersistentClient(
                path=str(self.persist_directory),
                settings=ChromaSettings(
                    anonymized_telemetry=False,
                    allow_reset=True,
                )
            )

            logger.info(f"ChromaDB client initialized with persist_directory: {self.persist_directory}")

            # Try to get or create the collection
            try:
                self._collection = self._client.get_or_create_collection(
                    name=self.collection_name
                )
                logger.info(f"Collection '{self.collection_name}' ready")
            except Exception as e:
                logger.error(f"Failed to initialize collection: {e}")
                self._connection_error = str(e)

        except Exception as e:
            logger.error(f"Failed to initialize ChromaDB client: {e}")
            self._connection_error = str(e)
            self._client = None

    @property
    def client(self) -> Optional[chromadb.Client]:
        """Get the ChromaDB client."""
        return self._client

    @property
    def collection(self) -> Optional[chromadb.Collection]:
        """Get the ChromaDB collection."""
        if self._collection is None and self._client is not None:
            try:
                self._collection = self._client.get_or_create_collection(
                    name=self.collection_name
                )
            except Exception as e:
                logger.error(f"Failed to get collection: {e}")
        return self._collection

    def health_check(self) -> dict:
        """
        Perform a health check on ChromaDB.

        Returns:
            dict with keys:
                - status: "connected" or "disconnected"
                - message: Description of the status
                - collection_name: Name of the collection
        """
        result = {
            "status": "disconnected",
            "message": "ChromaDB not initialized",
            "collection_name": self.collection_name,
        }

        if self._connection_error:
            result["message"] = f"Connection error: {self._connection_error}"
            return result

        if self._client is None:
            result["message"] = "ChromaDB client not initialized"
            return result

        try:
            # Try to heartbeat the client
            self._client.heartbeat()

            # Try to access the collection
            if self._collection is not None:
                # Try a simple operation
                count = self._collection.count()
                result["status"] = "connected"
                result["message"] = f"ChromaDB healthy, {count} documents in collection"
            else:
                result["status"] = "connected"
                result["message"] = "ChromaDB client healthy, collection not initialized"

        except Exception as e:
            result["message"] = f"Health check failed: {str(e)}"
            logger.error(f"ChromaDB health check failed: {e}")

        return result

    def reset_collection(self) -> None:
        """Delete and recreate the collection."""
        if self._client is None:
            raise ChromaDBError("Client not initialized")

        try:
            # Delete existing collection
            try:
                self._client.delete_collection(name=self.collection_name)
                logger.info(f"Deleted collection: {self.collection_name}")
            except Exception:
                # Collection might not exist
                pass

            # Create new collection
            self._collection = self._client.create_collection(
                name=self.collection_name
            )
            logger.info(f"Created new collection: {self.collection_name}")

        except Exception as e:
            logger.error(f"Failed to reset collection: {e}")
            raise ChromaDBError(f"Failed to reset collection: {e}")


# Global instance for health checks
_chroma_manager: Optional[ChromaDBManager] = None


def get_chroma_manager() -> ChromaDBManager:
    """
    Get the global ChromaDB manager instance.

    Returns:
        ChromaDBManager instance
    """
    global _chroma_manager
    if _chroma_manager is None:
        _chroma_manager = ChromaDBManager()
    return _chroma_manager


def check_chromadb_health() -> dict:
    """
    Check ChromaDB health status.

    This is a convenience function that gets the global
    ChromaDB manager and performs a health check.

    Returns:
        dict with health status information
    """
    manager = get_chroma_manager()
    return manager.health_check()


__all__ = [
    "ChromaDBManager",
    "ChromaDBError",
    "get_chroma_manager",
    "check_chromadb_health",
]
