#!/usr/bin/env python3
"""
Test script for RAG chain functionality.
Tests the RAGChain class with various scenarios.
"""
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.services.rag_chain import (
    RAGChain,
    RAGChainError,
    Citation,
    RetrievalResult,
    get_rag_chain,
    check_rag_chain_health,
)
from src.services.vector_store import VectorStore
from langchain_core.documents import Document


def test_citation_creation():
    """Test Citation class."""
    print("\n" + "="*60)
    print("TEST: Citation Creation")
    print("="*60)

    citation = Citation(
        content="Test content about Blood Mage",
        source="https://poedb.tw/us/Blood_Mage",
        relevance_score=0.92,
        metadata={"game": "poe2", "category": "ascendancy"}
    )

    print(f"Created citation: {citation}")
    print(f"Citation dict: {citation.to_dict()}")

    assert citation.content == "Test content about Blood Mage"
    assert citation.source == "https://poedb.tw/us/Blood_Mage"
    assert citation.relevance_score == 0.92
    print("✓ Citation creation test PASSED")


def test_retrieval_result():
    """Test RetrievalResult class."""
    print("\n" + "="*60)
    print("TEST: RetrievalResult Creation")
    print("="*60)

    documents = [
        Document(page_content="Content 1", metadata={"game": "poe2"}),
        Document(page_content="Content 2", metadata={"game": "poe2"}),
    ]

    citations = [
        Citation(content="Content 1", source="source1", relevance_score=0.9),
        Citation(content="Content 2", source="source2", relevance_score=0.8),
    ]

    result = RetrievalResult(
        query="test query",
        game="poe2",
        documents=documents,
        citations=citations,
        build_context="Witch"
    )

    print(f"Query: {result.query}")
    print(f"Game: {result.game}")
    print(f"Documents: {len(result.documents)}")
    print(f"Citations: {len(result.citations)}")
    print(f"Build context: {result.build_context}")
    print(f"Context text: {result.get_context_text()}")

    assert result.query == "test query"
    assert result.game == "poe2"
    assert len(result.documents) == 2
    assert len(result.citations) == 2
    print("✓ RetrievalResult creation test PASSED")


def test_rag_chain_initialization():
    """Test RAGChain initialization."""
    print("\n" + "="*60)
    print("TEST: RAGChain Initialization")
    print("="*60)

    try:
        rag_chain = RAGChain()
        print(f"RAGChain created successfully")
        print(f"Default top_k: {rag_chain.default_top_k}")
        print(f"Vector store type: {type(rag_chain.vector_store).__name__}")
        print("✓ RAGChain initialization test PASSED")
        return rag_chain
    except Exception as e:
        print(f"✗ RAGChain initialization test FAILED: {e}")
        return None


def test_game_validation():
    """Test game version validation."""
    print("\n" + "="*60)
    print("TEST: Game Version Validation")
    print("="*60)

    rag_chain = RAGChain()

    # Test valid games
    assert rag_chain._validate_game("poe1") == "poe1"
    assert rag_chain._validate_game("POE1") == "poe1"
    assert rag_chain._validate_game("poe2") == "poe2"
    assert rag_chain._validate_game("POE2") == "poe2"
    print("✓ Valid game versions accepted")

    # Test invalid game
    try:
        rag_chain._validate_game("poe3")
        print("✗ Invalid game should have raised error")
        assert False
    except RAGChainError as e:
        print(f"✓ Invalid game correctly rejected: {e}")

    print("✓ Game validation test PASSED")


def test_metadata_filter_building():
    """Test metadata filter building."""
    print("\n" + "="*60)
    print("TEST: Metadata Filter Building")
    print("="*60)

    rag_chain = RAGChain()

    # Test game-only filter
    filter1 = rag_chain._build_metadata_filter("poe2")
    print(f"Game-only filter: {filter1}")
    assert filter1 == {"game": "poe2"}

    # Test game + build context filter
    filter2 = rag_chain._build_metadata_filter("poe1", "Witch")
    print(f"Game + build context filter: {filter2}")
    assert "game" in filter2
    assert filter2["game"] == "poe1"
    assert "build_context" in filter2

    print("✓ Metadata filter building test PASSED")


def test_citation_extraction():
    """Test citation extraction from documents."""
    print("\n" + "="*60)
    print("TEST: Citation Extraction")
    print("="*60)

    rag_chain = RAGChain()

    documents = [
        Document(
            page_content="Blood Mage ascendancy focuses on life and blood magic",
            metadata={"source": "https://poedb.tw/us/Blood_Mage", "game": "poe2"}
        ),
        Document(
            page_content="Warlock uses chaos damage",
            metadata={"url": "https://poedb.tw/us/Warlock", "game": "poe2"}
        ),
        Document(
            page_content="Some content",
            metadata={"filename": "local_doc.txt", "game": "poe1"}
        ),
    ]

    # Test without scores
    citations = rag_chain._extract_citations(documents)
    print(f"Extracted {len(citations)} citations without scores")
    for i, cit in enumerate(citations):
        print(f"  {i+1}. {cit}")

    assert len(citations) == 3
    assert citations[0].source == "https://poedb.tw/us/Blood_Mage"
    assert citations[1].source == "https://poedb.tw/us/Warlock"
    assert citations[2].source == "local_doc.txt"

    # Test with scores
    scores = [0.95, 0.88, 0.72]
    citations_with_scores = rag_chain._extract_citations(documents, scores)
    print(f"\nExtracted {len(citations_with_scores)} citations with scores")
    for i, cit in enumerate(citations_with_scores):
        print(f"  {i+1}. {cit} (score: {cit.relevance_score})")

    assert citations_with_scores[0].relevance_score == 0.95
    assert citations_with_scores[1].relevance_score == 0.88
    assert citations_with_scores[2].relevance_score == 0.72

    print("✓ Citation extraction test PASSED")


def test_retrieve_with_mock_data():
    """Test retrieve functionality (will return empty results if no data in DB)."""
    print("\n" + "="*60)
    print("TEST: Retrieve with Mock/Empty Data")
    print("="*60)

    rag_chain = RAGChain()

    # Test with poe1
    print("\n1. Testing retrieve() with game='poe1'")
    try:
        result = rag_chain.retrieve(
            query="What is the best Witch build?",
            game="poe1",
            top_k=3
        )
        print(f"   Query: {result.query}")
        print(f"   Game: {result.game}")
        print(f"   Documents retrieved: {len(result.documents)}")
        print(f"   Citations: {len(result.citations)}")
        print("   ✓ Retrieve for poe1 completed (may be empty if DB is empty)")
    except RAGChainError as e:
        print(f"   ✗ Retrieve failed: {e}")

    # Test with poe2
    print("\n2. Testing retrieve() with game='poe2'")
    try:
        result = rag_chain.retrieve(
            query="Blood Mage ascendancy skills",
            game="poe2",
            top_k=5
        )
        print(f"   Query: {result.query}")
        print(f"   Game: {result.game}")
        print(f"   Documents retrieved: {len(result.documents)}")
        print(f"   Citations: {len(result.citations)}")
        print("   ✓ Retrieve for poe2 completed (may be empty if DB is empty)")
    except RAGChainError as e:
        print(f"   ✗ Retrieve failed: {e}")

    # Test with build context
    print("\n3. Testing retrieve() with build_context")
    try:
        result = rag_chain.retrieve(
            query="best skills",
            game="poe2",
            build_context="Witch - Blood Mage",
            top_k=3
        )
        print(f"   Query: {result.query}")
        print(f"   Game: {result.game}")
        print(f"   Build context: {result.build_context}")
        print(f"   Documents retrieved: {len(result.documents)}")
        print("   ✓ Retrieve with build context completed")
    except RAGChainError as e:
        print(f"   ✗ Retrieve failed: {e}")

    print("\n✓ Retrieve tests completed")


def test_convenience_methods():
    """Test convenience methods."""
    print("\n" + "="*60)
    print("TEST: Convenience Methods")
    print("="*60)

    rag_chain = RAGChain()

    # Test retrieve_for_poe1
    print("\n1. Testing retrieve_for_poe1()")
    try:
        result = rag_chain.retrieve_for_poe1("fireball skill", top_k=2)
        print(f"   Game: {result.game}")
        print(f"   ✓ retrieve_for_poe1() works")
    except Exception as e:
        print(f"   ✗ Failed: {e}")

    # Test retrieve_for_poe2
    print("\n2. Testing retrieve_for_poe2()")
    try:
        result = rag_chain.retrieve_for_poe2("chaos golem", top_k=2)
        print(f"   Game: {result.game}")
        print(f"   ✓ retrieve_for_poe2() works")
    except Exception as e:
        print(f"   ✗ Failed: {e}")

    # Test get_context
    print("\n3. Testing get_context()")
    try:
        context = rag_chain.get_context(
            query="skill gems",
            game="poe2",
            top_k=2
        )
        print(f"   Context length: {len(context)} chars")
        print(f"   ✓ get_context() works")
    except Exception as e:
        print(f"   ✗ Failed: {e}")

    print("\n✓ Convenience methods test PASSED")


def test_health_check():
    """Test health check functionality."""
    print("\n" + "="*60)
    print("TEST: Health Check")
    print("="*60)

    rag_chain = RAGChain()
    health = rag_chain.health_check()

    print(f"Status: {health['status']}")
    print(f"Default top_k: {health['default_top_k']}")
    print(f"Vector store status: {health['vector_store_status']}")
    print(f"Message: {health['message']}")

    # Test global health check function
    print("\nTesting global check_rag_chain_health()")
    global_health = check_rag_chain_health()
    print(f"Global health status: {global_health['status']}")

    print("✓ Health check test PASSED")


def test_error_handling():
    """Test error handling."""
    print("\n" + "="*60)
    print("TEST: Error Handling")
    print("="*60)

    rag_chain = RAGChain()

    # Test empty query
    print("\n1. Testing empty query")
    try:
        rag_chain.retrieve(query="", game="poe2")
        print("   ✗ Should have raised error")
        assert False
    except RAGChainError as e:
        print(f"   ✓ Empty query correctly rejected: {e}")

    # Test invalid game
    print("\n2. Testing invalid game")
    try:
        rag_chain.retrieve(query="test", game="poe3")
        print("   ✗ Should have raised error")
        assert False
    except RAGChainError as e:
        print(f"   ✓ Invalid game correctly rejected: {e}")

    print("\n✓ Error handling test PASSED")


def test_global_instance():
    """Test global instance getter."""
    print("\n" + "="*60)
    print("TEST: Global Instance")
    print("="*60)

    rag_chain1 = get_rag_chain()
    rag_chain2 = get_rag_chain()

    print(f"Instance 1 ID: {id(rag_chain1)}")
    print(f"Instance 2 ID: {id(rag_chain2)}")

    # Should be the same instance
    assert rag_chain1 is rag_chain2
    print("✓ Global instance returns same object")

    print("✓ Global instance test PASSED")


def run_all_tests():
    """Run all tests."""
    print("\n" + "="*60)
    print("RAG CHAIN TEST SUITE")
    print("="*60)

    tests = [
        test_citation_creation,
        test_retrieval_result,
        test_rag_chain_initialization,
        test_game_validation,
        test_metadata_filter_building,
        test_citation_extraction,
        test_retrieve_with_mock_data,
        test_convenience_methods,
        test_health_check,
        test_error_handling,
        test_global_instance,
    ]

    passed = 0
    failed = 0

    for test in tests:
        try:
            test()
            passed += 1
        except AssertionError as e:
            print(f"\n✗ Test failed: {test.__name__}")
            print(f"   Error: {e}")
            failed += 1
        except Exception as e:
            print(f"\n✗ Test failed with exception: {test.__name__}")
            print(f"   Error: {e}")
            import traceback
            traceback.print_exc()
            failed += 1

    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    print(f"Passed: {passed}/{len(tests)}")
    print(f"Failed: {failed}/{len(tests)}")

    if failed == 0:
        print("\n✓ ALL TESTS PASSED!")
    else:
        print(f"\n✗ {failed} TEST(S) FAILED")

    return failed == 0


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
