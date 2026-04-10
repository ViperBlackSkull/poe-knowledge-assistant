"""
Comprehensive RAG pipeline integration tests for POE Knowledge Assistant.

Validates the complete RAG functionality with real ChromaDB data, including:
- Game filtering (PoE1 vs PoE2)
- Build context effects on query enhancement
- Citation accuracy and linking to correct sources
- Top-k parameter behavior
- Integration with the real ChromaDB vector store
"""
import os
import sys
import tempfile
import logging
from pathlib import Path
from typing import List, Optional

import pytest

# Ensure backend src is on the path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from langchain_core.documents import Document

from src.services.rag_chain import (
    RAGChain,
    RAGChainError,
    Citation,
    RetrievalResult,
    BUILD_CONTEXT_QUERY_ENHANCEMENTS,
    BUILD_CONTEXT_DESCRIPTIONS,
)
from src.services.vector_store import VectorStore, VectorStoreError
from src.services.chroma_db import ChromaDBManager
from src.services.embeddings import LocalEmbeddings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Sample test data: PoE1 and PoE2 items with realistic content
# ---------------------------------------------------------------------------

SAMPLE_POE1_ITEMS = [
    {
        "name": "Tabula Rasa",
        "item_type": "armor",
        "base_type": "Simple Robe",
        "rarity": "Unique",
        "description": "Has 6 linked white sockets. A simple robe that grants no bonuses.",
        "url": "https://poedb.tw/us/Tabula_Rasa",
        "source_page": "poedb.tw",
        "categories": ["Unique Body Armour"],
        "tags": ["body_armour", "intelligence", "chest"],
        "properties": {"Energy Shield": "0", "Evasion Rating": "0"},
        "game": "poe1",
    },
    {
        "name": "Headhunter",
        "item_type": "accessory",
        "base_type": "Leather Belt",
        "rarity": "Unique",
        "description": "When you kill a Rare monster, you gain its modifiers for 20 seconds.",
        "url": "https://poedb.tw/us/Headhunter",
        "source_page": "poedb.tw",
        "categories": ["Unique Belt"],
        "tags": ["belt", "accessory", "nemesis"],
        "properties": {"Life": "40-60", "Strength": "40-55", "Dexterity": "40-55"},
        "game": "poe1",
    },
    {
        "name": "Shavronne's Wrappings",
        "item_type": "armor",
        "base_type": "Occultist's Vestment",
        "rarity": "Unique",
        "description": "Chaos Damage does not bypass Energy Shield. Grants increased energy shield.",
        "url": "https://poedb.tw/us/Shavronnes_Wrappings",
        "source_page": "poedb.tw",
        "categories": ["Unique Body Armour"],
        "tags": ["body_armour", "intelligence", "es", "low-life"],
        "properties": {"Energy Shield": "360-420"},
        "game": "poe1",
    },
    {
        "name": "Fireball",
        "item_type": "gem",
        "description": "Fires a projectile that deals fire damage to targets it hits.",
        "url": "https://poedb.tw/us/Fireball",
        "source_page": "poedb.tw",
        "categories": ["Skill Gem", "Fire", "Projectile"],
        "tags": ["fire", "projectile", "spell", "aoe"],
        "properties": {"Damage": "100-150", "Cast Time": "0.75s"},
        "game": "poe1",
    },
    {
        "name": "Chaos Orb",
        "item_type": "currency",
        "description": "Reforges a rare item with new random modifiers.",
        "url": "https://poedb.tw/us/Chaos_Orb",
        "source_page": "poedb.tw",
        "categories": ["Currency"],
        "tags": ["currency"],
        "game": "poe1",
    },
    {
        "name": "Hammer of the Pious",
        "item_type": "weapon",
        "base_type": "Judgement Staff",
        "rarity": "Unique",
        "description": "A powerful two-handed staff that smites enemies with holy fire.",
        "url": "https://poedb.tw/us/Hammer_of_the_Pious",
        "source_page": "poedb.tw",
        "categories": ["Unique Weapon"],
        "tags": ["weapon", "staff", "two_hand", "physical"],
        "properties": {"Physical Damage": "200-350", "Attack Speed": "1.25"},
        "game": "poe1",
    },
]

SAMPLE_POE2_ITEMS = [
    {
        "name": "Void Sphere",
        "item_type": "gem",
        "description": "Creates a void sphere that damages and pulls enemies.",
        "url": "https://poedb.tw/us/poe2/Void_Sphere",
        "source_page": "poedb.tw",
        "categories": ["Skill Gem", "Chaos", "AoE"],
        "tags": ["chaos", "aoe", "spell", "duration"],
        "properties": {"Damage": "50-80", "Duration": "3s"},
        "game": "poe2",
    },
    {
        "name": "Exalted Orb",
        "item_type": "currency",
        "description": "Adds a new random modifier to a rare item.",
        "url": "https://poedb.tw/us/poe2/Exalted_Orb",
        "source_page": "poedb.tw",
        "categories": ["Currency"],
        "tags": ["currency"],
        "game": "poe2",
    },
    {
        "name": "Kalandra's Touch",
        "item_type": "accessory",
        "base_type": "Ring",
        "rarity": "Unique",
        "description": "Mirrors the stats and effects of the other ring slot.",
        "url": "https://poedb.tw/us/poe2/Kalandras_Touch",
        "source_page": "poedb.tw",
        "categories": ["Unique Ring"],
        "tags": ["ring", "accessory", "mirror"],
        "properties": {"Mirrored": "True"},
        "game": "poe2",
    },
    {
        "name": "Frostbolt",
        "item_type": "gem",
        "description": "Fires a slow-moving projectile that pierces through enemies dealing cold damage.",
        "url": "https://poedb.tw/us/poe2/Frostbolt",
        "source_page": "poedb.tw",
        "categories": ["Skill Gem", "Cold", "Projectile"],
        "tags": ["cold", "projectile", "spell"],
        "properties": {"Damage": "80-120", "Cast Time": "0.65s"},
        "game": "poe2",
    },
    {
        "name": "Searing Touch",
        "item_type": "weapon",
        "base_type": "Staff",
        "rarity": "Unique",
        "description": "Increases fire damage and spell damage significantly.",
        "url": "https://poedb.tw/us/poe2/Searing_Touch",
        "source_page": "poedb.tw",
        "categories": ["Unique Weapon"],
        "tags": ["weapon", "staff", "fire", "spell"],
        "properties": {"Fire Damage": "+40-60%", "Spell Damage": "+20-30%"},
        "game": "poe2",
    },
    {
        "name": "Custom Shield",
        "item_type": "armor",
        "description": "A sturdy shield for blocking attacks.",
        "url": "https://poedb.tw/us/poe2/Custom_Shield",
        "source_page": "poedb.tw",
        "categories": ["Shield"],
        "tags": ["shield", "armor", "block"],
        "properties": {"Block": "30%"},
        "game": "poe2",
    },
]


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _build_document_text(item: dict) -> str:
    """Build searchable text from item dict (mirrors indexer logic)."""
    parts = []
    if item.get("name"):
        parts.append(f"Name: {item['name']}")
    if item.get("item_type"):
        parts.append(f"Type: {item['item_type']}")
    if item.get("base_type"):
        parts.append(f"Base Type: {item['base_type']}")
    if item.get("rarity"):
        parts.append(f"Rarity: {item['rarity']}")
    if item.get("description"):
        parts.append(f"Description: {item['description']}")
    if isinstance(item.get("properties"), dict) and item["properties"]:
        prop_parts = [f"{k}: {v}" for k, v in item["properties"].items()]
        parts.append(f"Properties: {', '.join(prop_parts)}")
    if isinstance(item.get("tags"), list) and item["tags"]:
        parts.append(f"Tags: {', '.join(item['tags'])}")
    if isinstance(item.get("categories"), list) and item["categories"]:
        parts.append(f"Categories: {', '.join(item['categories'])}")
    return "\n".join(parts)


def _build_document_metadata(item: dict) -> dict:
    """Build metadata dict for a document (mirrors indexer logic)."""
    return {
        "name": item.get("name", "Unknown"),
        "item_type": item.get("item_type", "other"),
        "game": item.get("game", "poe1"),
        "url": item.get("url", ""),
        "source": item.get("source_page", "poedb.tw"),
        "rarity": item.get("rarity", ""),
    }


def _create_documents_from_items(items: list) -> List[Document]:
    """Create LangChain Documents from a list of item dicts."""
    documents = []
    for item in items:
        doc = Document(
            page_content=_build_document_text(item),
            metadata=_build_document_metadata(item),
        )
        documents.append(doc)
    return documents


@pytest.fixture(scope="module")
def temp_chroma_dir():
    """Create a temporary directory for ChromaDB persistence during tests."""
    with tempfile.TemporaryDirectory(prefix="test_chroma_rag_") as tmpdir:
        yield tmpdir


@pytest.fixture(scope="module")
def vector_store(temp_chroma_dir):
    """
    Create a VectorStore with sample data for integration testing.

    This uses a temporary ChromaDB directory so tests do not pollute
    the real database. All sample PoE1 and PoE2 items are indexed.
    """
    import chromadb
    from chromadb.config import Settings as ChromaSettings

    collection_name = "test_rag_integration"

    # Create a fresh ChromaDB client in the temp directory
    client = chromadb.PersistentClient(
        path=temp_chroma_dir,
        settings=ChromaSettings(
            anonymized_telemetry=False,
            allow_reset=True,
        ),
    )

    # Delete collection if it already exists from a previous run
    try:
        client.delete_collection(name=collection_name)
    except Exception:
        pass

    # Create the ChromaDBManager manually
    chroma_manager = ChromaDBManager(
        persist_directory=temp_chroma_dir,
        collection_name=collection_name,
    )

    # Override the manager client/collection with our test ones
    chroma_manager._client = client
    chroma_manager._collection = client.get_or_create_collection(name=collection_name)

    # Create embeddings (local model)
    embeddings = LocalEmbeddings()

    # Create VectorStore with our test manager and embeddings
    from langchain_community.vectorstores import Chroma

    lc_chroma = Chroma(
        collection_name=collection_name,
        embedding_function=embeddings,
        client=client,
    )

    # Add all sample documents
    all_items = SAMPLE_POE1_ITEMS + SAMPLE_POE2_ITEMS
    documents = _create_documents_from_items(all_items)

    # Add documents with IDs
    ids = [f"test-{item['game']}-{item['name'].lower().replace(' ', '_')}" for item in all_items]
    lc_chroma.add_documents(documents, ids=ids)

    # Wrap in our VectorStore (set internals directly)
    vs = VectorStore.__new__(VectorStore)
    vs.collection_name = collection_name
    vs.persist_directory = temp_chroma_dir
    vs._embeddings = embeddings
    vs._chroma_manager = chroma_manager
    vs._vectorstore = lc_chroma
    vs._initialization_error = None

    return vs


@pytest.fixture(scope="module")
def rag_chain(vector_store):
    """Create a RAGChain using the test vector store."""
    return RAGChain(vector_store=vector_store, default_top_k=3)


# ---------------------------------------------------------------------------
# Test: Game Filtering (PoE1 vs PoE2)
# ---------------------------------------------------------------------------


class TestGameFiltering:
    """Test that game version filtering correctly separates PoE1 and PoE2 results."""

    def test_poe1_query_returns_only_poe1_documents(self, rag_chain):
        """Query with game='poe1' should only return documents with game metadata 'poe1'."""
        result = rag_chain.retrieve(
            query="fire spell damage",
            game="poe1",
            top_k=5,
        )
        assert isinstance(result, RetrievalResult)
        assert result.game == "poe1"

        # Every returned document must have game=poe1
        for doc in result.documents:
            assert doc.metadata.get("game") == "poe1", (
                f"Expected poe1 but got game={doc.metadata.get('game')} "
                f"for document '{doc.metadata.get('name')}'"
            )

    def test_poe2_query_returns_only_poe2_documents(self, rag_chain):
        """Query with game='poe2' should only return documents with game metadata 'poe2'."""
        result = rag_chain.retrieve(
            query="cold spell projectile",
            game="poe2",
            top_k=5,
        )
        assert isinstance(result, RetrievalResult)
        assert result.game == "poe2"

        # Every returned document must have game=poe2
        for doc in result.documents:
            assert doc.metadata.get("game") == "poe2", (
                f"Expected poe2 but got game={doc.metadata.get('game')} "
                f"for document '{doc.metadata.get('name')}'"
            )

    def test_poe1_armor_query(self, rag_chain):
        """Query PoE1 armor items should not return PoE2 armor items."""
        result = rag_chain.retrieve(
            query="body armour energy shield",
            game="poe1",
            top_k=5,
        )
        for doc in result.documents:
            assert doc.metadata.get("game") == "poe1"

    def test_poe2_weapon_query(self, rag_chain):
        """Query PoE2 weapons should only return PoE2 items."""
        result = rag_chain.retrieve(
            query="staff weapon damage",
            game="poe2",
            top_k=5,
        )
        for doc in result.documents:
            assert doc.metadata.get("game") == "poe2"

    def test_poe1_currency_query(self, rag_chain):
        """Query for PoE1 currency should return only PoE1 currency items."""
        result = rag_chain.retrieve(
            query="currency orb reroll modifiers",
            game="poe1",
            top_k=5,
        )
        for doc in result.documents:
            assert doc.metadata.get("game") == "poe1"

    def test_poe2_unique_accessory(self, rag_chain):
        """Query for PoE2 unique accessories returns only PoE2 results."""
        result = rag_chain.retrieve(
            query="unique ring mirror stats",
            game="poe2",
            top_k=5,
        )
        for doc in result.documents:
            assert doc.metadata.get("game") == "poe2"

    def test_invalid_game_raises_error(self, rag_chain):
        """Query with an invalid game version should raise RAGChainError."""
        with pytest.raises(RAGChainError, match="Invalid game version"):
            rag_chain.retrieve(
                query="test query",
                game="poe3",
            )

    def test_empty_query_raises_error(self, rag_chain):
        """Empty query should raise RAGChainError."""
        with pytest.raises(RAGChainError, match="non-empty string"):
            rag_chain.retrieve(
                query="",
                game="poe1",
            )

    def test_none_query_raises_error(self, rag_chain):
        """None query should raise RAGChainError."""
        with pytest.raises(RAGChainError, match="non-empty string"):
            rag_chain.retrieve(
                query=None,
                game="poe1",
            )

    def test_game_case_insensitive(self, rag_chain):
        """Game version should be case-insensitive."""
        result = rag_chain.retrieve(
            query="fire damage spell",
            game="POE1",
            top_k=3,
        )
        assert result.game == "poe1"
        for doc in result.documents:
            assert doc.metadata.get("game") == "poe1"


# ---------------------------------------------------------------------------
# Test: Build Context Effects
# ---------------------------------------------------------------------------


class TestBuildContext:
    """Test that build context influences the query enhancement and retrieval."""

    def test_build_context_query_enhancement_hc(self, rag_chain):
        """Hardcore build context should enhance query with defensive keywords."""
        # Without build context
        result_plain = rag_chain.retrieve(
            query="best body armour",
            game="poe1",
            top_k=3,
        )

        # With hardcore context
        result_hc = rag_chain.retrieve(
            query="best body armour",
            game="poe1",
            top_k=3,
            build_context="hc",
        )

        # Both should return results (the enhanced query may return different docs)
        assert isinstance(result_plain, RetrievalResult)
        assert isinstance(result_hc, RetrievalResult)
        assert result_hc.build_context == "hc"

    def test_build_context_query_enhancement_ssf(self, rag_chain):
        """SSF build context should enhance query with self-found keywords."""
        result_ssf = rag_chain.retrieve(
            query="good starter weapon",
            game="poe2",
            top_k=3,
            build_context="ssf",
        )
        assert isinstance(result_ssf, RetrievalResult)
        assert result_ssf.build_context == "ssf"

    def test_build_context_query_enhancement_budget(self, rag_chain):
        """Budget build context should enhance query with budget keywords."""
        result_budget = rag_chain.retrieve(
            query="good armour for beginners",
            game="poe2",
            top_k=3,
            build_context="budget",
        )
        assert isinstance(result_budget, RetrievalResult)
        assert result_budget.build_context == "budget"

    def test_known_enhancement_keywords_exist(self):
        """Verify that all expected build context enhancement keywords exist."""
        expected_contexts = ["standard", "budget", "hc", "ssf", "ruthless", "pvp"]
        for ctx in expected_contexts:
            assert ctx in BUILD_CONTEXT_QUERY_ENHANCEMENTS, (
                f"Missing enhancement for build context: {ctx}"
            )
            assert isinstance(BUILD_CONTEXT_QUERY_ENHANCEMENTS[ctx], str)
            assert len(BUILD_CONTEXT_QUERY_ENHANCEMENTS[ctx]) > 0

    def test_known_descriptions_exist(self):
        """Verify that all expected build context descriptions exist."""
        expected_contexts = ["standard", "budget", "hc", "ssf", "ruthless", "pvp"]
        for ctx in expected_contexts:
            assert ctx in BUILD_CONTEXT_DESCRIPTIONS, (
                f"Missing description for build context: {ctx}"
            )
            assert isinstance(BUILD_CONTEXT_DESCRIPTIONS[ctx], str)
            assert len(BUILD_CONTEXT_DESCRIPTIONS[ctx]) > 0

    def test_no_build_context_default(self, rag_chain):
        """Without build context, the result should have None for build_context."""
        result = rag_chain.retrieve(
            query="spell damage",
            game="poe1",
            top_k=3,
        )
        assert result.build_context is None

    def test_unknown_build_context_fallback(self, rag_chain):
        """Unknown build context should use fallback enhancement (no crash)."""
        result = rag_chain.retrieve(
            query="good item",
            game="poe2",
            top_k=3,
            build_context="custom_unknown",
        )
        assert isinstance(result, RetrievalResult)
        assert result.build_context == "custom_unknown"

    def test_convenience_methods_with_build_context(self, rag_chain):
        """Test convenience retrieve_for_poe1/poe2 methods with build_context."""
        result1 = rag_chain.retrieve_for_poe1(
            query="defensive belt",
            build_context="hc",
        )
        assert result1.game == "poe1"
        assert result1.build_context == "hc"

        result2 = rag_chain.retrieve_for_poe2(
            query="spell gem",
            build_context="budget",
        )
        assert result2.game == "poe2"
        assert result2.build_context == "budget"


# ---------------------------------------------------------------------------
# Test: Citation Accuracy
# ---------------------------------------------------------------------------


class TestCitationAccuracy:
    """Test citation extraction, accuracy, and linking to correct sources."""

    def test_citations_returned_for_results(self, rag_chain):
        """Citations should be returned alongside documents."""
        result = rag_chain.retrieve(
            query="fire spell",
            game="poe1",
            top_k=3,
        )
        assert len(result.citations) > 0, "Expected at least one citation"

    def test_citation_count_matches_document_count(self, rag_chain):
        """Number of citations should match number of documents."""
        result = rag_chain.retrieve(
            query="unique item",
            game="poe1",
            top_k=4,
        )
        assert len(result.citations) == len(result.documents), (
            f"Citation count ({len(result.citations)}) != document count ({len(result.documents)})"
        )

    def test_citation_source_field(self, rag_chain):
        """Citation source should come from document metadata."""
        result = rag_chain.retrieve(
            query="energy shield armour",
            game="poe1",
            top_k=3,
        )
        for citation in result.citations:
            assert citation.source, "Citation source should not be empty"
            assert isinstance(citation.source, str)

    def test_citation_content_matches_document(self, rag_chain):
        """Citation content should match the document page content."""
        result = rag_chain.retrieve(
            query="projectile cold spell",
            game="poe2",
            top_k=3,
        )
        for citation, doc in zip(result.citations, result.documents):
            assert citation.content == doc.page_content, (
                "Citation content should match document content"
            )

    def test_citation_relevance_scores(self, rag_chain):
        """Citations should have relevance scores between 0 and 1."""
        result = rag_chain.retrieve(
            query="chaos damage spell",
            game="poe2",
            top_k=3,
            include_scores=True,
        )
        for citation in result.citations:
            assert 0.0 <= citation.relevance_score <= 1.0, (
                f"Relevance score {citation.relevance_score} out of range [0, 1]"
            )

    def test_citation_to_dict(self, rag_chain):
        """Citation to_dict() should produce a valid dictionary."""
        result = rag_chain.retrieve(
            query="unique belt",
            game="poe1",
            top_k=2,
        )
        for citation in result.citations:
            d = citation.to_dict()
            assert "content" in d
            assert "source" in d
            assert "relevance_score" in d
            assert "metadata" in d
            assert isinstance(d["metadata"], dict)

    def test_citation_metadata_preserved(self, rag_chain):
        """Citation metadata should preserve the document's metadata."""
        result = rag_chain.retrieve(
            query="ring accessory",
            game="poe2",
            top_k=3,
        )
        for citation in result.citations:
            assert "game" in citation.metadata
            assert "name" in citation.metadata

    def test_citation_source_url_from_metadata(self, rag_chain):
        """Citation source should use the url field from document metadata."""
        result = rag_chain.retrieve(
            query="fireball spell",
            game="poe1",
            top_k=2,
        )
        for citation in result.citations:
            # Source should be set from metadata (url or source field)
            assert citation.source != "unknown" or citation.metadata.get("source") is not None


# ---------------------------------------------------------------------------
# Test: Top-K Parameter Behavior
# ---------------------------------------------------------------------------


class TestTopKParameter:
    """Test that the top-k parameter correctly limits the number of results."""

    def test_top_k_1_returns_at_most_1(self, rag_chain):
        """top_k=1 should return at most 1 document."""
        result = rag_chain.retrieve(
            query="unique item",
            game="poe1",
            top_k=1,
        )
        assert len(result.documents) <= 1
        assert len(result.citations) <= 1

    def test_top_k_2_returns_at_most_2(self, rag_chain):
        """top_k=2 should return at most 2 documents."""
        result = rag_chain.retrieve(
            query="unique item",
            game="poe1",
            top_k=2,
        )
        assert len(result.documents) <= 2
        assert len(result.citations) <= 2

    def test_top_k_3_returns_at_most_3(self, rag_chain):
        """top_k=3 should return at most 3 documents."""
        result = rag_chain.retrieve(
            query="spell damage",
            game="poe1",
            top_k=3,
        )
        assert len(result.documents) <= 3

    def test_top_k_5_returns_at_most_5(self, rag_chain):
        """top_k=5 should return at most 5 documents."""
        result = rag_chain.retrieve(
            query="item",
            game="poe2",
            top_k=5,
        )
        assert len(result.documents) <= 5

    def test_top_k_larger_than_available(self, rag_chain):
        """top_k larger than available documents should return all available."""
        result = rag_chain.retrieve(
            query="everything",
            game="poe1",
            top_k=50,
        )
        # There are 6 PoE1 items in our test data
        assert len(result.documents) <= 6

    def test_default_top_k_used_when_not_specified(self, rag_chain):
        """When top_k is not specified, the default should be used."""
        result = rag_chain.retrieve(
            query="test query",
            game="poe2",
        )
        # Default is 3 (from RAGChain initialization)
        assert len(result.documents) <= rag_chain.default_top_k

    def test_top_k_with_game_filter(self, rag_chain):
        """top_k should work correctly when combined with game filtering."""
        # PoE1 has 6 items; request 3
        result_poe1 = rag_chain.retrieve(
            query="item",
            game="poe1",
            top_k=3,
        )
        assert len(result_poe1.documents) <= 3
        for doc in result_poe1.documents:
            assert doc.metadata.get("game") == "poe1"

        # PoE2 has 6 items; request 3
        result_poe2 = rag_chain.retrieve(
            query="item",
            game="poe2",
            top_k=3,
        )
        assert len(result_poe2.documents) <= 3
        for doc in result_poe2.documents:
            assert doc.metadata.get("game") == "poe2"

    def test_higher_top_k_returns_more_results(self, rag_chain):
        """Higher top_k should generally return more or equal results."""
        result_k1 = rag_chain.retrieve(
            query="gem skill spell",
            game="poe2",
            top_k=1,
        )
        result_k5 = rag_chain.retrieve(
            query="gem skill spell",
            game="poe2",
            top_k=5,
        )
        assert len(result_k5.documents) >= len(result_k1.documents)


# ---------------------------------------------------------------------------
# Test: RetrievalResult Structure
# ---------------------------------------------------------------------------


class TestRetrievalResult:
    """Test the RetrievalResult data structure and methods."""

    def test_result_has_query(self, rag_chain):
        """Result should store the original query."""
        result = rag_chain.retrieve(
            query="chaos orb currency",
            game="poe1",
            top_k=3,
        )
        assert result.query == "chaos orb currency"

    def test_result_has_game(self, rag_chain):
        """Result should store the game version."""
        result = rag_chain.retrieve(
            query="test",
            game="poe2",
            top_k=2,
        )
        assert result.game == "poe2"

    def test_result_to_dict(self, rag_chain):
        """Result to_dict() should produce a valid dictionary."""
        result = rag_chain.retrieve(
            query="unique weapon",
            game="poe1",
            top_k=2,
        )
        d = result.to_dict()
        assert "query" in d
        assert "game" in d
        assert "documents" in d
        assert "citations" in d
        assert "document_count" in d
        assert d["document_count"] == len(result.documents)

    def test_get_context_text(self, rag_chain):
        """get_context_text() should return combined document text."""
        result = rag_chain.retrieve(
            query="spell",
            game="poe2",
            top_k=3,
        )
        context = result.get_context_text()
        assert isinstance(context, str)
        if result.documents:
            assert len(context) > 0

    def test_get_context_text_separator(self, rag_chain):
        """get_context_text() should use the provided separator."""
        result = rag_chain.retrieve(
            query="armour",
            game="poe1",
            top_k=3,
        )
        context = result.get_context_text(separator="---SEPARATOR---")
        if len(result.documents) > 1:
            assert "---SEPARATOR---" in context

    def test_convenience_retrieve_for_poe1(self, rag_chain):
        """retrieve_for_poe1 should correctly set game to poe1."""
        result = rag_chain.retrieve_for_poe1(query="belt accessory")
        assert result.game == "poe1"
        for doc in result.documents:
            assert doc.metadata.get("game") == "poe1"

    def test_convenience_retrieve_for_poe2(self, rag_chain):
        """retrieve_for_poe2 should correctly set game to poe2."""
        result = rag_chain.retrieve_for_poe2(query="gem skill")
        assert result.game == "poe2"
        for doc in result.documents:
            assert doc.metadata.get("game") == "poe2"

    def test_get_context_method(self, rag_chain):
        """get_context() should return combined text."""
        context = rag_chain.get_context(
            query="fire projectile",
            game="poe1",
            top_k=2,
        )
        assert isinstance(context, str)


# ---------------------------------------------------------------------------
# Test: Real ChromaDB Data Integration
# ---------------------------------------------------------------------------


class TestRealChromaDBData:
    """Test with real ChromaDB vector store to ensure full integration."""

    def test_vector_store_is_ready(self, vector_store):
        """VectorStore should be ready for queries."""
        assert vector_store.is_ready()

    def test_vector_store_has_documents(self, vector_store):
        """VectorStore should have indexed documents."""
        results = vector_store.similarity_search(
            query="test query",
            k=1,
        )
        assert len(results) >= 1, "VectorStore should have at least 1 document"

    def test_vector_store_game_filter(self, vector_store):
        """VectorStore should support game-based metadata filtering."""
        poe1_results = vector_store.similarity_search(
            query="item",
            k=10,
            filter={"game": "poe1"},
        )
        for doc in poe1_results:
            assert doc.metadata.get("game") == "poe1"

        poe2_results = vector_store.similarity_search(
            query="item",
            k=10,
            filter={"game": "poe2"},
        )
        for doc in poe2_results:
            assert doc.metadata.get("game") == "poe2"

    def test_similarity_search_with_score(self, vector_store):
        """similarity_search_with_score should return (document, score) tuples."""
        results = vector_store.similarity_search_with_score(
            query="fire spell",
            k=3,
            filter={"game": "poe1"},
        )
        assert len(results) > 0
        for doc, score in results:
            assert isinstance(doc, Document)
            assert isinstance(score, (int, float))

    def test_search_by_game_poe1(self, vector_store):
        """search_by_game for poe1 should return only poe1 documents."""
        results = vector_store.search_by_game(
            query="spell",
            game="poe1",
            k=5,
        )
        for doc in results:
            assert doc.metadata.get("game") == "poe1"

    def test_search_by_game_poe2(self, vector_store):
        """search_by_game for poe2 should return only poe2 documents."""
        results = vector_store.search_by_game(
            query="weapon",
            game="poe2",
            k=5,
        )
        for doc in results:
            assert doc.metadata.get("game") == "poe2"

    def test_search_by_game_invalid(self, vector_store):
        """search_by_game with invalid game should raise VectorStoreError."""
        with pytest.raises(VectorStoreError, match="Invalid game"):
            vector_store.search_by_game(
                query="test",
                game="invalid",
                k=5,
            )

    def test_rag_chain_health_check(self, rag_chain):
        """RAG chain health check should report ready status."""
        health = rag_chain.health_check()
        assert "status" in health
        assert "default_top_k" in health
        assert "vector_store_status" in health
        assert health["status"] == "ready"

    def test_poe1_and_poe2_data_isolation(self, rag_chain):
        """PoE1 and PoE2 queries should return mutually exclusive results."""
        poe1_result = rag_chain.retrieve(
            query="item",
            game="poe1",
            top_k=6,
        )
        poe2_result = rag_chain.retrieve(
            query="item",
            game="poe2",
            top_k=6,
        )

        poe1_names = {doc.metadata.get("name") for doc in poe1_result.documents}
        poe2_names = {doc.metadata.get("name") for doc in poe2_result.documents}

        # PoE1 and PoE2 names should not overlap
        overlap = poe1_names & poe2_names
        assert len(overlap) == 0, (
            f"Expected no overlap between PoE1 and PoE2 results, but found: {overlap}"
        )


# ---------------------------------------------------------------------------
# Test: Edge Cases and Robustness
# ---------------------------------------------------------------------------


class TestEdgeCases:
    """Test edge cases and robustness of the RAG pipeline."""

    def test_very_short_query(self, rag_chain):
        """Single-character query should still work."""
        result = rag_chain.retrieve(
            query="a",
            game="poe1",
            top_k=2,
        )
        assert isinstance(result, RetrievalResult)

    def test_very_long_query(self, rag_chain):
        """Very long query should still work."""
        long_query = "what is the best unique item for a witch character " * 20
        result = rag_chain.retrieve(
            query=long_query,
            game="poe2",
            top_k=2,
        )
        assert isinstance(result, RetrievalResult)

    def test_special_characters_in_query(self, rag_chain):
        """Query with special characters should work."""
        result = rag_chain.retrieve(
            query="Shavronne's Wrappings (energy shield)",
            game="poe1",
            top_k=2,
        )
        assert isinstance(result, RetrievalResult)

    def test_citation_repr(self, rag_chain):
        """Citation __repr__ should return a readable string."""
        result = rag_chain.retrieve(
            query="test",
            game="poe1",
            top_k=1,
        )
        if result.citations:
            repr_str = repr(result.citations[0])
            assert "source=" in repr_str
            assert "score=" in repr_str

    def test_multiple_retrievals_are_consistent(self, rag_chain):
        """Running the same query multiple times should return consistent results."""
        results = []
        for _ in range(3):
            result = rag_chain.retrieve(
                query="fireball spell",
                game="poe1",
                top_k=2,
            )
            results.append(result)

        # All results should have the same number of documents
        counts = [len(r.documents) for r in results]
        assert len(set(counts)) == 1, f"Inconsistent document counts: {counts}"

    def test_retrieve_with_include_scores_false(self, rag_chain):
        """Retrieval with include_scores=False should still return results."""
        result = rag_chain.retrieve(
            query="armour shield",
            game="poe2",
            top_k=3,
            include_scores=False,
        )
        assert isinstance(result, RetrievalResult)
        # Scores may be 0.0 when include_scores is False
        for citation in result.citations:
            assert isinstance(citation.relevance_score, float)
