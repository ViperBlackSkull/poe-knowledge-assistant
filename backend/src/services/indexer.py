"""
ChromaDB indexer for scraped Path of Exile data.

Transforms scraped item dictionaries into ChromaDB-compatible documents,
generates embeddings, and indexes them into the vector database.  Supports
batch processing, duplicate detection, and metadata enrichment for both
PoE1 and PoE2 items.

Usage::

    from src.services.indexer import ChromaDBIndexer

    # Index a list of scraped items
    items = [
        {
            "name": "Tabula Rasa",
            "item_type": "armor",
            "url": "https://poedb.tw/us/Tabula_Rasa",
            "description": "Simple Robe...",
            "properties": {"Energy Shield": "0"},
            "categories": ["Unique Body Armour"],
            "tags": ["body_armour", "intelligence"],
            "metadata": {"game": "poe1"},
        },
    ]

    indexer = ChromaDBIndexer()
    result = indexer.index_items(items)
    print(f"Indexed {result['indexed_count']} items")
"""

import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from langchain_core.documents import Document

from src.services.vector_store import VectorStore, VectorStoreError, get_vector_store
from src.services.chroma_db import ChromaDBManager, get_chroma_manager

logger = logging.getLogger(__name__)


# ------------------------------------------------------------------
# Constants
# ------------------------------------------------------------------

# Maximum number of items to process in a single batch.
DEFAULT_BATCH_SIZE = 100

# Metadata fields that are always included for every indexed item.
_REQUIRED_METADATA_FIELDS = (
    "source_id",
    "name",
    "item_type",
    "game",
    "url",
    "source",
    "indexed_at",
)

# Fields from scraped item dicts that are stored as metadata (not in the
# document text).  Lists and dicts are JSON-serialised so ChromaDB can store
# them as strings.
_METADATA_FIELDS = (
    "item_type",
    "base_type",
    "rarity",
    "game",
    "url",
    "image_url",
    "source_page",
    "categories",
    "tags",
    "requirements",
    "properties",
    "implicit_mods",
    "explicit_mods",
    "crafted_mods",
    "enchant_mods",
    "related_items",
    "metadata",
)

# Fields that contain list values and need JSON serialisation for ChromaDB
# metadata (which only supports str, int, float, bool).
_LIST_METADATA_FIELDS = (
    "categories",
    "tags",
    "implicit_mods",
    "explicit_mods",
    "crafted_mods",
    "enchant_mods",
    "related_items",
)

# Fields that contain dict values and need JSON serialisation.
_DICT_METADATA_FIELDS = (
    "requirements",
    "properties",
    "metadata",
)


class IndexerError(Exception):
    """Custom exception for indexer errors."""
    pass


# ------------------------------------------------------------------
# Helper functions
# ------------------------------------------------------------------


def _generate_document_id(item: Dict[str, Any]) -> str:
    """
    Generate a deterministic document ID for a scraped item.

    The ID is based on the item URL (or name as fallback) so that
    re-indexing the same item produces the same ID, enabling
    duplicate detection and upsert behaviour.

    Args:
        item: Scraped item dictionary.

    Returns:
        A hex string document ID.
    """
    # Prefer URL-based ID since URLs are unique identifiers
    url = item.get("url", "")
    if url:
        raw = f"poe_item:{url}"
    else:
        name = item.get("name", "unknown")
        item_type = item.get("item_type", "unknown")
        game = item.get("game") or (item.get("metadata") or {}).get("game", "unknown")
        raw = f"poe_item:{game}:{item_type}:{name}"

    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


def _build_document_text(item: Dict[str, Any]) -> str:
    """
    Build the searchable document text from a scraped item dictionary.

    The document text is what gets embedded and searched against.  It
    should contain the most relevant, searchable information about the
    item in a natural language format.

    Args:
        item: Scraped item dictionary.

    Returns:
        A string of concatenated, searchable item information.
    """
    parts: list[str] = []

    # Name is the most important piece
    name = item.get("name", "")
    if name:
        parts.append(f"Name: {name}")

    # Item type and base type
    item_type = item.get("item_type", "")
    if item_type:
        parts.append(f"Type: {item_type}")

    base_type = item.get("base_type", "")
    if base_type:
        parts.append(f"Base Type: {base_type}")

    # Rarity
    rarity = item.get("rarity", "")
    if rarity:
        parts.append(f"Rarity: {rarity}")

    # Description / flavour text
    description = item.get("description", "")
    if description:
        parts.append(f"Description: {description}")

    # Requirements
    requirements = item.get("requirements", {})
    if isinstance(requirements, dict) and requirements:
        req_parts = [f"{k}: {v}" for k, v in requirements.items()]
        parts.append(f"Requirements: {', '.join(req_parts)}")

    # Properties
    properties = item.get("properties", {})
    if isinstance(properties, dict) and properties:
        prop_parts = [f"{k}: {v}" for k, v in properties.items()]
        parts.append(f"Properties: {', '.join(prop_parts)}")

    # Modifiers
    for mod_type in ("implicit_mods", "explicit_mods", "crafted_mods", "enchant_mods"):
        mods = item.get(mod_type, [])
        if isinstance(mods, list) and mods:
            label = mod_type.replace("_", " ").title()
            parts.append(f"{label}: {'; '.join(mods)}")

    # Tags
    tags = item.get("tags", [])
    if isinstance(tags, list) and tags:
        parts.append(f"Tags: {', '.join(tags)}")

    # Categories
    categories = item.get("categories", [])
    if isinstance(categories, list) and categories:
        parts.append(f"Categories: {', '.join(categories)}")

    return "\n".join(parts)


def _build_metadata(item: Dict[str, Any], doc_id: str) -> Dict[str, Any]:
    """
    Build the metadata dictionary for a scraped item.

    ChromaDB metadata values must be one of: str, int, float, bool.
    Lists and dicts are JSON-serialised to strings.

    Args:
        item: Scraped item dictionary.
        doc_id: Generated document ID.

    Returns:
        A flat metadata dict with string/numeric values.
    """
    metadata: Dict[str, Any] = {
        "source_id": doc_id,
        "name": item.get("name", "Unknown"),
        "item_type": item.get("item_type", "other"),
        "game": _extract_game(item),
        "url": item.get("url", ""),
        "source": item.get("source_page") or item.get("source", "poedb.tw"),
        "indexed_at": datetime.now(timezone.utc).isoformat(),
    }

    # Add optional metadata fields
    for field in _METADATA_FIELDS:
        if field in item and item[field]:
            value = item[field]

            # Serialise list values
            if field in _LIST_METADATA_FIELDS and isinstance(value, list):
                metadata[field] = json.dumps(value, ensure_ascii=False)
            # Serialise dict values
            elif field in _DICT_METADATA_FIELDS and isinstance(value, dict):
                metadata[field] = json.dumps(value, ensure_ascii=False)
            else:
                # Only store scalar types (str, int, float, bool)
                if isinstance(value, (str, int, float, bool)):
                    metadata[field] = value
                elif value is not None:
                    metadata[field] = str(value)

    # Ensure all metadata values are scalar types for ChromaDB compatibility
    cleaned: Dict[str, Any] = {}
    for key, value in metadata.items():
        if isinstance(value, (str, int, float, bool)):
            cleaned[key] = value
        elif value is not None:
            cleaned[key] = str(value)

    return cleaned


def _extract_game(item: Dict[str, Any]) -> str:
    """
    Extract the game version from an item dictionary.

    Checks multiple possible locations for the game version field.

    Args:
        item: Scraped item dictionary.

    Returns:
        ``'poe1'`` or ``'poe2'`` (defaults to ``'poe1'``).
    """
    # Direct 'game' field
    game = item.get("game")
    if game:
        if isinstance(game, str):
            return game.lower()
        return str(game).lower()

    # Nested metadata.game field
    item_metadata = item.get("metadata", {})
    if isinstance(item_metadata, dict):
        game = item_metadata.get("game")
        if game:
            return str(game).lower()

    # Check URL for version hints
    url = item.get("url", "")
    if "poe2db" in url or "/poe2/" in url:
        return "poe2"

    return "poe1"


# ------------------------------------------------------------------
# ChromaDBIndexer
# ------------------------------------------------------------------


class ChromaDBIndexer:
    """
    Indexer that transforms scraped item data into ChromaDB documents.

    This class provides:
    - Transformation of scraped item dicts into LangChain Document objects
    - Deterministic document IDs for duplicate handling
    - Batch indexing with configurable batch size
    - Metadata enrichment and serialisation
    - Game version detection and filtering
    - Integration with the existing VectorStore service

    Usage::

        indexer = ChromaDBIndexer()

        # Index items
        result = indexer.index_items(scraped_items)
        print(result["indexed_count"])

        # Index with custom batch size
        result = indexer.index_items(scraped_items, batch_size=50)

        # Get stats
        stats = indexer.get_stats()
    """

    def __init__(
        self,
        vector_store: Optional[VectorStore] = None,
        batch_size: int = DEFAULT_BATCH_SIZE,
    ):
        """
        Initialize the ChromaDB indexer.

        Args:
            vector_store: Optional VectorStore instance.  If not provided,
                the global instance is used via :func:`get_vector_store`.
            batch_size: Maximum number of items to process in a single
                batch (default: 100).
        """
        self._vector_store = vector_store or get_vector_store()
        self._batch_size = batch_size
        self._chroma_manager = get_chroma_manager()
        self._logger = logging.getLogger(self.__class__.__name__)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def index_items(
        self,
        items: List[Dict[str, Any]],
        batch_size: Optional[int] = None,
        upsert: bool = True,
    ) -> Dict[str, Any]:
        """
        Index a list of scraped item dictionaries into ChromaDB.

        Each item dictionary should contain at minimum ``name``, ``item_type``,
        and ``url`` fields.  Additional fields like ``description``,
        ``properties``, ``requirements``, ``tags``, ``categories``, etc. are
        used to build the searchable document text and metadata.

        When ``upsert`` is ``True`` (the default), items with the same
        generated ID are updated rather than duplicated.

        Args:
            items: List of scraped item dictionaries.
            batch_size: Override the default batch size for this operation.
            upsert: If ``True``, delete existing documents with the same
                ID before adding (prevents duplicates).  If ``False``,
                skip items that already exist.

        Returns:
            A dict with the following keys:
            - ``indexed_count``: Number of items successfully indexed.
            - ``skipped_count``: Number of items skipped (duplicates).
            - ``failed_count``: Number of items that failed to index.
            - ``total``: Total number of items in the input.
            - ``errors``: List of error messages for failed items.
            - ``batch_results``: Per-batch result summaries.

        Raises:
            IndexerError: If the vector store is not ready or input is invalid.

        Example::

            indexer = ChromaDBIndexer()
            result = indexer.index_items([
                {
                    "name": "Tabula Rasa",
                    "item_type": "armor",
                    "url": "https://poedb.tw/us/Tabula_Rasa",
                    "description": "Simple Robe",
                },
            ])
            print(result["indexed_count"])  # 1
        """
        if not self._vector_store.is_ready():
            raise IndexerError(
                "Vector store is not ready.  Check ChromaDB and embedding service health."
            )

        if not items:
            return {
                "indexed_count": 0,
                "skipped_count": 0,
                "failed_count": 0,
                "total": 0,
                "errors": [],
                "batch_results": [],
            }

        if not isinstance(items, list):
            raise IndexerError("items must be a list of dictionaries")

        effective_batch_size = batch_size or self._batch_size

        self._logger.info(
            "Starting indexing of %d items (batch_size=%d, upsert=%s)",
            len(items),
            effective_batch_size,
            upsert,
        )

        all_indexed = 0
        all_skipped = 0
        all_failed = 0
        all_errors: list[str] = []
        batch_results: list[dict[str, Any]] = []

        # Get existing IDs for duplicate detection
        existing_ids = self._get_existing_ids() if upsert else set()

        # Process in batches
        for batch_start in range(0, len(items), effective_batch_size):
            batch = items[batch_start : batch_start + effective_batch_size]
            batch_result = self._index_batch(batch, existing_ids, upsert)

            all_indexed += batch_result["indexed_count"]
            all_skipped += batch_result["skipped_count"]
            all_failed += batch_result["failed_count"]
            all_errors.extend(batch_result.get("errors", []))
            batch_results.append(batch_result)

        result = {
            "indexed_count": all_indexed,
            "skipped_count": all_skipped,
            "failed_count": all_failed,
            "total": len(items),
            "errors": all_errors,
            "batch_results": batch_results,
        }

        self._logger.info(
            "Indexing complete: %d indexed, %d skipped, %d failed out of %d total",
            all_indexed,
            all_skipped,
            all_failed,
            len(items),
        )

        return result

    def get_stats(self) -> Dict[str, Any]:
        """
        Get indexing statistics from the ChromaDB collection.

        Returns:
            A dict with:
            - ``total_documents``: Total number of documents in the collection.
            - ``collection_name``: Name of the ChromaDB collection.
            - ``vector_store_ready``: Whether the vector store is ready.
        """
        try:
            collection = self._chroma_manager.collection
            total = collection.count() if collection else 0

            return {
                "total_documents": total,
                "collection_name": self._chroma_manager.collection_name,
                "vector_store_ready": self._vector_store.is_ready(),
            }
        except Exception as exc:
            self._logger.warning("Failed to get indexer stats: %s", exc)
            return {
                "total_documents": 0,
                "collection_name": "unknown",
                "vector_store_ready": False,
                "error": str(exc),
            }

    def delete_items_by_urls(self, urls: List[str]) -> Dict[str, Any]:
        """
        Delete indexed items by their source URLs.

        Args:
            urls: List of URLs to delete.

        Returns:
            A dict with ``deleted_count`` and ``errors``.
        """
        if not urls:
            return {"deleted_count": 0, "errors": []}

        errors: list[str] = []
        deleted_count = 0

        for url in urls:
            try:
                # Generate the same ID that was used during indexing
                raw = f"poe_item:{url}"
                doc_id = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]

                self._vector_store.delete(ids=[doc_id])
                deleted_count += 1
            except Exception as exc:
                errors.append(f"Failed to delete {url}: {exc}")
                self._logger.warning("Failed to delete %s: %s", url, exc)

        return {
            "deleted_count": deleted_count,
            "errors": errors,
        }

    # ------------------------------------------------------------------
    # Internal methods
    # ------------------------------------------------------------------

    def _get_existing_ids(self) -> set[str]:
        """
        Retrieve the set of existing document IDs in the collection.

        Returns:
            Set of document ID strings, or an empty set on failure.
        """
        try:
            collection = self._chroma_manager.collection
            if collection is None:
                return set()

            # Get all existing IDs from the collection
            result = collection.get(include=[])
            ids = result.get("ids", [])
            return set(ids)

        except Exception as exc:
            self._logger.warning(
                "Failed to retrieve existing IDs for duplicate detection: %s",
                exc,
            )
            return set()

    def _index_batch(
        self,
        batch: List[Dict[str, Any]],
        existing_ids: set[str],
        upsert: bool,
    ) -> Dict[str, Any]:
        """
        Index a single batch of items.

        Args:
            batch: List of item dictionaries to index.
            existing_ids: Set of document IDs already in the collection.
            upsert: Whether to update existing documents.

        Returns:
            Batch result dict with indexed/skipped/failed counts.
        """
        indexed_count = 0
        skipped_count = 0
        failed_count = 0
        errors: list[str] = []

        documents: list[Document] = []
        doc_ids: list[str] = []
        ids_to_delete: list[str] = []

        for item in batch:
            try:
                # Validate minimum required fields
                if not isinstance(item, dict):
                    errors.append(f"Item is not a dict: {type(item).__name__}")
                    failed_count += 1
                    continue

                name = item.get("name")
                if not name:
                    errors.append("Item missing required field 'name'")
                    failed_count += 1
                    continue

                # Generate deterministic ID
                doc_id = _generate_document_id(item)

                # Check for duplicates
                if doc_id in existing_ids:
                    if upsert:
                        ids_to_delete.append(doc_id)
                    else:
                        skipped_count += 1
                        continue

                # Build document text and metadata
                text = _build_document_text(item)
                metadata = _build_metadata(item, doc_id)

                doc = Document(page_content=text, metadata=metadata)
                documents.append(doc)
                doc_ids.append(doc_id)

            except Exception as exc:
                errors.append(f"Failed to process item: {exc}")
                failed_count += 1
                self._logger.warning(
                    "Failed to process item for indexing: %s", exc
                )

        # Delete existing documents that will be updated
        if ids_to_delete:
            try:
                self._vector_store.delete(ids=ids_to_delete)
                self._logger.info(
                    "Deleted %d existing documents for upsert",
                    len(ids_to_delete),
                )
            except Exception as exc:
                self._logger.warning(
                    "Failed to delete documents for upsert: %s", exc
                )

        # Add new documents
        if documents:
            try:
                # Use add_texts with explicit IDs for deterministic indexing
                added_ids = self._vector_store.add_texts(
                    texts=[doc.page_content for doc in documents],
                    metadatas=[doc.metadata for doc in documents],
                    ids=doc_ids,
                )
                indexed_count = len(added_ids)
                self._logger.info(
                    "Indexed %d documents in batch", indexed_count
                )
            except Exception as exc:
                # If add_texts with ids fails, try without ids (ChromaDB version compat)
                try:
                    self._logger.warning(
                        "add_texts with ids failed (%s), falling back to add_documents",
                        exc,
                    )
                    added_ids = self._vector_store.add_documents(documents)
                    indexed_count = len(added_ids)
                    self._logger.info(
                        "Indexed %d documents (via add_documents fallback)",
                        indexed_count,
                    )
                except Exception as inner_exc:
                    errors.append(f"Failed to add batch: {inner_exc}")
                    failed_count += len(documents)
                    self._logger.error(
                        "Failed to index batch of %d documents: %s",
                        len(documents),
                        inner_exc,
                    )

        return {
            "indexed_count": indexed_count,
            "skipped_count": skipped_count,
            "failed_count": failed_count,
            "batch_size": len(batch),
            "errors": errors,
        }


# ------------------------------------------------------------------
# Module-level convenience functions
# ------------------------------------------------------------------

# Global indexer instance
_indexer: Optional[ChromaDBIndexer] = None


def get_indexer() -> ChromaDBIndexer:
    """
    Get the global ChromaDBIndexer instance.

    Returns:
        ChromaDBIndexer instance.
    """
    global _indexer
    if _indexer is None:
        _indexer = ChromaDBIndexer()
    return _indexer


def index_items(
    items: List[Dict[str, Any]],
    batch_size: Optional[int] = None,
    upsert: bool = True,
) -> Dict[str, Any]:
    """
    Convenience function to index items using the global indexer.

    Args:
        items: List of scraped item dictionaries.
        batch_size: Override batch size for this operation.
        upsert: Whether to update existing documents.

    Returns:
        Dict with indexed_count, skipped_count, failed_count, etc.
    """
    indexer = get_indexer()
    return indexer.index_items(items, batch_size=batch_size, upsert=upsert)


def check_indexer_health() -> Dict[str, Any]:
    """
    Check the health of the indexer by verifying vector store readiness
    and collection state.

    Returns:
        Dict with health status information.
    """
    try:
        indexer = get_indexer()
        stats = indexer.get_stats()

        if stats.get("vector_store_ready"):
            return {
                "status": "ready",
                "total_documents": stats.get("total_documents", 0),
                "collection_name": stats.get("collection_name", "unknown"),
                "message": (
                    f"Indexer ready with {stats.get('total_documents', 0)} "
                    f"documents in collection"
                ),
            }
        else:
            return {
                "status": "error",
                "total_documents": 0,
                "collection_name": stats.get("collection_name", "unknown"),
                "message": "Vector store not ready",
            }

    except Exception as exc:
        return {
            "status": "error",
            "total_documents": 0,
            "collection_name": "unknown",
            "message": f"Indexer health check failed: {exc}",
        }


__all__ = [
    "ChromaDBIndexer",
    "IndexerError",
    "get_indexer",
    "index_items",
    "check_indexer_health",
]
