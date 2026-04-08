"""
Embeddings services for POE Knowledge Assistant.
Provides text embedding functionality using sentence-transformers (local) or OpenAI.
"""
import logging
import os
from typing import List, Optional, Union

from sentence_transformers import SentenceTransformer

from src.config import get_settings, EmbeddingProvider

logger = logging.getLogger(__name__)


class EmbeddingError(Exception):
    """Custom exception for embedding errors."""
    pass


class LocalEmbeddings:
    """
    Local embeddings service using sentence-transformers.

    This class provides:
    - Local embedding generation using sentence-transformers
    - Support for configurable models
    - Batch embedding processing
    - Error handling for model loading and inference
    """

    def __init__(
        self,
        model_name: Optional[str] = None,
    ):
        """
        Initialize the local embeddings service.

        Args:
            model_name: Name of the sentence-transformer model to use.
                       Defaults to config setting (EMBEDDING_MODEL env var or 'all-MiniLM-L6-v2')
        """
        settings = get_settings()

        # Use provided model name or get from config
        self.model_name = model_name or os.getenv(
            "EMBEDDING_MODEL",
            settings.embedding.model
        )

        self._model: Optional[SentenceTransformer] = None
        self._model_error: Optional[str] = None
        self._embedding_dimension: Optional[int] = None

        # Initialize the model
        self._initialize_model()

    def _initialize_model(self) -> None:
        """Initialize the sentence-transformer model."""
        try:
            logger.info(f"Loading sentence-transformer model: {self.model_name}")

            # Load the model
            self._model = SentenceTransformer(self.model_name)

            # Get embedding dimension from the model
            self._embedding_dimension = self._model.get_sentence_embedding_dimension()

            logger.info(
                f"Model loaded successfully. "
                f"Embedding dimension: {self._embedding_dimension}"
            )

        except Exception as e:
            error_msg = f"Failed to load embedding model '{self.model_name}': {str(e)}"
            logger.error(error_msg)
            self._model_error = error_msg
            self._model = None

    @property
    def model(self) -> Optional[SentenceTransformer]:
        """Get the sentence-transformer model instance."""
        return self._model

    @property
    def embedding_dimension(self) -> Optional[int]:
        """Get the embedding dimension."""
        return self._embedding_dimension

    def is_ready(self) -> bool:
        """
        Check if the embedding model is ready for use.

        Returns:
            bool: True if model is loaded and ready, False otherwise
        """
        return self._model is not None

    def embed_query(self, text: str) -> List[float]:
        """
        Generate embedding for a single query text.

        Args:
            text: The text to embed

        Returns:
            List[float]: The embedding vector

        Raises:
            EmbeddingError: If model is not loaded or embedding generation fails
        """
        if not self.is_ready():
            if self._model_error:
                raise EmbeddingError(self._model_error)
            raise EmbeddingError("Embedding model not initialized")

        if not text or not isinstance(text, str):
            raise EmbeddingError("Input text must be a non-empty string")

        try:
            # Generate embedding
            embedding = self._model.encode(text, convert_to_numpy=True)

            # Convert numpy array to list of floats
            return embedding.tolist()

        except Exception as e:
            error_msg = f"Failed to generate embedding: {str(e)}"
            logger.error(error_msg)
            raise EmbeddingError(error_msg)

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """
        Generate embeddings for multiple documents.

        Args:
            texts: List of texts to embed

        Returns:
            List[List[float]]: List of embedding vectors

        Raises:
            EmbeddingError: If model is not loaded or embedding generation fails
        """
        if not self.is_ready():
            if self._model_error:
                raise EmbeddingError(self._model_error)
            raise EmbeddingError("Embedding model not initialized")

        if not texts:
            raise EmbeddingError("Input texts list cannot be empty")

        if not isinstance(texts, list):
            raise EmbeddingError("Input must be a list of strings")

        # Validate all items are strings
        for i, text in enumerate(texts):
            if not isinstance(text, str):
                raise EmbeddingError(f"Item at index {i} is not a string")

        try:
            # Generate embeddings for all texts
            embeddings = self._model.encode(texts, convert_to_numpy=True)

            # Convert numpy array to list of lists
            return embeddings.tolist()

        except Exception as e:
            error_msg = f"Failed to generate embeddings: {str(e)}"
            logger.error(error_msg)
            raise EmbeddingError(error_msg)

    def health_check(self) -> dict:
        """
        Perform a health check on the embeddings service.

        Returns:
            dict with keys:
                - status: "ready" or "error"
                - model_name: Name of the loaded model
                - embedding_dimension: Dimension of embeddings (if model is loaded)
                - message: Description of the status
        """
        result = {
            "status": "error",
            "model_name": self.model_name,
            "embedding_dimension": self._embedding_dimension,
            "message": "Model not initialized",
        }

        if self._model_error:
            result["message"] = self._model_error
            return result

        if not self.is_ready():
            result["message"] = "Model not loaded"
            return result

        try:
            # Try a simple embedding to verify the model works
            test_embedding = self._model.encode("test", convert_to_numpy=True)

            if test_embedding is not None and len(test_embedding) > 0:
                result["status"] = "ready"
                result["message"] = f"Embedding service ready with model {self.model_name}"
            else:
                result["message"] = "Model loaded but embedding test failed"

        except Exception as e:
            result["message"] = f"Health check failed: {str(e)}"

        return result


# Global instance for convenience
_local_embeddings: Optional[LocalEmbeddings] = None


def get_local_embeddings() -> LocalEmbeddings:
    """
    Get the global LocalEmbeddings instance.

    Returns:
        LocalEmbeddings instance
    """
    global _local_embeddings
    if _local_embeddings is None:
        _local_embeddings = LocalEmbeddings()
    return _local_embeddings


def check_embeddings_health() -> dict:
    """
    Check embeddings service health status.

    This is a convenience function that gets the global
    LocalEmbeddings instance and performs a health check.

    Returns:
        dict with health status information
    """
    embeddings = get_local_embeddings()
    return embeddings.health_check()


__all__ = [
    "LocalEmbeddings",
    "EmbeddingError",
    "get_local_embeddings",
    "check_embeddings_health",
]
