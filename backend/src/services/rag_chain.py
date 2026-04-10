"""
RAG retrieval chain for POE Knowledge Assistant.
Provides retrieval-augmented generation with game version filtering
and build context integration.
"""
import logging
from typing import Any, Dict, List, Optional

from langchain_core.documents import Document

from src.config import get_settings
from src.services.vector_store import VectorStore, VectorStoreError, get_vector_store

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Build context configuration
# ---------------------------------------------------------------------------

BUILD_CONTEXT_DESCRIPTIONS: Dict[str, str] = {
    "standard": "Standard league softcore economy. Focus on general meta builds and strategies.",
    "budget": "Budget / starter-friendly builds. Prioritize low-cost items and accessible strategies.",
    "hc": "Hardcore league where death is permanent. Focus on defensive layers, survivability, and safe playstyles.",
    "ssf": "Solo Self-Found. No trading allowed. Focus on crafting, self-found gear, and independence from trade.",
    "ruthless": "Ruthless mode with extreme scarcity. Focus on minimal resources and careful itemization.",
    "pvp": "Player versus player combat. Focus on PvP-oriented builds, skills, and gear.",
}

BUILD_CONTEXT_QUERY_ENHANCEMENTS: Dict[str, str] = {
    "standard": "standard softcore meta",
    "budget": "budget cheap starter low-cost affordable",
    "hc": "hardcore HC defensive survivable safe tanky",
    "ssf": "SSF solo self-found self craft non-trade",
    "ruthless": "ruthless scarce limited minimal",
    "pvp": "PvP player versus player arena duel",
}


class RAGChainError(Exception):
    """Custom exception for RAG chain errors."""
    pass


class Citation:
    """
    Represents a citation extracted from a source document.

    Attributes:
        content: The text content from the source
        source: The source identifier (URL, filename, etc.)
        relevance_score: Similarity score (0-1)
        metadata: Additional metadata from the document
    """

    def __init__(
        self,
        content: str,
        source: str,
        relevance_score: float = 0.0,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        """
        Initialize a citation.

        Args:
            content: The text content from the source
            source: The source identifier
            relevance_score: Similarity score (0-1)
            metadata: Additional metadata
        """
        self.content = content
        self.source = source
        self.relevance_score = relevance_score
        self.metadata = metadata or {}

    def to_dict(self) -> Dict[str, Any]:
        """Convert citation to dictionary format."""
        return {
            "content": self.content,
            "source": self.source,
            "relevance_score": self.relevance_score,
            "metadata": self.metadata,
        }

    def __repr__(self) -> str:
        return f"Citation(source={self.source}, score={self.relevance_score:.3f})"


class RetrievalResult:
    """
    Result from RAG retrieval operation.

    Attributes:
        query: The original query
        game: The game version filter used
        documents: Retrieved documents
        citations: Extracted citations
        build_context: Build context if provided
    """

    def __init__(
        self,
        query: str,
        game: str,
        documents: List[Document],
        citations: List[Citation],
        build_context: Optional[str] = None,
    ):
        """
        Initialize retrieval result.

        Args:
            query: The original query
            game: Game version filter
            documents: Retrieved documents
            citations: Extracted citations
            build_context: Build context if provided
        """
        self.query = query
        self.game = game
        self.documents = documents
        self.citations = citations
        self.build_context = build_context

    def to_dict(self) -> Dict[str, Any]:
        """Convert result to dictionary format."""
        return {
            "query": self.query,
            "game": self.game,
            "documents": [
                {"content": doc.page_content, "metadata": doc.metadata}
                for doc in self.documents
            ],
            "citations": [c.to_dict() for c in self.citations],
            "build_context": self.build_context,
            "document_count": len(self.documents),
        }

    def get_context_text(self, separator: str = "\n\n") -> str:
        """
        Get combined context text from all documents.

        Args:
            separator: Separator between documents

        Returns:
            Combined text from all documents
        """
        return separator.join([doc.page_content for doc in self.documents])


class RAGChain:
    """
    RAG retrieval chain with game filtering capabilities.

    This class provides:
    - Document retrieval from ChromaDB vector store
    - Game version filtering (poe1, poe2)
    - Build context integration
    - Citation extraction from source documents
    - Configurable top-k results
    """

    def __init__(
        self,
        vector_store: Optional[VectorStore] = None,
        default_top_k: Optional[int] = None,
    ):
        """
        Initialize the RAG chain.

        Args:
            vector_store: VectorStore instance (defaults to get_vector_store())
            default_top_k: Default number of results to retrieve (defaults to config)
        """
        settings = get_settings()

        # Initialize vector store
        self._vector_store = vector_store or get_vector_store()

        # Get default top-k from config or parameter
        self._default_top_k = default_top_k or settings.rag.top_k_results

        logger.info(
            f"RAGChain initialized with default_top_k={self._default_top_k}"
        )

    @property
    def vector_store(self) -> VectorStore:
        """Get the vector store instance."""
        return self._vector_store

    @property
    def default_top_k(self) -> int:
        """Get the default top-k value."""
        return self._default_top_k

    def _validate_game(self, game: str) -> str:
        """
        Validate game version.

        Args:
            game: Game version string

        Returns:
            Validated game version (lowercase)

        Raises:
            RAGChainError: If game is invalid
        """
        game_lower = game.lower()
        if game_lower not in ["poe1", "poe2"]:
            raise RAGChainError(
                f"Invalid game version '{game}'. Must be 'poe1' or 'poe2'"
            )
        return game_lower

    def _build_metadata_filter(
        self,
        game: str,
        build_context: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Build metadata filter for ChromaDB query.

        Only filters by game version. Build context is handled via query
        enhancement rather than metadata filtering because documents may
        not have a build_context metadata field.

        Args:
            game: Game version filter
            build_context: Optional build context (used for logging only)

        Returns:
            Metadata filter dictionary
        """
        filter_dict: Dict[str, Any] = {"game": game}

        if build_context:
            logger.info(
                f"Build context '{build_context}' applied via query enhancement "
                f"(not metadata filter)"
            )

        return filter_dict

    def _enhance_query_with_context(
        self,
        query: str,
        build_context: Optional[str] = None,
    ) -> str:
        """
        Enhance the search query with build context keywords.

        Build context values like 'hc', 'budget', 'ssf' provide semantic
        hints that improve vector similarity search relevance.

        Args:
            query: Original user query
            build_context: Optional build context value

        Returns:
            Enhanced query string
        """
        if not build_context:
            return query

        enhancement = BUILD_CONTEXT_QUERY_ENHANCEMENTS.get(build_context)
        if enhancement:
            enhanced = f"{build_context} {query} {enhancement}"
            logger.info(
                f"Query enhanced with build context '{build_context}': "
                f"'{query[:50]}...' -> '{enhanced[:80]}...'"
            )
            return enhanced

        # Fallback for unknown context values
        return f"{build_context}: {query}"

    def _extract_citations(
        self,
        documents: List[Document],
        scores: Optional[List[float]] = None,
    ) -> List[Citation]:
        """
        Extract citations from retrieved documents.

        Args:
            documents: Retrieved documents
            scores: Optional relevance scores

        Returns:
            List of Citation objects
        """
        citations = []

        for i, doc in enumerate(documents):
            # Get relevance score if available
            score = scores[i] if scores and i < len(scores) else 0.0

            # Extract source from metadata
            source = doc.metadata.get("source", "unknown")
            if not source or source == "unknown":
                # Try other common source fields
                source = doc.metadata.get("url", doc.metadata.get("filename", "unknown"))

            # Create citation
            citation = Citation(
                content=doc.page_content,
                source=source,
                relevance_score=score,
                metadata=doc.metadata,
            )
            citations.append(citation)

        return citations

    def retrieve(
        self,
        query: str,
        game: str,
        top_k: Optional[int] = None,
        build_context: Optional[str] = None,
        include_scores: bool = True,
    ) -> RetrievalResult:
        """
        Retrieve relevant documents with game filtering.

        Args:
            query: The search query
            game: Game version filter ('poe1' or 'poe2')
            top_k: Number of results to return (defaults to self._default_top_k)
            build_context: Optional build context for filtering
            include_scores: Whether to include relevance scores

        Returns:
            RetrievalResult with documents and citations

        Raises:
            RAGChainError: If retrieval fails
        """
        # Validate inputs
        if not query or not isinstance(query, str):
            raise RAGChainError("Query must be a non-empty string")

        game = self._validate_game(game)

        # Use provided top_k or default
        k = top_k or self._default_top_k

        logger.info(
            f"Retrieving documents: query='{query[:50]}...', game={game}, "
            f"top_k={k}, build_context={build_context}"
        )

        try:
            # Build metadata filter (game version only)
            filter_dict = self._build_metadata_filter(game, build_context)

            # Enhance query with build context keywords
            enhanced_query = self._enhance_query_with_context(query, build_context)

            # Retrieve documents
            documents: List[Document] = []
            scores: Optional[List[float]] = None

            if include_scores:
                # Use similarity search with scores
                results_with_scores = self._vector_store.similarity_search_with_score(
                    query=enhanced_query,
                    k=k,
                    filter=filter_dict,
                )

                # ChromaDB returns (document, distance) tuples
                # Distance is lower for more similar documents
                # Convert to similarity score (1 / (1 + distance))
                documents = [doc for doc, _ in results_with_scores]
                scores = [1.0 / (1.0 + distance) for _, distance in results_with_scores]

            else:
                # Use regular similarity search
                documents = self._vector_store.similarity_search(
                    query=enhanced_query,
                    k=k,
                    filter=filter_dict,
                )

            logger.info(f"Retrieved {len(documents)} documents")

            # Extract citations
            citations = self._extract_citations(documents, scores)

            # Create result
            result = RetrievalResult(
                query=query,
                game=game,
                documents=documents,
                citations=citations,
                build_context=build_context,
            )

            return result

        except VectorStoreError as e:
            error_msg = f"Vector store error during retrieval: {str(e)}"
            logger.error(error_msg)
            raise RAGChainError(error_msg)
        except Exception as e:
            error_msg = f"Retrieval failed: {str(e)}"
            logger.error(error_msg)
            raise RAGChainError(error_msg)

    def retrieve_for_poe1(
        self,
        query: str,
        top_k: Optional[int] = None,
        build_context: Optional[str] = None,
    ) -> RetrievalResult:
        """
        Convenience method to retrieve documents for PoE1.

        Args:
            query: The search query
            top_k: Number of results to return
            build_context: Optional build context

        Returns:
            RetrievalResult with documents and citations
        """
        return self.retrieve(
            query=query,
            game="poe1",
            top_k=top_k,
            build_context=build_context,
        )

    def retrieve_for_poe2(
        self,
        query: str,
        top_k: Optional[int] = None,
        build_context: Optional[str] = None,
    ) -> RetrievalResult:
        """
        Convenience method to retrieve documents for PoE2.

        Args:
            query: The search query
            top_k: Number of results to return
            build_context: Optional build context

        Returns:
            RetrievalResult with documents and citations
        """
        return self.retrieve(
            query=query,
            game="poe2",
            top_k=top_k,
            build_context=build_context,
        )

    def get_context(
        self,
        query: str,
        game: str,
        top_k: Optional[int] = None,
        build_context: Optional[str] = None,
        separator: str = "\n\n",
    ) -> str:
        """
        Get combined context text from retrieved documents.

        This is a convenience method that retrieves documents and
        returns the combined text for use in prompts.

        Args:
            query: The search query
            game: Game version filter
            top_k: Number of results to return
            build_context: Optional build context
            separator: Separator between documents

        Returns:
            Combined context text from retrieved documents
        """
        result = self.retrieve(
            query=query,
            game=game,
            top_k=top_k,
            build_context=build_context,
            include_scores=False,
        )

        return result.get_context_text(separator)

    def health_check(self) -> dict:
        """
        Perform a health check on the RAG chain.

        Returns:
            dict with keys:
                - status: "ready" or "error"
                - default_top_k: Default number of results
                - vector_store_status: Status of the vector store
                - message: Description of the status
        """
        result = {
            "status": "error",
            "default_top_k": self._default_top_k,
            "vector_store_status": "unknown",
            "message": "RAG chain not initialized",
        }

        try:
            # Check vector store health
            vs_health = self._vector_store.health_check()
            result["vector_store_status"] = vs_health.get("status", "unknown")

            if vs_health.get("status") == "ready":
                result["status"] = "ready"
                result["message"] = (
                    f"RAG chain ready with default_top_k={self._default_top_k}"
                )
            else:
                result["message"] = f"Vector store not ready: {vs_health.get('message', 'unknown')}"

        except Exception as e:
            result["message"] = f"Health check failed: {str(e)}"

        return result


# Global instance for convenience
_rag_chain: Optional[RAGChain] = None


def get_rag_chain() -> RAGChain:
    """
    Get the global RAGChain instance.

    Returns:
        RAGChain instance
    """
    global _rag_chain
    if _rag_chain is None:
        _rag_chain = RAGChain()
    return _rag_chain


def check_rag_chain_health() -> dict:
    """
    Check RAG chain health status.

    This is a convenience function that gets the global
    RAGChain instance and performs a health check.

    Returns:
        dict with health status information
    """
    rag_chain = get_rag_chain()
    return rag_chain.health_check()


__all__ = [
    "RAGChain",
    "RAGChainError",
    "Citation",
    "RetrievalResult",
    "BUILD_CONTEXT_DESCRIPTIONS",
    "BUILD_CONTEXT_QUERY_ENHANCEMENTS",
    "get_rag_chain",
    "check_rag_chain_health",
]
