"""
RAG retrieval chain for POE Knowledge Assistant.
Provides retrieval-augmented generation with game version filtering,
build context integration, hybrid search, and cross-encoder reranking.
"""
import logging
from typing import Any, Dict, List, Optional

from langchain_core.documents import Document

from src.config import get_settings
from src.services.vector_store import VectorStore, VectorStoreError, get_vector_store

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# PoE-specific mechanics keywords for query enhancement
# ---------------------------------------------------------------------------

MECHANICS_KEYWORDS: set = {
    # Core mechanics
    "resistance", "cap", "block", "dodge", "evasion", "armour", "energy shield",
    "life", "mana", "strength", "dexterity", "intelligence",
    # PoE1 mechanics
    "map", "atlas", "prophecy", "pantheon", "ascendancy", "lab", "labyrinth",
    "vendor recipe", "master", "hideout", "betrayal", "syndicate",
    "incursion", "temple", "delirium", "blight", "harvest", "ritual",
    "expedition", "logbook", "heist", "contract", "blueprint",
    "delve", "fossil", "resonator",
    # PoE2 mechanics
    "uncut gem", "waystone", "tower", "breachstone", "gold",
    "weapon set", "gem quality", "settler", "precursor", "tablet",
    "reward",
    # Items & crafting
    "currency", "orb", "exalted", "chaos", "divine", "mirror",
    "unique", "rare", "magic", "normal", "corrupted", "shaper", "elder",
    "crusader", "hunter", "redeemer", "warlord",
    # Skills & supports
    "skill gem", "support gem", "link", "vaal", "awakened",
    # Endgame
    "boss", "ubers", "maven", "sirus", "eater of worlds", "exarch",
    "pinnacle", "guardian",
    # League mechanics
    "legion", "metamorph",
}


def _contains_mechanics_keyword(query: str) -> bool:
    """Check if the query contains any PoE mechanics keyword.

    Uses word-boundary matching for short keywords (<=4 chars) to avoid
    false positives like 'cap' matching 'capture' or 'map' matching 'mapping'.
    Allows common plural/verb suffixes (s, es, ed, ing) after short keywords
    so 'maps' matches 'map' but 'mapping' does not.
    Longer multi-word keywords use substring matching since they are specific
    enough to avoid false positives.
    """
    query_lower = query.lower()
    for kw in MECHANICS_KEYWORDS:
        if len(kw) <= 4:
            # Use word-boundary check for short keywords
            start = 0
            while True:
                idx = query_lower.find(kw, start)
                if idx == -1:
                    break
                # Check before boundary: must not be preceded by alphanumeric
                before_ok = (idx == 0) or not query_lower[idx - 1].isalnum()
                # Check after boundary: allow trailing 's', 'es', 'ed', 'ing'
                # but not other alphanumeric continuations
                after_idx = idx + len(kw)
                if after_idx >= len(query_lower):
                    after_ok = True
                else:
                    rest = query_lower[after_idx:]
                    # Allow common suffixes that form valid PoE-related word forms
                    after_ok = (
                        not rest[0].isalnum()  # Non-alphanumeric boundary
                        or rest.startswith('s ')  # Plural: maps, orbs
                        or rest.startswith('s,')   # Plural in list
                        or rest.startswith('es ')  # Plural: bosses
                        or rest.startswith('ed ')  # Past tense: linked
                        or rest.startswith('ing ')  # Gerund: mapping -> NO, too long
                    )
                    # Special case: 'ing' is only ok for 3-char keywords where
                    # the stem is still recognizable (skip 'mapping' from 'map')
                    # Actually, just allow 's' and 'es' suffixes
                    if rest[0] == 's' and (len(rest) == 1 or not rest[1].isalnum()):
                        after_ok = True
                    elif rest.startswith('es') and (len(rest) == 2 or not rest[2].isalnum()):
                        after_ok = True
                if before_ok and after_ok:
                    return True
                start = idx + 1
        else:
            # Substring match for longer/multi-word keywords
            if kw in query_lower:
                return True
    return False


def _boost_query_with_keywords(query: str) -> str:
    """
    Enhance the query by repeating detected mechanics keywords to
    increase their weight in both vector and keyword-based retrieval.
    """
    query_lower = query.lower()
    matched = [kw for kw in MECHANICS_KEYWORDS if kw in query_lower]
    if matched:
        # Append matched keywords once to boost their importance
        boost = " ".join(matched)
        return f"{query} {boost}"
    return query


# ---------------------------------------------------------------------------
# Cross-encoder reranker (lazy-loaded)
# ---------------------------------------------------------------------------

_reranker = None
_reranker_loaded = False


def _get_reranker():
    """
    Lazily load the cross-encoder reranker model.

    Returns None if the sentence-transformers library is not installed
    or the model fails to load, allowing graceful fallback.
    """
    global _reranker, _reranker_loaded

    if _reranker_loaded:
        return _reranker

    _reranker_loaded = True
    try:
        from sentence_transformers import CrossEncoder
        model_name = "cross-encoder/ms-marco-MiniLM-L-6-v2"
        logger.info(f"Loading cross-encoder reranker model: {model_name}")
        _reranker = CrossEncoder(model_name)
        logger.info("Cross-encoder reranker loaded successfully")
    except ImportError:
        logger.warning(
            "sentence-transformers not installed; reranking disabled. "
            "Install with: pip install sentence-transformers"
        )
        _reranker = None
    except Exception as e:
        logger.warning(f"Failed to load cross-encoder reranker: {e}. Reranking disabled.")
        _reranker = None

    return _reranker


def _rerank_documents(
    query: str,
    documents: List[Document],
    scores: Optional[List[float]] = None,
    top_k: int = 3,
) -> tuple[List[Document], List[float]]:
    """
    Rerank documents using a cross-encoder model.

    Falls back to score-based ranking if the reranker is unavailable.

    Args:
        query: The original query.
        documents: Retrieved documents.
        scores: Original similarity scores (used as fallback).
        top_k: Number of documents to return after reranking.

    Returns:
        Tuple of (reranked_documents, reranked_scores).
    """
    if not documents:
        return documents, scores or []

    reranker = _get_reranker()

    if reranker is None:
        # Fallback: sort by original scores (descending)
        if scores:
            paired = sorted(zip(scores, documents), key=lambda x: x[0], reverse=True)
            paired = paired[:top_k]
            return [doc for _, doc in paired], [s for s, _ in paired]
        return documents[:top_k], [0.0] * min(len(documents), top_k)

    try:
        # Build (query, document) pairs for cross-encoder scoring
        pairs = [(query, doc.page_content) for doc in documents]
        ce_scores = reranker.predict(pairs)

        # Sort by cross-encoder score (descending)
        scored_docs = list(zip(ce_scores, documents, scores or [0.0] * len(documents)))
        scored_docs.sort(key=lambda x: x[0], reverse=True)

        # Take top_k
        top_docs = scored_docs[:top_k]
        reranked_docs = [doc for _, doc, _ in top_docs]
        reranked_scores = [float(ce_score) for ce_score, _, _ in top_docs]

        logger.info(
            f"Reranked {len(documents)} documents -> top {len(reranked_docs)} "
            f"(scores: {[f'{s:.3f}' for s in reranked_scores]})"
        )
        return reranked_docs, reranked_scores

    except Exception as e:
        logger.warning(f"Reranking failed, falling back to original scores: {e}")
        if scores:
            paired = sorted(zip(scores, documents), key=lambda x: x[0], reverse=True)
            paired = paired[:top_k]
            return [doc for _, doc in paired], [s for s, _ in paired]
        return documents[:top_k], [0.0] * min(len(documents), top_k)


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
    RAG retrieval chain with game filtering, hybrid search, and reranking.

    This class provides:
    - Document retrieval from ChromaDB vector store
    - Game version filtering (poe1, poe2)
    - Build context integration
    - PoE mechanics keyword boosting for improved recall
    - Cross-encoder reranking for precision
    - Configurable top-k results and score thresholds
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

        # Hybrid search and reranking settings
        self._enable_reranking = settings.rag.enable_reranking
        self._bm25_weight = settings.rag.bm25_search_weight
        self._vector_weight = settings.rag.vector_search_weight
        self._score_threshold = settings.rag.score_threshold

        logger.info(
            f"RAGChain initialized with default_top_k={self._default_top_k}, "
            f"reranking={self._enable_reranking}, "
            f"bm25_weight={self._bm25_weight}, vector_weight={self._vector_weight}, "
            f"score_threshold={self._score_threshold}"
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
        Enhance the search query with build context keywords and PoE mechanics
        keyword boosting.

        Build context values like 'hc', 'budget', 'ssf' provide semantic
        hints that improve vector similarity search relevance. Mechanics
        keywords are boosted to improve recall for exact PoE term matching.

        Args:
            query: Original user query
            build_context: Optional build context value

        Returns:
            Enhanced query string
        """
        enhanced = query

        # Boost PoE mechanics keywords for better retrieval
        if _contains_mechanics_keyword(query):
            enhanced = _boost_query_with_keywords(enhanced)

        if not build_context:
            return enhanced

        enhancement = BUILD_CONTEXT_QUERY_ENHANCEMENTS.get(build_context)
        if enhancement:
            enhanced = f"{build_context} {enhanced} {enhancement}"
            logger.info(
                f"Query enhanced with build context '{build_context}': "
                f"'{query[:50]}...' -> '{enhanced[:80]}...'"
            )
            return enhanced

        # Fallback for unknown context values
        return f"{build_context}: {enhanced}"

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

    def _apply_score_threshold(
        self,
        documents: List[Document],
        scores: List[float],
    ) -> tuple[List[Document], List[float]]:
        """
        Filter out documents below the configured score threshold.

        Args:
            documents: List of documents.
            scores: Corresponding relevance scores.

        Returns:
            Tuple of (filtered_documents, filtered_scores).
        """
        if self._score_threshold <= 0.0:
            return documents, scores

        filtered_docs = []
        filtered_scores = []
        for doc, score in zip(documents, scores):
            if score >= self._score_threshold:
                filtered_docs.append(doc)
                filtered_scores.append(score)
            else:
                logger.debug(
                    f"Document filtered by score threshold "
                    f"({score:.3f} < {self._score_threshold}): "
                    f"{doc.page_content[:80]}..."
                )

        if len(filtered_docs) < len(documents):
            logger.info(
                f"Score threshold filtering: {len(documents)} -> {len(filtered_docs)} "
                f"documents (threshold={self._score_threshold})"
            )

        return filtered_docs, filtered_scores

    def retrieve(
        self,
        query: str,
        game: str,
        top_k: Optional[int] = None,
        build_context: Optional[str] = None,
        include_scores: bool = True,
    ) -> RetrievalResult:
        """
        Retrieve relevant documents with game filtering, optional reranking,
        and score threshold filtering.

        When reranking is enabled, a larger candidate set is retrieved from
        the vector store and then reranked using a cross-encoder model.
        Mechanics keywords in the query are automatically boosted for better
        recall on PoE-specific terms.

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
            f"top_k={k}, build_context={build_context}, "
            f"reranking={self._enable_reranking}"
        )

        try:
            # Build metadata filter (game version only)
            filter_dict = self._build_metadata_filter(game, build_context)

            # Enhance query with build context keywords and mechanics boosting
            enhanced_query = self._enhance_query_with_context(query, build_context)

            # When reranking is enabled, retrieve more candidates for reranking
            retrieve_k = k * 3 if self._enable_reranking else k

            # Retrieve documents
            documents: List[Document] = []
            scores: Optional[List[float]] = None

            if include_scores:
                # Use similarity search with scores
                results_with_scores = self._vector_store.similarity_search_with_score(
                    query=enhanced_query,
                    k=retrieve_k,
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
                    k=retrieve_k,
                    filter=filter_dict,
                )

            logger.info(f"Retrieved {len(documents)} candidate documents")

            # Apply score threshold filtering (only when scores are available)
            if scores:
                documents, scores = self._apply_score_threshold(documents, scores)

            # Apply cross-encoder reranking if enabled and scores are available.
            # Skip reranking when include_scores=False to avoid loading the heavy
            # cross-encoder model for lightweight retrieval paths (e.g. get_context).
            if self._enable_reranking and documents and scores is not None:
                documents, scores = _rerank_documents(
                    query=query,  # Use original query for reranking
                    documents=documents,
                    scores=scores,
                    top_k=k,
                )

            # If no reranking, trim to top_k
            if not self._enable_reranking and len(documents) > k:
                if scores:
                    paired = sorted(zip(scores, documents), key=lambda x: x[0], reverse=True)
                    paired = paired[:k]
                    documents = [doc for _, doc in paired]
                    scores = [s for s, _ in paired]
                else:
                    documents = documents[:k]
                    scores = [0.0] * len(documents)

            logger.info(f"Final result: {len(documents)} documents")

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
                - enable_reranking: Whether reranking is enabled
                - vector_store_status: Status of the vector store
                - message: Description of the status
        """
        result = {
            "status": "error",
            "default_top_k": self._default_top_k,
            "enable_reranking": self._enable_reranking,
            "bm25_weight": self._bm25_weight,
            "vector_weight": self._vector_weight,
            "score_threshold": self._score_threshold,
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
                    f"RAG chain ready with default_top_k={self._default_top_k}, "
                    f"reranking={self._enable_reranking}"
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
    "MECHANICS_KEYWORDS",
    "get_rag_chain",
    "check_rag_chain_health",
]
