#!/usr/bin/env python3
"""
Quick test for RAG chain - tests core functionality without requiring DB data.
"""
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Test basic imports
print("Testing RAG chain imports...")
try:
    from src.services.rag_chain import (
        RAGChain,
        RAGChainError,
        Citation,
        RetrievalResult,
        get_rag_chain,
        check_rag_chain_health,
    )
    print("✓ Imports successful")
except Exception as e:
    print(f"✗ Import failed: {e}")
    sys.exit(1)

# Test Citation class
print("\nTesting Citation class...")
citation = Citation(
    content="Test content",
    source="https://example.com",
    relevance_score=0.95,
    metadata={"game": "poe2"}
)
assert citation.content == "Test content"
assert citation.source == "https://example.com"
assert citation.relevance_score == 0.95
print(f"✓ Citation created: {citation}")

# Test Citation to_dict
cit_dict = citation.to_dict()
assert cit_dict["content"] == "Test content"
assert cit_dict["source"] == "https://example.com"
print(f"✓ Citation to_dict works: {cit_dict}")

# Test RetrievalResult class
print("\nTesting RetrievalResult class...")
from langchain_core.documents import Document

docs = [
    Document(page_content="Doc 1", metadata={"game": "poe2"}),
    Document(page_content="Doc 2", metadata={"game": "poe2"}),
]

citations = [
    Citation(content="Cit 1", source="src1", relevance_score=0.9),
    Citation(content="Cit 2", source="src2", relevance_score=0.8),
]

result = RetrievalResult(
    query="test query",
    game="poe2",
    documents=docs,
    citations=citations,
    build_context="Witch"
)

assert result.query == "test query"
assert result.game == "poe2"
assert len(result.documents) == 2
assert len(result.citations) == 2
assert result.build_context == "Witch"
print(f"✓ RetrievalResult created")

# Test get_context_text
context_text = result.get_context_text()
assert "Doc 1" in context_text
assert "Doc 2" in context_text
print(f"✓ get_context_text works: {context_text[:50]}...")

# Test result to_dict
result_dict = result.to_dict()
assert result_dict["query"] == "test query"
assert result_dict["game"] == "poe2"
assert result_dict["document_count"] == 2
print(f"✓ RetrievalResult to_dict works")

# Test RAGChain initialization
print("\nTesting RAGChain initialization...")
try:
    rag_chain = RAGChain()
    print(f"✓ RAGChain initialized")
    print(f"  Default top_k: {rag_chain.default_top_k}")
    print(f"  Vector store type: {type(rag_chain.vector_store).__name__}")
except Exception as e:
    print(f"✗ RAGChain initialization failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# Test game validation
print("\nTesting game validation...")
try:
    rag_chain._validate_game("poe1")
    print("✓ poe1 validation passed")
except Exception as e:
    print(f"✗ poe1 validation failed: {e}")

try:
    rag_chain._validate_game("poe2")
    print("✓ poe2 validation passed")
except Exception as e:
    print(f"✗ poe2 validation failed: {e}")

try:
    rag_chain._validate_game("POE1")
    print("✓ POE1 validation passed (case insensitive)")
except Exception as e:
    print(f"✗ POE1 validation failed: {e}")

try:
    rag_chain._validate_game("invalid")
    print("✗ Should have raised error for invalid game")
    sys.exit(1)
except RAGChainError as e:
    print(f"✓ Invalid game correctly rejected: {e}")

# Test metadata filter building
print("\nTesting metadata filter building...")
filter1 = rag_chain._build_metadata_filter("poe1")
assert filter1["game"] == "poe1"
print(f"✓ Filter without build context: {filter1}")

filter2 = rag_chain._build_metadata_filter("poe2", "Witch - Blood Mage")
assert filter2["game"] == "poe2"
assert "build_context" in filter2
print(f"✓ Filter with build context: {filter2}")

# Test citation extraction
print("\nTesting citation extraction...")
test_docs = [
    Document(
        page_content="Blood Mage ascendancy",
        metadata={"source": "https://poedb.tw/blood_mage", "game": "poe2"}
    ),
    Document(
        page_content="Warlock ascendancy",
        metadata={"url": "https://poedb.tw/warlock", "game": "poe2"}
    ),
    Document(
        page_content="Generic content",
        metadata={"filename": "local.txt", "game": "poe1"}
    ),
]

citations = rag_chain._extract_citations(test_docs)
assert len(citations) == 3
assert citations[0].source == "https://poedb.tw/blood_mage"
assert citations[1].source == "https://poedb.tw/warlock"
assert citations[2].source == "local.txt"
print(f"✓ Citation extraction works")
for i, cit in enumerate(citations):
    print(f"  {i+1}. {cit}")

# Test citation extraction with scores
scores = [0.95, 0.88, 0.72]
citations_with_scores = rag_chain._extract_citations(test_docs, scores)
assert citations_with_scores[0].relevance_score == 0.95
assert citations_with_scores[1].relevance_score == 0.88
assert citations_with_scores[2].relevance_score == 0.72
print(f"✓ Citation extraction with scores works")

# Test health check
print("\nTesting health check...")
health = rag_chain.health_check()
print(f"Health status: {health['status']}")
print(f"Default top_k: {health['default_top_k']}")
print(f"Vector store status: {health['vector_store_status']}")
print(f"Message: {health['message']}")

# Test error handling
print("\nTesting error handling...")
try:
    rag_chain.retrieve(query="", game="poe2")
    print("✗ Should have raised error for empty query")
    sys.exit(1)
except RAGChainError as e:
    print(f"✓ Empty query correctly rejected: {e}")

try:
    rag_chain.retrieve(query="test", game="invalid")
    print("✗ Should have raised error for invalid game")
    sys.exit(1)
except RAGChainError as e:
    print(f"✓ Invalid game correctly rejected: {e}")

# Test global instance
print("\nTesting global instance...")
rag1 = get_rag_chain()
rag2 = get_rag_chain()
assert rag1 is rag2
print("✓ Global instance returns same object")

# Test global health check
print("\nTesting global health check...")
global_health = check_rag_chain_health()
print(f"Global health status: {global_health['status']}")

print("\n" + "="*60)
print("ALL TESTS PASSED!")
print("="*60)
