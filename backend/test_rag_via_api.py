#!/usr/bin/env python3
"""
Test RAG chain functionality via API.
This script tests:
1. RAGChain class creation and health checks
2. Retrieve with game filtering (poe1, poe2)
3. Retrieve with build context
4. Citation extraction
5. Top-k parameter configuration
"""
import requests
import json

BASE_URL = "http://localhost:8000"

def test_rag_chain_health():
    """Test the RAG chain health check."""
    response = requests.get(f"{BASE_URL}/api/v1/test/rag/health")

    if response.status_code == 200:
            data = response.json()
            print(f"RAG chain health check response: {json.dumps(data, indent=2)}")
        else:
            print(f"Failed to get RAG chain health: {response.status_code} {response.text}")
            return None
    except Exception as e:
        print(f"Error calling health endpoint: {e}")
        return None


def test_rag_retrieve_poe1():
    """Test retrieve with game='poe1'."""
    payload = {
        "query": "Necromancer skills",
        "game": "poe1",
        "top_k": 3
    }

    try:
        response = requests.post(
            f"{BASE_URL}/api/v1/test/rag/retrieve",
            json=payload,
            headers={"Content-Type": "application/json"}
        )

        if response.status_code == 200:
            data = response.json()
            print(f"\nRetrieve POE1 response: {json.dumps(data, indent=2)}")
            return data
        else:
            print(f"Failed: retrieve for POE1: {response.status_code} {response.text}")
            return None
    except Exception as e:
        print(f"Error calling retrieve endpoint: {e}")
        return None


def test_rag_retrieve_poe2():
    """Test retrieve with game='poe2'."""
    payload = {
        "query": "Blood Mage ascendancy",
        "game": "poe2",
        "top_k": 3
    }

    try:
        response = requests.post(
            f"{BASE_URL}/api/v1/test/rag/retrieve",
            json=payload,
            headers={"Content-Type": "application/json"}
        )

        if response.status_code == 200:
            data = response.json()
            print(f"\nRetrieve POE2 response: {json.dumps(data, indent=2)}")
            return data
        else:
            print(f"Failed to retrieve for POE2: {response.status_code} {response.text}")
            return None
    except Exception as e:
        print(f"Error calling retrieve endpoint: {e}")
        return None


def test_rag_retrieve_with_build_context():
    """Test retrieve with build context."""
    payload = {
        "query": "best skills",
        "game": "poe2",
        "top_k": 3,
        "build_context": "Witch - Blood Mage"
    }

    try:
        response = requests.post(
            f"{BASE_URL}/api/v1/test/rag/retrieve",
            json=payload,
            headers={"Content-Type": "application/json"}
        )

        if response.status_code == 200:
            data = response.json()
            print(f"\nRetrieve with build context response: {json.dumps(data, indent=2)}")
            return data
        else:
            print(f"Failed to retrieve with build context: {response.status_code} {response.text}")
            return None
    except Exception as e:
        print(f"Error calling retrieve endpoint: {e}")
        return None


def test_rag_citations():
    """Test citation extraction."""
    payload = {
        "query": "Blood Mage",
        "game": "poe2",
        "top_k": 2
    }

    try:
        response = requests.post(
            f"{BASE_URL}/api/v1/test/rag/retrieve",
            json=payload,
            headers={"Content-Type": "application/json"}
        )

        if response.status_code == 200:
            data = response.json()
            print(f"\nCitation extraction response: {json.dumps(data, indent=2)}")

            citations = data.get("citations", [])
            print(f"Number of citations: {len(citations)}")

            for i, citation in enumerate(citations):
                print(f"Citation {i+1}:")
                print(f"  Content: {citation.get('content', 'N/A')[:100]}...")
                print(f"  Source: {citation.get('source', 'N/A')}")
                print(f"  Relevance: {citation.get('relevance_score', 'N/A')}")
                print(f"  Metadata: {citation.get('metadata', {})}")

            return data
        else:
            print(f"Failed to extract citations: {response.status_code} {response.text}")
            return None
    except Exception as e:
        print(f"Error calling retrieve endpoint: {e}")
        return None


def test_top_k_parameter():
    """Test top-k parameter."""
    print("\nTesting top-k parameter (k=2 vs k=5)...")

    try:
        response = requests.post(
            f"{BASE_URL}/api/v1/test/rag/retrieve",
            json={"query": "Blood Mage", "game": "poe2", "top_k": 2},
            headers={"Content-Type": "application/json"}
        )

        if response.status_code == 200:
            data = response.json()
            print(f"\nRetrieve with top_k=2 response: {json.dumps(data, indent=2)}")

            docs = = data.get("documents", [])
            print(f"Documents count: {len(docs)}")

            return data
        else:
            print(f"Failed to test top-k parameter: {response.status_code} {response.text}")
            return None

    except Exception as e:
        print(f"Error calling retrieve endpoint: {e}")
        return None

    try:
        response = requests.post(
            f"{BASE_URL}/api/v1/test/rag/retrieve",
            json={"query": "Blood Mage", "game": "poe2", "top_k": 5},
            headers={"Content-Type": "application/json"}
        )

        if response.status_code == 200:
            data = response.json()
            print(f"\nRetrieve with top_k=5 response: {json.dumps(data, indent=2)}")

            docs = = data.get("documents", [])
            print(f"Documents count: {len(docs)}")

            return data
        else:
            print(f"Failed to test top-k parameter: {response.status_code} {response.text}")
            return None
    except Exception as e:
        print(f"Error calling retrieve endpoint: {e}")
        return None


def run_all_tests():
    """Run all tests and report results."""
    print("\n" + "="*60)
    print("RAG CHAIN TEST Suite")
    print("="*60)

    tests = [
        ("Health Check", test_rag_chain_health),
        ("Retrieve POE1", test_rag_retrieve_poe1),
        ("Retrieve POE2", test_rag_retrieve_poe2),
        ("Retrieve with Build Context", test_rag_retrieve_with_build_context),
        ("Citation Extraction", test_rag_citations),
        ("Top-K Parameter (k=2 vs k=5)", test_top_k_parameter),
    ]

    results = []
    for test_name, tests:
        try:
            result = test()
            results.append((test_name, "PASS" if result else "FAIL"))
        except Exception as e:
            print(f"Error in {test_name}: {e}")
            results.append((test_name, "FAIL"))

    print("\n" + "="*60)
    print("Test Summary")
    print("="*60)
    passed = sum(1 for r in results if r["PASS"])
    failed = sum(1 for r in results if r["FAIL"])
    print(f"\nPassed: {passed}/{len(tests)}")
    print(f"Failed: {failed}/{len(tests)}")

    return len(results) == 0 and all(r[0] == "PASS"]


if __name__ == "__main__":
    run_all_tests()
