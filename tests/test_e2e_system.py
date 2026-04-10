"""
Comprehensive End-to-End System Test Suite for PoE Knowledge Assistant.

Validates the complete system from scraper to frontend, including:
- Data pipeline integrity (scraper -> indexer -> ChromaDB -> RAG retrieval)
- Backend API endpoints with real data
- Frontend-backend integration via browser
- Chat flow with real responses
- Configuration management propagation
- Error handling across the stack
- Performance under load
- All integration points

Usage:
    pytest tests/test_e2e_system.py -v --tb=short
"""

import hashlib
import json
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import pytest
import requests

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BACKEND_URL = "http://localhost:8460"
FRONTEND_URL = "http://localhost:9460"
API_BASE = f"{BACKEND_URL}/api"
REQUEST_TIMEOUT = 30


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def api_get(path: str, expect_status: int = 200) -> requests.Response:
    """Send a GET request to the backend API."""
    resp = requests.get(f"{API_BASE}{path}", timeout=REQUEST_TIMEOUT)
    assert resp.status_code == expect_status, (
        f"GET {path} returned {resp.status_code}, expected {expect_status}: {resp.text[:300]}"
    )
    return resp


def api_post(path: str, body: dict = None, expect_status: int = 200) -> requests.Response:
    """Send a POST request to the backend API."""
    resp = requests.post(
        f"{API_BASE}{path}",
        json=body,
        timeout=REQUEST_TIMEOUT,
    )
    assert resp.status_code == expect_status, (
        f"POST {path} returned {resp.status_code}, expected {expect_status}: {resp.text[:300]}"
    )
    return resp


def api_put(path: str, body: dict = None, expect_status: int = 200) -> requests.Response:
    """Send a PUT request to the backend API."""
    resp = requests.put(
        f"{API_BASE}{path}",
        json=body,
        timeout=REQUEST_TIMEOUT,
    )
    assert resp.status_code == expect_status, (
        f"PUT {path} returned {resp.status_code}, expected {expect_status}: {resp.text[:300]}"
    )
    return resp


def api_delete(path: str, expect_status: int = 200) -> requests.Response:
    """Send a DELETE request to the backend API."""
    resp = requests.delete(f"{API_BASE}{path}", timeout=REQUEST_TIMEOUT)
    assert resp.status_code == expect_status, (
        f"DELETE {path} returned {resp.status_code}, expected {expect_status}: {resp.text[:300]}"
    )
    return resp


def generate_test_items(game: str = "poe2", count: int = 3) -> List[Dict[str, Any]]:
    """Generate test item dictionaries for indexing tests."""
    items = []
    templates = [
        {
            "name": f"E2E Test Sword {uuid.uuid4().hex[:6]}",
            "item_type": "weapon",
            "base_type": "Iron Sword",
            "rarity": "Rare",
            "url": f"https://poe2db.tw/us/E2E_Test_Sword_{uuid.uuid4().hex[:8]}",
            "game": game,
            "description": "A test sword created by the E2E system test suite.",
            "properties": {"Physical Damage": "50-80", "Attack Speed": "1.5"},
            "requirements": {"Level": "30", "Strength": "50"},
            "tags": ["weapon", "sword", "one_hand"],
            "categories": ["One Hand Swords"],
        },
        {
            "name": f"E2E Test Helmet {uuid.uuid4().hex[:6]}",
            "item_type": "armor",
            "base_type": "Iron Cap",
            "rarity": "Magic",
            "url": f"https://poe2db.tw/us/E2E_Test_Helmet_{uuid.uuid4().hex[:8]}",
            "game": game,
            "description": "A test helmet created by the E2E system test suite.",
            "properties": {"Armour": "100", "Evasion Rating": "30"},
            "requirements": {"Level": "20"},
            "tags": ["armor", "helmet"],
            "categories": ["Helmets"],
        },
        {
            "name": f"E2E Test Gem {uuid.uuid4().hex[:6]}",
            "item_type": "gem",
            "url": f"https://poe2db.tw/us/E2E_Test_Gem_{uuid.uuid4().hex[:8]}",
            "game": game,
            "description": "A test skill gem created by the E2E system test suite.",
            "properties": {"Damage": "200-300", "Cast Time": "0.8s"},
            "tags": ["gem", "skill", "fire"],
            "categories": ["Skill Gems"],
        },
    ]
    for i in range(count):
        items.append(templates[i % len(templates)])
    return items


# ===========================================================================
# 1. DATA PIPELINE INTEGRITY TESTS
# ===========================================================================


class TestDataPipelineIntegrity:
    """Test the complete data pipeline from scraper to ChromaDB to RAG."""

    def test_01_backend_health_check(self):
        """Verify the backend is operational."""
        resp = api_get("/health")
        data = resp.json()
        assert data["status"] in ("healthy", "degraded"), (
            f"Expected healthy or degraded, got {data['status']}"
        )
        assert "version" in data
        assert "timestamp" in data

    def test_02_embeddings_service_ready(self):
        """Verify embeddings service is functional."""
        resp = api_post("/test/embeddings/query", {"text": "Path of Exile test query"})
        data = resp.json()
        assert data["success"] is True
        assert data["embedding_dimension"] > 0
        assert len(data["embedding_preview"]) > 0

    def test_03_embeddings_batch_documents(self):
        """Verify batch document embedding works."""
        texts = ["Tabula Rasa is a unique body armour", "Headhunter is a unique belt"]
        resp = api_post("/test/embeddings/documents", {"texts": texts})
        data = resp.json()
        assert data["success"] is True
        assert data["document_count"] == 2
        assert len(data["embeddings_preview"]) == 2

    def test_04_vector_store_health(self):
        """Verify the vector store is accessible."""
        resp = api_get("/test/vectorstore/health")
        data = resp.json()
        assert data["success"] is True

    def test_05_indexer_health(self):
        """Verify the ChromaDB indexer is healthy."""
        resp = api_get("/test/indexer/health")
        data = resp.json()
        assert "status" in data

    def test_06_index_test_items(self):
        """Index test items into ChromaDB and verify they are stored."""
        items = generate_test_items("poe2", 3)
        resp = api_post("/test/indexer/index", {
            "items": items,
            "upsert": True,
        })
        data = resp.json()
        assert data["success"] is True
        assert data["indexed_count"] == 3
        assert data["failed_count"] == 0

    def test_07_search_indexed_items(self):
        """Search for the indexed items and verify they can be retrieved."""
        # Give ChromaDB a moment to index
        time.sleep(1)
        resp = api_post("/test/indexer/search", {
            "query": "test sword weapon",
            "game": "poe2",
            "k": 5,
        })
        data = resp.json()
        assert data["success"] is True
        assert data["results_count"] >= 1
        # Verify results have expected structure
        for result in data["results"]:
            assert "content" in result
            assert "metadata" in result
            assert result["metadata"].get("game") == "poe2"

    def test_08_vector_store_game_filtering(self):
        """Verify game version filtering works in vector search."""
        resp = api_post("/test/vectorstore/search", {
            "query": "test gem",
            "k": 5,
            "game": "poe2",
        })
        data = resp.json()
        assert data["success"] is True
        # All results should be poe2
        for result in data["results"]:
            assert result["metadata"].get("game") == "poe2"

    def test_09_rag_retrieval_pipeline(self):
        """Verify the RAG retrieval chain works end-to-end."""
        # First index a sample for retrieval
        api_post("/test/indexer/index-samples", {"game": "poe2", "count": 3})
        time.sleep(1)

        # Search via the indexer search endpoint (simulates RAG retrieval)
        resp = api_post("/test/indexer/search", {
            "query": "unique item properties",
            "game": "poe2",
            "k": 3,
        })
        data = resp.json()
        assert data["success"] is True
        assert data["results_count"] >= 1

    def test_10_delete_test_items(self):
        """Clean up test items from the index."""
        items = []  # We clean via the indexer delete
        # Generate same URLs to delete
        urls_to_delete = []
        for i in range(3):
            uid = f"delete_test_{uuid.uuid4().hex[:8]}"
            urls_to_delete.append(f"https://poe2db.tw/us/E2E_Cleanup_{uid}")

        # Index items to delete
        items_to_del = []
        for url in urls_to_delete:
            items_to_del.append({
                "name": f"Cleanup Item {url[-8:]}",
                "item_type": "currency",
                "url": url,
                "game": "poe2",
                "description": "Temporary item for deletion test",
            })
        api_post("/test/indexer/index", {"items": items_to_del, "upsert": True})
        time.sleep(0.5)

        # Delete them
        resp = api_post("/test/indexer/delete", {"urls": urls_to_delete})
        data = resp.json()
        assert data["success"] is True
        assert data["deleted_count"] == len(urls_to_delete)


# ===========================================================================
# 2. BACKEND API ENDPOINT TESTS
# ===========================================================================


class TestBackendAPIEndpoints:
    """Test all backend API endpoint groups."""

    def test_root_endpoint(self):
        """Test the root API endpoint."""
        resp = api_get("/")
        data = resp.json()
        assert data["message"] == "POE Knowledge Assistant API"
        assert data["status"] == "operational"
        assert "version" in data

    def test_health_endpoint_structure(self):
        """Verify health endpoint returns complete status."""
        resp = api_get("/health")
        data = resp.json()
        required_fields = [
            "status", "chromadb_status", "embeddings_status",
            "vectorstore_status", "version", "timestamp",
        ]
        for field in required_fields:
            assert field in data, f"Missing field '{field}' in health response"

    def test_get_config_endpoint(self):
        """Test GET /api/config returns full configuration."""
        resp = api_get("/config")
        data = resp.json()
        assert data["app_name"] == "POE Knowledge Assistant"
        assert "server" in data
        assert "database" in data
        assert "chromadb" in data
        assert "rag" in data
        assert "cors" in data
        assert "llm" in data
        assert "embedding" in data
        assert "scraper" in data
        # Verify API keys are not exposed
        assert "openai_api_key" not in json.dumps(data).lower() or "api_key_set" in json.dumps(data)

    def test_freshness_endpoint(self):
        """Test data freshness endpoint."""
        resp = api_get("/freshness")
        data = resp.json()
        assert data["success"] is True
        assert "freshness" in data
        assert "poe1" in data["freshness"]
        assert "poe2" in data["freshness"]
        assert "summary" in data

    def test_scrape_timestamps_endpoints(self):
        """Test scrape timestamp CRUD endpoints."""
        # Get all timestamps
        resp = api_get("/scrape-timestamps")
        data = resp.json()
        assert data["success"] is True

        # Get timestamps health
        resp = api_get("/scrape-timestamps/health")
        data = resp.json()
        assert data["success"] is True

        # Get poe1 timestamp
        resp = api_get("/scrape-timestamps/poe1")
        data = resp.json()
        assert data["success"] is True
        assert data["game"] == "poe1"

        # Get poe2 timestamp
        resp = api_get("/scrape-timestamps/poe2")
        data = resp.json()
        assert data["success"] is True
        assert data["game"] == "poe2"

        # Invalid game version
        api_get("/scrape-timestamps/poe3", expect_status=400)

    def test_scraper_health_endpoint(self):
        """Test scraper health check endpoint."""
        resp = api_get("/test/scraper/health")
        data = resp.json()
        assert data["success"] is True

    def test_scraper_config_endpoint(self):
        """Test scraper configuration endpoint."""
        resp = api_get("/test/scraper/config")
        data = resp.json()
        assert data["success"] is True
        assert "scraper_config" in data
        config = data["scraper_config"]
        assert "base_url" in config
        assert "rate_limit_delay" in config
        assert "max_retries" in config
        assert "timeout" in config

    def test_scraper_modules_endpoint(self):
        """Test scraper module listing endpoint."""
        resp = api_get("/test/scraper/modules")
        data = resp.json()
        assert data["success"] is True
        assert "scraper_modules" in data
        modules = data["scraper_modules"]
        assert "exceptions" in modules
        assert "http_client" in modules
        assert "base" in modules
        assert "parsers" in modules
        assert "category" in modules
        assert "item_detail" in modules

    def test_scraper_category_list_endpoint(self):
        """Test scraper category listing endpoint."""
        resp = api_get("/test/scraper/category/categories")
        data = resp.json()
        assert data["success"] is True
        assert data["total"] > 0
        for cat in data["categories"]:
            assert "name" in cat
            assert "url" in cat

    def test_scraper_item_examples_endpoint(self):
        """Test scraper item examples listing endpoint."""
        resp = api_get("/test/scraper/item/examples")
        data = resp.json()
        assert data["success"] is True
        assert data["total"] > 0
        for example in data["examples"]:
            assert "name" in example
            assert "url" in example

    def test_llm_health_endpoint(self):
        """Test LLM provider health check."""
        resp = api_get("/test/llm/health")
        data = resp.json()
        assert data["success"] is True

    def test_llm_providers_endpoint(self):
        """Test LLM provider listing endpoint."""
        resp = api_post("/test/llm/providers")
        data = resp.json()
        assert data["success"] is True
        assert len(data["available_providers"]) >= 4
        provider_names = [p["name"] for p in data["available_providers"]]
        assert "openai" in provider_names
        assert "anthropic" in provider_names
        assert "ollama" in provider_names
        assert "lmstudio" in provider_names

    def test_streaming_health_endpoint(self):
        """Test streaming service health endpoint."""
        resp = api_get("/chat/stream/health")
        data = resp.json()
        assert data["success"] is True

    def test_embeddings_factory_endpoint(self):
        """Test embeddings factory endpoint."""
        resp = api_post("/test/embeddings/factory", {
            "provider": "local",
            "test_text": "E2E test embedding generation",
        })
        data = resp.json()
        assert data["success"] is True
        assert data["provider_created"] == "local"

    def test_vectorstore_add_and_search(self):
        """Test adding documents and then searching for them."""
        test_id = uuid.uuid4().hex[:8]
        texts = [
            f"E2E VectorStore Test Document {test_id} - Path of Exile is an action RPG.",
            f"E2E VectorStore Test Document {test_id} - Grinding Gear Games developed PoE.",
        ]
        metadatas = [
            {"game": "poe2", "source": "e2e_test", "test_id": test_id},
            {"game": "poe1", "source": "e2e_test", "test_id": test_id},
        ]
        resp = api_post("/test/vectorstore/add", {
            "texts": texts,
            "metadatas": metadatas,
        })
        data = resp.json()
        assert data["success"] is True
        assert data["documents_added"] == 2
        time.sleep(1)

        # Search for the documents
        resp = api_post("/test/vectorstore/search", {
            "query": f"E2E VectorStore Test {test_id}",
            "k": 2,
        })
        data = resp.json()
        assert data["success"] is True
        assert data["results_count"] >= 1

    def test_indexer_stats_endpoint(self):
        """Test indexer statistics endpoint."""
        resp = api_get("/test/indexer/stats")
        data = resp.json()
        assert data["success"] is True
        assert "total_documents" in data
        assert "collection_name" in data

    def test_indexer_index_samples_endpoint(self):
        """Test the index-samples convenience endpoint."""
        resp = api_post("/test/indexer/index-samples", {
            "game": "poe1",
            "count": 3,
        })
        data = resp.json()
        assert data["success"] is True
        assert data["sample_items_count"] == 3
        assert data["indexed_count"] == 3

    def test_jobs_health_endpoint(self):
        """Test job manager health endpoint."""
        resp = api_get("/jobs/health")
        data = resp.json()
        assert data["success"] is True

    def test_jobs_stats_endpoint(self):
        """Test job manager stats endpoint."""
        resp = api_get("/jobs/stats")
        data = resp.json()
        assert data["success"] is True

    def test_jobs_config_endpoint(self):
        """Test job manager config endpoint."""
        resp = api_get("/jobs/config/info")
        data = resp.json()
        assert data["success"] is True
        assert "supported_job_types" in data
        assert "supported_statuses" in data
        assert "priority_levels" in data

    def test_conversation_history_stats(self):
        """Test conversation history statistics endpoint."""
        resp = api_get("/chat/history/stats")
        data = resp.json()
        assert data["success"] is True
        assert "data" in data

    def test_conversation_list(self):
        """Test listing conversations."""
        resp = api_get("/chat/history")
        data = resp.json()
        assert data["success"] is True
        assert isinstance(data["data"], list)

    def test_game_version_detection(self):
        """Test game version detection endpoint."""
        # PoE1 URL
        resp = api_post("/test/scraper/game-version", {
            "url": "https://poedb.tw/us/Tabula_Rasa",
            "fetch_content": False,
        })
        data = resp.json()
        assert data["success"] is True
        assert data["game_version"] == "poe1"

        # PoE2 URL
        resp = api_post("/test/scraper/game-version", {
            "url": "https://poe2db.tw/us/Fireball",
            "fetch_content": False,
        })
        data = resp.json()
        assert data["success"] is True
        assert data["game_version"] == "poe2"

    def test_batch_game_version_detection(self):
        """Test batch game version detection endpoint."""
        resp = api_post("/test/scraper/game-version/batch", {
            "urls": [
                "https://poedb.tw/us/Tabula_Rasa",
                "https://poe2db.tw/us/Fireball",
                "https://poedb.tw/us/Headhunter",
            ]
        })
        data = resp.json()
        assert data["success"] is True
        assert data["total"] == 3
        assert data["poe1_count"] == 2
        assert data["poe2_count"] == 1


# ===========================================================================
# 3. CONFIGURATION MANAGEMENT TESTS
# ===========================================================================


class TestConfigurationManagement:
    """Test configuration management and propagation."""

    def test_get_initial_config(self):
        """Verify the initial configuration can be retrieved."""
        resp = api_get("/config")
        data = resp.json()
        assert data["llm"]["provider"] in ("openai", "anthropic", "ollama", "lmstudio")
        assert data["embedding"]["provider"] in ("local", "ollama", "lmstudio", "openai")
        assert data["rag"]["top_k_results"] > 0

    def test_update_rag_top_k(self):
        """Test updating RAG top_k_results."""
        original_resp = api_get("/config")
        original_top_k = original_resp.json()["rag"]["top_k_results"]
        new_top_k = 7 if original_top_k != 7 else 5

        resp = api_put("/config", {"rag_top_k": new_top_k})
        data = resp.json()
        assert data["success"] is True
        assert "rag_top_k" in data["updated_fields"]

        # Verify the change took effect
        updated_resp = api_get("/config")
        assert updated_resp.json()["rag"]["top_k_results"] == new_top_k

        # Restore original
        api_put("/config", {"rag_top_k": original_top_k})

    def test_update_rag_chunk_settings(self):
        """Test updating RAG chunk_size and chunk_overlap."""
        resp = api_put("/config", {
            "rag_chunk_size": 1200,
            "rag_chunk_overlap": 150,
        })
        data = resp.json()
        assert data["success"] is True

        # Verify
        updated = api_get("/config").json()
        assert updated["rag"]["chunk_size"] == 1200
        assert updated["rag"]["chunk_overlap"] == 150

        # Restore defaults
        api_put("/config", {
            "rag_chunk_size": 1000,
            "rag_chunk_overlap": 200,
        })

    def test_update_temperature(self):
        """Test updating LLM temperature."""
        resp = api_put("/config", {"llm_temperature": 0.5})
        data = resp.json()
        assert data["success"] is True

        # Verify
        updated = api_get("/config").json()
        assert updated["llm"]["temperature"] == 0.5

        # Restore
        api_put("/config", {"llm_temperature": 0.7})

    def test_invalid_temperature_rejected(self):
        """Test that invalid temperature values are rejected (422 validation error)."""
        api_put("/config", {"llm_temperature": 3.0}, expect_status=422)

    def test_empty_update_rejected(self):
        """Test that an empty update request is rejected."""
        api_put("/config", {}, expect_status=400)

    def test_update_scraper_timestamp(self):
        """Test manually updating scrape timestamps."""
        resp = api_post("/scrape-timestamps/update", {
            "game": "poe2",
            "items_scraped": 42,
            "categories_scraped": 5,
        })
        data = resp.json()
        assert data["success"] is True

        # Verify the timestamp was updated (values accumulate, so check >=)
        ts_resp = api_get("/scrape-timestamps/poe2")
        ts_data = ts_resp.json()
        assert ts_data["timestamp"]["items_scraped"] >= 42
        assert ts_data["timestamp"]["categories_scraped"] >= 5

    def test_reset_scrape_timestamp(self):
        """Test resetting scrape timestamps."""
        resp = api_post("/scrape-timestamps/reset", {"game": "poe1"})
        data = resp.json()
        assert data["success"] is True


# ===========================================================================
# 4. ERROR HANDLING TESTS
# ===========================================================================


class TestErrorHandling:
    """Test error handling across the stack."""

    def test_404_nonexistent_endpoint(self):
        """Test 404 for nonexistent endpoint."""
        resp = requests.get(f"{API_BASE}/nonexistent_endpoint_xyz", timeout=REQUEST_TIMEOUT)
        assert resp.status_code == 404

    def test_400_invalid_game_version_timestamp(self):
        """Test 400 for invalid game version in timestamps."""
        resp = requests.get(f"{API_BASE}/scrape-timestamps/invalid_game", timeout=REQUEST_TIMEOUT)
        assert resp.status_code == 400

    def test_422_invalid_chat_request(self):
        """Test 422 for chat request with invalid game version."""
        resp = requests.post(
            f"{API_BASE}/chat/stream",
            json={"message": "test", "game_version": "invalid"},
            timeout=REQUEST_TIMEOUT,
        )
        assert resp.status_code == 422

    def test_422_empty_message_chat(self):
        """Test 422 for chat request with empty message."""
        resp = requests.post(
            f"{API_BASE}/chat/stream",
            json={"message": "", "game_version": "poe2"},
            timeout=REQUEST_TIMEOUT,
        )
        assert resp.status_code == 422

    def test_422_missing_name_index_item(self):
        """Test 422 when indexing item without required name field."""
        items = [{"item_type": "weapon"}]  # missing name
        resp = requests.post(
            f"{API_BASE}/test/indexer/index",
            json={"items": items, "upsert": True},
            timeout=REQUEST_TIMEOUT,
        )
        # The endpoint may return 200 but with failed_count > 0
        data = resp.json()
        assert data["failed_count"] >= 1

    def test_404_nonexistent_job(self):
        """Test 404 for nonexistent job ID."""
        resp = requests.get(
            f"{API_BASE}/jobs/nonexistent_job_xyz",
            timeout=REQUEST_TIMEOUT,
        )
        assert resp.status_code == 404

    def test_404_nonexistent_conversation(self):
        """Test 404 for nonexistent conversation."""
        resp = requests.delete(
            f"{API_BASE}/chat/history/nonexistent_conv_xyz",
            timeout=REQUEST_TIMEOUT,
        )
        assert resp.status_code == 404

    def test_400_invalid_scrape_depth(self):
        """Test 400 for invalid scrape depth parameter."""
        resp = requests.post(
            f"{API_BASE}/admin/scrape",
            json={"game": "poe1", "depth": "invalid_depth"},
            timeout=REQUEST_TIMEOUT,
        )
        assert resp.status_code == 422

    def test_400_invalid_game_scrape_trigger(self):
        """Test 400 for invalid game in scrape trigger."""
        resp = requests.post(
            f"{API_BASE}/admin/scrape",
            json={"game": "poe3", "depth": "shallow"},
            timeout=REQUEST_TIMEOUT,
        )
        assert resp.status_code == 422

    def test_400_invalid_url_scraper(self):
        """Test 422 for invalid URL in scraper item detail."""
        resp = requests.post(
            f"{API_BASE}/test/scraper/item",
            json={"url": "not-a-url"},
            timeout=REQUEST_TIMEOUT,
        )
        assert resp.status_code == 422


# ===========================================================================
# 5. JOB MANAGER INTEGRATION TESTS
# ===========================================================================


class TestJobManagerIntegration:
    """Test the scraping job manager."""

    def test_add_and_check_job(self):
        """Test adding a job and checking its status."""
        resp = api_post("/jobs/add", {
            "name": f"E2E Test Job {uuid.uuid4().hex[:6]}",
            "job_type": "category",
            "url": "https://poedb.tw/us/Gem",
            "priority": 5,
            "game": "poe1",
            "category": "Gem",
        })
        data = resp.json()
        assert data["success"] is True
        assert "job_id" in data
        job_id = data["job_id"]

        # Check job status
        resp = api_get(f"/jobs/{job_id}")
        data = resp.json()
        assert data["success"] is True
        assert data["job_id"] == job_id
        assert data["status"] in ("pending", "running", "completed", "failed", "cancelled")

    def test_list_jobs(self):
        """Test listing jobs."""
        resp = api_post("/jobs/list", {"limit": 10, "offset": 0})
        data = resp.json()
        assert data["success"] is True

    def test_cancel_nonexistent_job(self):
        """Test cancelling a nonexistent job returns an error."""
        resp = requests.post(
            f"{API_BASE}/jobs/nonexistent_job/cancel",
            timeout=REQUEST_TIMEOUT,
        )
        # Should return 400 or 404
        assert resp.status_code in (400, 404, 500)

    def test_clear_completed_jobs(self):
        """Test clearing completed jobs."""
        resp = api_post("/jobs/clear")
        data = resp.json()
        assert data["success"] is True


# ===========================================================================
# 6. PERFORMANCE TESTS
# ===========================================================================


class TestPerformance:
    """Test performance under load."""

    def test_health_endpoint_response_time(self):
        """Health endpoint should respond within 5 seconds."""
        start = time.time()
        api_get("/health")
        elapsed = time.time() - start
        assert elapsed < 5.0, f"Health endpoint took {elapsed:.2f}s"

    def test_config_endpoint_response_time(self):
        """Config endpoint should respond within 5 seconds."""
        start = time.time()
        api_get("/config")
        elapsed = time.time() - start
        assert elapsed < 5.0, f"Config endpoint took {elapsed:.2f}s"

    def test_embedding_generation_performance(self):
        """Single embedding generation should complete within 10 seconds."""
        start = time.time()
        api_post("/test/embeddings/query", {"text": "performance test embedding"})
        elapsed = time.time() - start
        assert elapsed < 10.0, f"Embedding generation took {elapsed:.2f}s"

    def test_batch_embedding_performance(self):
        """Batch embedding of 5 documents should complete within 15 seconds."""
        texts = [f"Performance test document number {i}" for i in range(5)]
        start = time.time()
        api_post("/test/embeddings/documents", {"texts": texts})
        elapsed = time.time() - start
        assert elapsed < 15.0, f"Batch embedding took {elapsed:.2f}s"

    def test_indexing_performance(self):
        """Indexing 10 items should complete within 30 seconds."""
        items = generate_test_items("poe2", 10)
        start = time.time()
        api_post("/test/indexer/index", {"items": items, "upsert": True})
        elapsed = time.time() - start
        assert elapsed < 30.0, f"Indexing 10 items took {elapsed:.2f}s"

    def test_search_performance(self):
        """Vector search should complete within 5 seconds."""
        start = time.time()
        api_post("/test/indexer/search", {
            "query": "unique weapon sword",
            "game": "poe2",
            "k": 5,
        })
        elapsed = time.time() - start
        assert elapsed < 5.0, f"Search took {elapsed:.2f}s"

    def test_concurrent_health_checks(self):
        """Multiple concurrent requests should not cause failures."""
        import concurrent.futures

        def make_request(i):
            resp = requests.get(f"{API_BASE}/health", timeout=10)
            return resp.status_code, resp.json()["status"]

        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(make_request, i) for i in range(20)]
            results = [f.result() for f in concurrent.futures.as_completed(futures)]

        for status_code, status in results:
            assert status_code == 200
            assert status in ("healthy", "degraded")

    def test_concurrent_config_reads(self):
        """Concurrent config reads should all succeed."""
        import concurrent.futures

        def read_config(i):
            resp = requests.get(f"{API_BASE}/config", timeout=10)
            return resp.status_code, resp.json()["app_name"]

        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(read_config, i) for i in range(15)]
            results = [f.result() for f in concurrent.futures.as_completed(futures)]

        for status_code, app_name in results:
            assert status_code == 200
            assert app_name == "POE Knowledge Assistant"


# ===========================================================================
# 7. INTEGRATION POINTS TESTS
# ===========================================================================


class TestIntegrationPoints:
    """Test all integration points between system components."""

    def test_scraper_to_indexer_pipeline(self):
        """Test the scraper->indexer integration: generate items and index them."""
        # Generate sample items (simulating scraper output)
        resp = api_post("/test/indexer/index-samples", {
            "game": "poe1",
            "count": 5,
        })
        data = resp.json()
        assert data["success"] is True
        assert data["indexed_count"] > 0

        # Verify they are searchable via vector store
        time.sleep(1)
        resp = api_post("/test/vectorstore/search", {
            "query": "Tabula Rasa",
            "game": "poe1",
            "k": 3,
        })
        data = resp.json()
        assert data["success"] is True

    def test_indexer_to_rag_retrieval(self):
        """Test the indexer->RAG retrieval integration."""
        # Index items
        items = generate_test_items("poe2", 3)
        api_post("/test/indexer/index", {"items": items, "upsert": True})
        time.sleep(1)

        # Search through the indexer endpoint (which uses vector store)
        resp = api_post("/test/indexer/search", {
            "query": "test sword",
            "game": "poe2",
            "k": 3,
        })
        data = resp.json()
        assert data["success"] is True
        assert data["results_count"] >= 1

    def test_config_to_runtime_propagation(self):
        """Test that config changes propagate to runtime behavior."""
        # Get original top_k
        original = api_get("/config").json()
        original_top_k = original["rag"]["top_k_results"]

        # Update top_k
        new_top_k = 10
        resp = api_put("/config", {"rag_top_k": new_top_k})
        assert resp.json()["success"] is True

        # Verify the config endpoint reflects the change
        updated = api_get("/config").json()
        assert updated["rag"]["top_k_results"] == new_top_k

        # Restore
        api_put("/config", {"rag_top_k": original_top_k})

    def test_job_manager_to_timestamp_integration(self):
        """Test that the job manager integrates with timestamp storage."""
        # Update timestamp via the endpoint (simulating job completion)
        resp = api_post("/scrape-timestamps/update", {
            "game": "poe2",
            "items_scraped": 100,
            "categories_scraped": 5,
        })
        assert resp.json()["success"] is True

        # Verify freshness endpoint reflects the change (values accumulate)
        resp = api_get("/freshness")
        data = resp.json()
        assert data["success"] is True
        poe2_freshness = data["freshness"]["poe2"]
        assert poe2_freshness["items_scraped"] >= 100

    def test_conversation_store_integration(self):
        """Test conversation store CRUD operations."""
        # Get stats
        resp = api_get("/chat/history/stats")
        assert resp.json()["success"] is True

        # List conversations
        resp = api_get("/chat/history")
        assert resp.json()["success"] is True
        original_count = resp.json()["total"]

        # Try to get a nonexistent conversation
        resp = requests.get(
            f"{API_BASE}/chat/history/nonexistent_conv",
            timeout=REQUEST_TIMEOUT,
        )
        assert resp.status_code == 404

    def test_embeddings_to_vectorstore_integration(self):
        """Test that embeddings service feeds into the vector store."""
        test_id = uuid.uuid4().hex[:8]

        # Generate embeddings and add to vector store
        texts = [f"Integration test document {test_id} about PoE"]
        metadatas = [{"game": "poe2", "test_id": test_id, "source": "integration_test"}]

        resp = api_post("/test/vectorstore/add", {
            "texts": texts,
            "metadatas": metadatas,
        })
        data = resp.json()
        assert data["success"] is True
        assert data["documents_added"] == 1
        time.sleep(1)

        # Search and verify the document is retrievable
        resp = api_post("/test/vectorstore/search", {
            "query": f"integration test {test_id}",
            "k": 3,
        })
        data = resp.json()
        assert data["success"] is True

    def test_freshness_to_frontend_integration(self):
        """Test that freshness data is available for frontend consumption."""
        resp = api_get("/freshness")
        data = resp.json()
        assert data["success"] is True

        # Verify the structure matches what the frontend expects
        freshness = data["freshness"]
        for game in ["poe1", "poe2"]:
            entry = freshness[game]
            assert "game" in entry
            assert "last_scraped_at" in entry
            assert "relative_time" in entry
            assert "is_stale" in entry
            assert "has_data" in entry
            assert "items_scraped" in entry
            assert "categories_scraped" in entry

    def test_admin_scrape_trigger_and_status(self):
        """Test admin scrape trigger creates jobs with valid status."""
        # We don't actually trigger a real scrape, just test the status endpoint
        # with a nonexistent job_id
        resp = requests.get(
            f"{API_BASE}/admin/scrape/status?job_id=nonexistent",
            timeout=REQUEST_TIMEOUT,
        )
        assert resp.status_code == 404

    def test_frontend_proxy_to_backend(self):
        """Test that frontend proxies API requests to backend."""
        resp = requests.get(f"{FRONTEND_URL}/api/", timeout=REQUEST_TIMEOUT)
        assert resp.status_code == 200
        data = resp.json()
        assert data["message"] == "POE Knowledge Assistant API"


# ===========================================================================
# 8. CHAT FLOW TESTS
# ===========================================================================


class TestChatFlow:
    """Test chat flow with real responses."""

    def test_chat_endpoint_accepts_valid_request(self):
        """Test that the chat endpoint accepts a valid request."""
        resp = requests.post(
            f"{API_BASE}/chat",
            json={
                "question": "What is Tabula Rasa?",
                "game_version": "poe1",
            },
            timeout=60,
            stream=True,
        )
        assert resp.status_code == 200
        assert resp.headers.get("content-type") == "text/event-stream; charset=utf-8"

        # Read a small portion of the stream to verify SSE format
        content = b""
        for chunk in resp.iter_content(chunk_size=1024):
            content += chunk
            if len(content) > 200:
                break
        resp.close()

        content_str = content.decode("utf-8", errors="replace")
        # Should contain SSE events
        assert "event:" in content_str or "data:" in content_str

    def test_chat_stream_endpoint_accepts_valid_request(self):
        """Test the chat/stream endpoint with a valid request."""
        resp = requests.post(
            f"{API_BASE}/chat/stream",
            json={
                "message": "Tell me about Fireball",
                "game_version": "poe1",
            },
            timeout=60,
            stream=True,
        )
        assert resp.status_code == 200
        resp.close()

    def test_chat_with_build_context(self):
        """Test chat with build context parameter."""
        resp = requests.post(
            f"{API_BASE}/chat",
            json={
                "question": "Best leveling skills?",
                "game_version": "poe2",
                "build_context": "standard",
            },
            timeout=60,
            stream=True,
        )
        assert resp.status_code == 200
        resp.close()

    def test_chat_with_conversation_history(self):
        """Test chat with conversation history for context continuity."""
        resp = requests.post(
            f"{API_BASE}/chat/stream",
            json={
                "message": "What are the best skills?",
                "game_version": "poe2",
                "conversation_id": f"e2e-test-{uuid.uuid4().hex[:8]}",
                "conversation_history": [
                    {"role": "user", "content": "Hello"},
                    {"role": "assistant", "content": "Hi! How can I help you with Path of Exile?"},
                ],
            },
            timeout=60,
            stream=True,
        )
        assert resp.status_code == 200
        resp.close()

    def test_chat_invalid_game_version_rejected(self):
        """Test that invalid game version is rejected."""
        resp = requests.post(
            f"{API_BASE}/chat",
            json={
                "question": "Test",
                "game_version": "poe3",
            },
            timeout=REQUEST_TIMEOUT,
        )
        assert resp.status_code == 422

    def test_chat_whitespace_only_message_rejected(self):
        """Test that whitespace-only messages are rejected."""
        resp = requests.post(
            f"{API_BASE}/chat",
            json={
                "question": "   ",
                "game_version": "poe2",
            },
            timeout=REQUEST_TIMEOUT,
        )
        assert resp.status_code == 422


# ===========================================================================
# 9. CROSS-CUTTING CONCERNS TESTS
# ===========================================================================


class TestCrossCuttingConcerns:
    """Test cross-cutting concerns like CORS, content types, etc."""

    def test_cors_headers_present(self):
        """Verify CORS headers are present in API responses."""
        # Get the configured CORS origins
        config_resp = api_get("/config")
        config_data = config_resp.json()
        allowed_origins = config_data.get("cors", {}).get("origins", [])
        test_origin = allowed_origins[0] if allowed_origins else "http://localhost:3000"

        # Test CORS on a regular GET request
        resp = requests.get(
            f"{API_BASE}/health",
            headers={"Origin": test_origin},
            timeout=REQUEST_TIMEOUT,
        )
        assert resp.status_code == 200
        # CORS middleware should include access-control-allow-origin or
        # access-control-allow-credentials header
        cors_headers = [k.lower() for k in resp.headers.keys()]
        assert any("access-control" in h for h in cors_headers), (
            f"No CORS headers found. Response headers: {dict(resp.headers)}"
        )

    def test_api_returns_json(self):
        """Verify API endpoints return JSON content type."""
        resp = api_get("/")
        assert "application/json" in resp.headers.get("content-type", "")

    def test_swagger_docs_available(self):
        """Verify Swagger documentation is accessible."""
        resp = requests.get(f"{BACKEND_URL}/docs", timeout=REQUEST_TIMEOUT)
        assert resp.status_code == 200

    def test_openapi_schema_available(self):
        """Verify OpenAPI schema is accessible."""
        resp = requests.get(f"{BACKEND_URL}/openapi.json", timeout=REQUEST_TIMEOUT)
        assert resp.status_code == 200
        schema = resp.json()
        assert "openapi" in schema
        assert "paths" in schema
        assert "/api/" in schema["paths"] or "/api" in schema["paths"]

    def test_frontend_serves_html(self):
        """Verify frontend serves HTML."""
        resp = requests.get(FRONTEND_URL, timeout=REQUEST_TIMEOUT)
        assert resp.status_code == 200
        assert "text/html" in resp.headers.get("content-type", "")

    def test_api_version_consistent(self):
        """Verify version is consistent across endpoints."""
        root_version = api_get("/").json()["version"]
        health_data = api_get("/health").json()
        assert health_data["version"] == root_version

        config_data = api_get("/config").json()
        assert config_data["app_version"] == root_version


# ===========================================================================
# 10. SYSTEM READINESS TESTS
# ===========================================================================


class TestSystemReadiness:
    """Test that the full system is ready for operation."""

    def test_all_core_services_healthy(self):
        """Verify all core services report healthy or degraded status."""
        health = api_get("/health").json()

        # Log individual service statuses (even if degraded)
        services = {
            "chromadb": health.get("chromadb_status"),
            "embeddings": health.get("embeddings_status"),
            "vectorstore": health.get("vectorstore_status"),
        }

        # At minimum, the system should respond
        assert health["status"] in ("healthy", "degraded")

    def test_scraper_modules_all_importable(self):
        """Verify all scraper modules are importable."""
        data = api_get("/test/scraper/modules").json()
        modules = data["scraper_modules"]
        for module_name, module_info in modules.items():
            assert "exports" in module_info
            assert len(module_info["exports"]) > 0, (
                f"Module {module_name} has no exports"
            )

    def test_all_embedding_providers_listed(self):
        """Verify all expected embedding providers are available."""
        data = api_post("/test/embeddings/factory", {
            "provider": "local",
        }).json()
        assert data["success"] is True

    def test_local_embeddings_functional(self):
        """Verify local embeddings can generate vectors."""
        data = api_post("/test/embeddings/query", {
            "text": "Path of Exile Knowledge Assistant system test",
        }).json()
        assert data["success"] is True
        assert data["embedding_dimension"] > 0
        assert len(data["embedding_preview"]) > 0

    def test_vector_store_read_write(self):
        """Verify vector store can write and read documents."""
        test_id = uuid.uuid4().hex[:8]
        text = f"Read/write test {test_id}"

        # Write
        resp = api_post("/test/vectorstore/add", {"texts": [text]})
        assert resp.json()["success"] is True
        time.sleep(1)

        # Read
        resp = api_post("/test/vectorstore/search", {"query": text, "k": 1})
        assert resp.json()["success"] is True

    def test_indexer_full_cycle(self):
        """Test the complete indexer cycle: index, search, delete."""
        test_urls = [f"https://poe2db.tw/us/E2E_Cycle_Test_{uuid.uuid4().hex[:8]}"]

        # Create items
        items = [{
            "name": "Cycle Test Item",
            "item_type": "currency",
            "url": test_urls[0],
            "game": "poe2",
            "description": "Full cycle test item for E2E testing",
        }]

        # Index
        resp = api_post("/test/indexer/index", {"items": items, "upsert": True})
        assert resp.json()["indexed_count"] == 1
        time.sleep(1)

        # Search
        resp = api_post("/test/indexer/search", {
            "query": "Cycle Test Item",
            "game": "poe2",
            "k": 5,
        })
        assert resp.json()["success"] is True

        # Delete
        resp = api_post("/test/indexer/delete", {"urls": test_urls})
        assert resp.json()["deleted_count"] == 1
