"""
Comprehensive configuration management test for POE Knowledge Assistant.

Validates the complete configuration functionality, including:
- GET /api/config endpoint: returns correct structure and types
- PUT /api/config endpoint: accepts valid updates and returns proper responses
- Configuration persistence across requests
- Validation rules (ranges, types, enum values, chunk overlap < chunk size)
- Frontend integration (settings form can read and write config)
- Error handling for invalid configurations (422 for bad types, 400 for business rules)
"""
import os
import sys
import json
from pathlib import Path
from typing import Any, Dict, Optional

import pytest
import httpx

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Backend base URL -- adjust if the server runs on a different port
BASE_URL = os.getenv("BACKEND_BASE_URL", "http://localhost:8460")
API_PREFIX = "/api"
CONFIG_URL = f"{BASE_URL}{API_PREFIX}/config"

# Default timeout for HTTP requests (seconds)
TIMEOUT = 15.0


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get(client: httpx.Client, url: str, **kwargs) -> httpx.Response:
    """Convenience wrapper for GET requests."""
    return client.get(url, timeout=TIMEOUT, **kwargs)


def _put(client: httpx.Client, url: str, json_body: dict, **kwargs) -> httpx.Response:
    """Convenience wrapper for PUT requests."""
    return client.put(url, json=json_body, timeout=TIMEOUT, **kwargs)


# ===================================================================
# Section 1: GET /api/config -- structure and content validation
# ===================================================================

class TestGetConfig:
    """Tests for the GET /api/config endpoint."""

    @pytest.fixture(scope="class")
    def client(self):
        with httpx.Client() as c:
            yield c

    @pytest.fixture(scope="class")
    def config_response(self, client):
        """Fetch the config once and reuse across tests in this class."""
        resp = _get(client, CONFIG_URL)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        return resp.json()

    # -- Top-level fields ------------------------------------------------

    def test_config_has_app_name(self, config_response):
        assert "app_name" in config_response
        assert isinstance(config_response["app_name"], str)
        assert config_response["app_name"] == "POE Knowledge Assistant"

    def test_config_has_app_version(self, config_response):
        assert "app_version" in config_response
        assert isinstance(config_response["app_version"], str)

    def test_config_has_environment(self, config_response):
        assert "environment" in config_response
        assert config_response["environment"] in ("development", "production", "testing")

    # -- Server section --------------------------------------------------

    def test_config_has_server_section(self, config_response):
        server = config_response["server"]
        assert isinstance(server, dict)
        assert "host" in server
        assert "port" in server
        assert "debug" in server
        assert "workers" in server

    def test_server_port_is_valid(self, config_response):
        port = config_response["server"]["port"]
        assert isinstance(port, int)
        assert 1 <= port <= 65535

    def test_server_workers_is_valid(self, config_response):
        workers = config_response["server"]["workers"]
        assert isinstance(workers, int)
        assert 1 <= workers <= 64

    # -- Database section ------------------------------------------------

    def test_config_has_database_section(self, config_response):
        db = config_response["database"]
        assert isinstance(db, dict)
        assert "database_url" in db
        assert "pool_size" in db
        assert "max_overflow" in db

    def test_database_pool_size_in_range(self, config_response):
        pool_size = config_response["database"]["pool_size"]
        assert isinstance(pool_size, int)
        assert 1 <= pool_size <= 100

    def test_database_max_overflow_in_range(self, config_response):
        max_overflow = config_response["database"]["max_overflow"]
        assert isinstance(max_overflow, int)
        assert 0 <= max_overflow <= 100

    def test_database_url_is_string(self, config_response):
        url = config_response["database"]["database_url"]
        assert isinstance(url, str)
        assert len(url) > 0

    # -- ChromaDB section ------------------------------------------------

    def test_config_has_chromadb_section(self, config_response):
        chromadb = config_response["chromadb"]
        assert isinstance(chromadb, dict)
        assert "persist_directory" in chromadb
        assert "collection_name" in chromadb

    def test_chromadb_collection_name_valid(self, config_response):
        name = config_response["chromadb"]["collection_name"]
        assert isinstance(name, str)
        assert 1 <= len(name) <= 100

    # -- RAG section -----------------------------------------------------

    def test_config_has_rag_section(self, config_response):
        rag = config_response["rag"]
        assert isinstance(rag, dict)
        assert "top_k_results" in rag
        assert "chunk_size" in rag
        assert "chunk_overlap" in rag
        assert "score_threshold" in rag

    def test_rag_top_k_in_range(self, config_response):
        top_k = config_response["rag"]["top_k_results"]
        assert isinstance(top_k, int)
        assert 1 <= top_k <= 20

    def test_rag_chunk_size_in_range(self, config_response):
        chunk_size = config_response["rag"]["chunk_size"]
        assert isinstance(chunk_size, int)
        assert 100 <= chunk_size <= 4000

    def test_rag_chunk_overlap_less_than_chunk_size(self, config_response):
        overlap = config_response["rag"]["chunk_overlap"]
        size = config_response["rag"]["chunk_size"]
        assert isinstance(overlap, int)
        assert 0 <= overlap <= 1000
        assert overlap < size, "chunk_overlap must be less than chunk_size"

    def test_rag_score_threshold_in_range(self, config_response):
        threshold = config_response["rag"]["score_threshold"]
        assert isinstance(threshold, (int, float))
        assert 0.0 <= threshold <= 1.0

    # -- CORS section ----------------------------------------------------

    def test_config_has_cors_section(self, config_response):
        cors = config_response["cors"]
        assert isinstance(cors, dict)
        assert "origins" in cors
        assert "allow_credentials" in cors
        assert "allow_methods" in cors
        assert "allow_headers" in cors

    def test_cors_origins_is_list(self, config_response):
        origins = config_response["cors"]["origins"]
        assert isinstance(origins, list)
        assert len(origins) >= 1

    # -- LLM section -----------------------------------------------------

    def test_config_has_llm_section(self, config_response):
        llm = config_response["llm"]
        assert isinstance(llm, dict)
        assert "provider" in llm
        assert "model" in llm
        assert "temperature" in llm
        assert "max_tokens" in llm
        assert "api_key_set" in llm

    def test_llm_provider_is_valid_enum(self, config_response):
        provider = config_response["llm"]["provider"]
        assert provider in ("openai", "anthropic", "ollama", "lmstudio")

    def test_llm_temperature_in_range(self, config_response):
        temp = config_response["llm"]["temperature"]
        assert isinstance(temp, (int, float))
        assert 0.0 <= temp <= 2.0

    def test_llm_max_tokens_in_range(self, config_response):
        max_tokens = config_response["llm"]["max_tokens"]
        assert isinstance(max_tokens, int)
        assert 1 <= max_tokens <= 32000

    def test_llm_api_key_set_is_boolean(self, config_response):
        api_key_set = config_response["llm"]["api_key_set"]
        assert isinstance(api_key_set, bool)

    def test_llm_api_key_never_exposed(self, config_response):
        """Ensure the actual API key is never present in the response."""
        response_text = json.dumps(config_response)
        # Should never contain typical API key prefixes in plain text
        assert "sk-" not in response_text
        assert "sk-ant-" not in response_text

    # -- Embedding section -----------------------------------------------

    def test_config_has_embedding_section(self, config_response):
        emb = config_response["embedding"]
        assert isinstance(emb, dict)
        assert "provider" in emb
        assert "model" in emb
        assert "dimension" in emb
        assert "batch_size" in emb

    def test_embedding_provider_is_valid_enum(self, config_response):
        provider = config_response["embedding"]["provider"]
        assert provider in ("local", "ollama", "lmstudio", "openai")

    def test_embedding_dimension_positive(self, config_response):
        dim = config_response["embedding"]["dimension"]
        assert isinstance(dim, int)
        assert dim >= 1

    def test_embedding_batch_size_in_range(self, config_response):
        bs = config_response["embedding"]["batch_size"]
        assert isinstance(bs, int)
        assert 1 <= bs <= 256

    # -- Scraper section -------------------------------------------------

    def test_config_has_scraper_section(self, config_response):
        scraper = config_response["scraper"]
        assert isinstance(scraper, dict)
        assert "rate_limit_delay" in scraper
        assert "max_retries" in scraper
        assert "timeout" in scraper
        assert "concurrent_requests" in scraper

    def test_scraper_rate_limit_delay_in_range(self, config_response):
        delay = config_response["scraper"]["rate_limit_delay"]
        assert isinstance(delay, (int, float))
        assert 0.0 <= delay <= 60.0

    def test_scraper_max_retries_in_range(self, config_response):
        retries = config_response["scraper"]["max_retries"]
        assert isinstance(retries, int)
        assert 0 <= retries <= 10

    def test_scraper_timeout_in_range(self, config_response):
        timeout = config_response["scraper"]["timeout"]
        assert isinstance(timeout, int)
        assert 1 <= timeout <= 300

    def test_scraper_concurrent_requests_in_range(self, config_response):
        cr = config_response["scraper"]["concurrent_requests"]
        assert isinstance(cr, int)
        assert 1 <= cr <= 20


# ===================================================================
# Section 2: PUT /api/config -- valid configuration updates
# ===================================================================

class TestPutConfigValidUpdates:
    """Tests for successful PUT /api/config updates."""

    @pytest.fixture(scope="class")
    def client(self):
        with httpx.Client() as c:
            yield c

    @pytest.fixture(autouse=True)
    def restore_config(self, client):
        """
        After each test, restore the original config values so that
        tests are isolated from one another.
        """
        # Capture original state before the test runs
        original = _get(client, CONFIG_URL).json()
        yield
        # Restore after the test
        _put(client, CONFIG_URL, {
            "llm_provider": original["llm"]["provider"],
            "llm_model": original["llm"]["model"],
            "llm_temperature": original["llm"]["temperature"],
            "llm_max_tokens": original["llm"]["max_tokens"],
            "embedding_provider": original["embedding"]["provider"],
            "rag_top_k": original["rag"]["top_k_results"],
            "rag_chunk_size": original["rag"]["chunk_size"],
            "rag_chunk_overlap": original["rag"]["chunk_overlap"],
            "rag_score_threshold": original["rag"]["score_threshold"],
        })

    def test_update_single_field_llm_temperature(self, client):
        resp = _put(client, CONFIG_URL, {"llm_temperature": 0.5})
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "llm_temperature" in data["updated_fields"]
        assert data["requires_restart"] is False

    def test_update_llm_max_tokens(self, client):
        resp = _put(client, CONFIG_URL, {"llm_max_tokens": 4000})
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "llm_max_tokens" in data["updated_fields"]

    def test_update_rag_top_k(self, client):
        resp = _put(client, CONFIG_URL, {"rag_top_k": 10})
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "rag_top_k" in data["updated_fields"]

    def test_update_rag_score_threshold(self, client):
        resp = _put(client, CONFIG_URL, {"rag_score_threshold": 0.85})
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "rag_score_threshold" in data["updated_fields"]

    def test_update_rag_chunk_size_and_overlap(self, client):
        resp = _put(client, CONFIG_URL, {
            "rag_chunk_size": 2000,
            "rag_chunk_overlap": 300,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "rag_chunk_size" in data["updated_fields"]
        assert "rag_chunk_overlap" in data["updated_fields"]

    def test_update_embedding_provider(self, client):
        resp = _put(client, CONFIG_URL, {"embedding_provider": "ollama"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "embedding_provider" in data["updated_fields"]

    def test_update_multiple_fields_at_once(self, client):
        resp = _put(client, CONFIG_URL, {
            "llm_temperature": 1.2,
            "rag_top_k": 7,
            "rag_score_threshold": 0.6,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert len(data["updated_fields"]) == 3

    def test_update_response_includes_config(self, client):
        resp = _put(client, CONFIG_URL, {"rag_top_k": 5})
        assert resp.status_code == 200
        data = resp.json()
        assert data["config"] is not None
        assert "app_name" in data["config"]
        assert "rag" in data["config"]
        assert "llm" in data["config"]

    def test_update_response_message_format(self, client):
        resp = _put(client, CONFIG_URL, {"llm_temperature": 0.9})
        assert resp.status_code == 200
        data = resp.json()
        assert "message" in data
        assert "successfully" in data["message"].lower()
        assert "field(s) changed" in data["message"]


# ===================================================================
# Section 3: Configuration persistence across requests
# ===================================================================

class TestConfigPersistence:
    """Tests that configuration changes persist across subsequent GET requests."""

    @pytest.fixture(scope="class")
    def client(self):
        with httpx.Client() as c:
            yield c

    @pytest.fixture(autouse=True)
    def restore_config(self, client):
        original = _get(client, CONFIG_URL).json()
        yield
        _put(client, CONFIG_URL, {
            "llm_provider": original["llm"]["provider"],
            "llm_model": original["llm"]["model"],
            "llm_temperature": original["llm"]["temperature"],
            "llm_max_tokens": original["llm"]["max_tokens"],
            "rag_top_k": original["rag"]["top_k_results"],
            "rag_chunk_size": original["rag"]["chunk_size"],
            "rag_chunk_overlap": original["rag"]["chunk_overlap"],
            "rag_score_threshold": original["rag"]["score_threshold"],
            "embedding_provider": original["embedding"]["provider"],
        })

    def test_rag_top_k_persists_after_update(self, client):
        """Update rag_top_k, then GET config to verify the value persisted."""
        new_top_k = 8
        put_resp = _put(client, CONFIG_URL, {"rag_top_k": new_top_k})
        assert put_resp.status_code == 200

        get_resp = _get(client, CONFIG_URL)
        assert get_resp.status_code == 200
        data = get_resp.json()
        assert data["rag"]["top_k_results"] == new_top_k

    def test_temperature_persists_after_update(self, client):
        new_temp = 1.5
        put_resp = _put(client, CONFIG_URL, {"llm_temperature": new_temp})
        assert put_resp.status_code == 200

        get_resp = _get(client, CONFIG_URL)
        assert get_resp.status_code == 200
        data = get_resp.json()
        assert data["llm"]["temperature"] == new_temp

    def test_max_tokens_persists_after_update(self, client):
        new_tokens = 4000
        put_resp = _put(client, CONFIG_URL, {"llm_max_tokens": new_tokens})
        assert put_resp.status_code == 200

        get_resp = _get(client, CONFIG_URL)
        assert get_resp.status_code == 200
        data = get_resp.json()
        assert data["llm"]["max_tokens"] == new_tokens

    def test_rag_settings_persist_together(self, client):
        """Update multiple RAG fields and verify all persist."""
        updates = {
            "rag_top_k": 3,
            "rag_chunk_size": 1500,
            "rag_chunk_overlap": 150,
            "rag_score_threshold": 0.8,
        }
        put_resp = _put(client, CONFIG_URL, updates)
        assert put_resp.status_code == 200

        get_resp = _get(client, CONFIG_URL)
        data = get_resp.json()
        assert data["rag"]["top_k_results"] == 3
        assert data["rag"]["chunk_size"] == 1500
        assert data["rag"]["chunk_overlap"] == 150
        assert data["rag"]["score_threshold"] == 0.8

    def test_sequential_updates_all_persist(self, client):
        """Make two sequential updates and verify both values are reflected."""
        _put(client, CONFIG_URL, {"rag_top_k": 12})
        _put(client, CONFIG_URL, {"rag_score_threshold": 0.55})

        get_resp = _get(client, CONFIG_URL)
        data = get_resp.json()
        assert data["rag"]["top_k_results"] == 12
        assert data["rag"]["score_threshold"] == 0.55


# ===================================================================
# Section 4: Validation rules and error responses
# ===================================================================

class TestConfigValidation:
    """Tests for configuration validation rules and error handling."""

    @pytest.fixture(scope="class")
    def client(self):
        with httpx.Client() as c:
            yield c

    # -- No fields provided ----------------------------------------------

    def test_empty_update_returns_error(self, client):
        """PUT with no fields should return 400."""
        resp = _put(client, CONFIG_URL, {})
        assert resp.status_code == 400
        data = resp.json()
        assert "detail" in data
        assert "no fields" in data["detail"].lower() or "at least one" in data["detail"].lower()

    # -- Temperature range validation ------------------------------------

    def test_temperature_too_high(self, client):
        resp = _put(client, CONFIG_URL, {"llm_temperature": 3.0})
        assert resp.status_code == 422

    def test_temperature_too_low(self, client):
        resp = _put(client, CONFIG_URL, {"llm_temperature": -0.1})
        assert resp.status_code == 422

    def test_temperature_at_boundary_zero(self, client):
        resp = _put(client, CONFIG_URL, {"llm_temperature": 0.0})
        assert resp.status_code == 200

    def test_temperature_at_boundary_two(self, client):
        resp = _put(client, CONFIG_URL, {"llm_temperature": 2.0})
        assert resp.status_code == 200

    # -- Max tokens range validation -------------------------------------

    def test_max_tokens_too_high(self, client):
        resp = _put(client, CONFIG_URL, {"llm_max_tokens": 50000})
        assert resp.status_code == 422

    def test_max_tokens_zero(self, client):
        resp = _put(client, CONFIG_URL, {"llm_max_tokens": 0})
        assert resp.status_code == 422

    def test_max_tokens_at_boundary_one(self, client):
        resp = _put(client, CONFIG_URL, {"llm_max_tokens": 1})
        assert resp.status_code == 200

    def test_max_tokens_at_boundary_32000(self, client):
        resp = _put(client, CONFIG_URL, {"llm_max_tokens": 32000})
        assert resp.status_code == 200

    # -- RAG top_k range validation --------------------------------------

    def test_rag_top_k_too_high(self, client):
        resp = _put(client, CONFIG_URL, {"rag_top_k": 25})
        assert resp.status_code == 422

    def test_rag_top_k_zero(self, client):
        resp = _put(client, CONFIG_URL, {"rag_top_k": 0})
        assert resp.status_code == 422

    def test_rag_top_k_at_boundary_one(self, client):
        resp = _put(client, CONFIG_URL, {"rag_top_k": 1})
        assert resp.status_code == 200

    def test_rag_top_k_at_boundary_twenty(self, client):
        resp = _put(client, CONFIG_URL, {"rag_top_k": 20})
        assert resp.status_code == 200

    # -- RAG score_threshold range validation ----------------------------

    def test_rag_score_threshold_too_high(self, client):
        resp = _put(client, CONFIG_URL, {"rag_score_threshold": 1.5})
        assert resp.status_code == 422

    def test_rag_score_threshold_negative(self, client):
        resp = _put(client, CONFIG_URL, {"rag_score_threshold": -0.1})
        assert resp.status_code == 422

    def test_rag_score_threshold_at_boundary_zero(self, client):
        resp = _put(client, CONFIG_URL, {"rag_score_threshold": 0.0})
        assert resp.status_code == 200

    def test_rag_score_threshold_at_boundary_one(self, client):
        resp = _put(client, CONFIG_URL, {"rag_score_threshold": 1.0})
        assert resp.status_code == 200

    # -- RAG chunk_size range validation ---------------------------------

    def test_rag_chunk_size_too_small(self, client):
        resp = _put(client, CONFIG_URL, {"rag_chunk_size": 50})
        assert resp.status_code == 422

    def test_rag_chunk_size_too_large(self, client):
        resp = _put(client, CONFIG_URL, {"rag_chunk_size": 5000})
        assert resp.status_code == 422

    # -- RAG chunk_overlap < chunk_size validation -----------------------

    def test_chunk_overlap_greater_than_chunk_size(self, client):
        """chunk_overlap must be less than chunk_size."""
        resp = _put(client, CONFIG_URL, {
            "rag_chunk_size": 200,
            "rag_chunk_overlap": 250,
        })
        assert resp.status_code == 400
        data = resp.json()
        assert "detail" in data
        assert "chunk_overlap" in data["detail"].lower()

    def test_chunk_overlap_equal_to_chunk_size(self, client):
        """chunk_overlap must be strictly less than chunk_size."""
        resp = _put(client, CONFIG_URL, {
            "rag_chunk_size": 500,
            "rag_chunk_overlap": 500,
        })
        assert resp.status_code == 400

    # -- Invalid LLM provider -------------------------------------------

    def test_invalid_llm_provider(self, client):
        resp = _put(client, CONFIG_URL, {"llm_provider": "nonexistent_provider"})
        assert resp.status_code == 422

    # -- Invalid embedding provider --------------------------------------

    def test_invalid_embedding_provider(self, client):
        resp = _put(client, CONFIG_URL, {"embedding_provider": "invalid"})
        assert resp.status_code == 422

    # -- API key validation ----------------------------------------------

    def test_api_key_too_short(self, client):
        """API keys must be at least 8 characters."""
        resp = _put(client, CONFIG_URL, {"openai_api_key": "short"})
        assert resp.status_code == 422

    def test_api_key_empty_string(self, client):
        """Empty API key should fail validation."""
        resp = _put(client, CONFIG_URL, {"openai_api_key": ""})
        assert resp.status_code == 422

    def test_api_key_whitespace_only(self, client):
        """Whitespace-only API key should fail validation."""
        resp = _put(client, CONFIG_URL, {"openai_api_key": "   "})
        assert resp.status_code == 422

    # -- Invalid field types ---------------------------------------------

    def test_temperature_as_string(self, client):
        resp = _put(client, CONFIG_URL, {"llm_temperature": "hot"})
        assert resp.status_code == 422

    def test_rag_top_k_as_float(self, client):
        resp = _put(client, CONFIG_URL, {"rag_top_k": 3.7})
        # Might be accepted (truncated) or rejected depending on pydantic
        assert resp.status_code in (200, 422)

    def test_llm_provider_as_number(self, client):
        resp = _put(client, CONFIG_URL, {"llm_provider": 123})
        assert resp.status_code == 422

    # -- Empty string fields ---------------------------------------------

    def test_empty_llm_model_rejected(self, client):
        resp = _put(client, CONFIG_URL, {"llm_model": "   "})
        assert resp.status_code == 422

    def test_empty_embedding_model_rejected(self, client):
        resp = _put(client, CONFIG_URL, {"embedding_model": "   "})
        assert resp.status_code == 422

    def test_empty_ollama_base_url_rejected(self, client):
        resp = _put(client, CONFIG_URL, {"ollama_base_url": "  "})
        assert resp.status_code == 422

    def test_empty_lmstudio_base_url_rejected(self, client):
        resp = _put(client, CONFIG_URL, {"lmstudio_base_url": "  "})
        assert resp.status_code == 422


# ===================================================================
# Section 5: Configuration value types verification
# ===================================================================

class TestConfigValueTypes:
    """Tests to ensure configuration values have the correct types."""

    @pytest.fixture(scope="class")
    def client(self):
        with httpx.Client() as c:
            yield c

    @pytest.fixture(scope="class")
    def config(self, client):
        resp = _get(client, CONFIG_URL)
        assert resp.status_code == 200
        return resp.json()

    def test_server_port_is_integer(self, config):
        assert isinstance(config["server"]["port"], int)

    def test_server_debug_is_boolean(self, config):
        assert isinstance(config["server"]["debug"], bool)

    def test_cors_allow_credentials_is_boolean(self, config):
        assert isinstance(config["cors"]["allow_credentials"], bool)

    def test_llm_api_key_set_is_boolean(self, config):
        assert isinstance(config["llm"]["api_key_set"], bool)

    def test_embedding_dimension_is_integer(self, config):
        assert isinstance(config["embedding"]["dimension"], int)

    def test_scraper_rate_limit_delay_is_number(self, config):
        assert isinstance(config["scraper"]["rate_limit_delay"], (int, float))

    def test_all_section_keys_are_strings(self, config):
        """Ensure all JSON keys are strings (not numbers or null)."""
        for section in ("server", "database", "chromadb", "rag", "cors", "llm", "embedding", "scraper"):
            for key in config[section]:
                assert isinstance(key, str), f"Key {key} in {section} is not a string"


# ===================================================================
# Section 6: Error handling edge cases
# ===================================================================

class TestConfigErrorHandling:
    """Tests for error handling edge cases."""

    @pytest.fixture(scope="class")
    def client(self):
        with httpx.Client() as c:
            yield c

    def test_get_config_returns_json(self, client):
        resp = _get(client, CONFIG_URL)
        assert resp.headers.get("content-type", "").startswith("application/json")

    def test_put_config_returns_json(self, client):
        resp = _put(client, CONFIG_URL, {"llm_temperature": 0.7})
        assert resp.headers.get("content-type", "").startswith("application/json")

    def test_put_config_with_null_values(self, client):
        """PUT with all null values should return 400 (no fields)."""
        resp = _put(client, CONFIG_URL, {
            "llm_provider": None,
            "llm_model": None,
            "llm_temperature": None,
        })
        assert resp.status_code == 400

    def test_put_config_with_extra_unknown_fields(self, client):
        """Unknown fields should be ignored (Pydantic model_config extra=ignore)."""
        resp = _put(client, CONFIG_URL, {
            "llm_temperature": 0.8,
            "unknown_field": "should_be_ignored",
        })
        # Either 200 (ignored) or 422 (rejected) depending on model config
        assert resp.status_code in (200, 422)

    def test_put_config_with_negative_rag_top_k(self, client):
        resp = _put(client, CONFIG_URL, {"rag_top_k": -5})
        assert resp.status_code == 422

    def test_put_config_with_zero_rag_chunk_size(self, client):
        resp = _put(client, CONFIG_URL, {"rag_chunk_size": 0})
        assert resp.status_code == 422

    def test_put_config_with_negative_chunk_overlap(self, client):
        resp = _put(client, CONFIG_URL, {"rag_chunk_overlap": -10})
        assert resp.status_code == 422

    def test_put_config_with_float_rag_top_k(self, client):
        """Float value for an integer field."""
        resp = _put(client, CONFIG_URL, {"rag_top_k": 5.5})
        assert resp.status_code in (200, 422)

    def test_valid_api_key_accepted(self, client):
        """A properly formatted API key should be accepted."""
        resp = _put(client, CONFIG_URL, {"openai_api_key": "sk-test-key-1234567890"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "openai_api_key" in data["updated_fields"]

    def test_valid_anthropic_api_key_accepted(self, client):
        """A properly formatted Anthropic API key should be accepted."""
        resp = _put(client, CONFIG_URL, {"anthropic_api_key": "sk-ant-api-key-1234567890"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "anthropic_api_key" in data["updated_fields"]


# ===================================================================
# Section 7: Frontend integration -- settings form can read/write
# ===================================================================

class TestFrontendIntegration:
    """
    Tests that simulate what the frontend SettingsPanel does:
    1. Fetch the config (GET)
    2. Change a value (PUT)
    3. Re-fetch to verify (GET)
    """

    @pytest.fixture(scope="class")
    def client(self):
        with httpx.Client() as c:
            yield c

    @pytest.fixture(autouse=True)
    def restore_config(self, client):
        original = _get(client, CONFIG_URL).json()
        yield
        _put(client, CONFIG_URL, {
            "llm_provider": original["llm"]["provider"],
            "llm_model": original["llm"]["model"],
            "llm_temperature": original["llm"]["temperature"],
            "llm_max_tokens": original["llm"]["max_tokens"],
            "embedding_provider": original["embedding"]["provider"],
            "rag_top_k": original["rag"]["top_k_results"],
            "rag_chunk_size": original["rag"]["chunk_size"],
            "rag_chunk_overlap": original["rag"]["chunk_overlap"],
            "rag_score_threshold": original["rag"]["score_threshold"],
        })

    def test_frontend_read_modify_write_read_cycle(self, client):
        """
        Simulate the full cycle that the SettingsPanel performs:
        1. GET config (read current state)
        2. PUT config (modify a value)
        3. GET config (verify change persisted)
        """
        # Step 1: Read current config
        get1 = _get(client, CONFIG_URL)
        assert get1.status_code == 200
        config1 = get1.json()
        original_top_k = config1["rag"]["top_k_results"]
        new_top_k = original_top_k + 2 if original_top_k < 18 else original_top_k - 2

        # Step 2: Modify config
        put_resp = _put(client, CONFIG_URL, {"rag_top_k": new_top_k})
        assert put_resp.status_code == 200
        put_data = put_resp.json()
        assert put_data["success"] is True

        # Step 3: Re-read and verify
        get2 = _get(client, CONFIG_URL)
        assert get2.status_code == 200
        config2 = get2.json()
        assert config2["rag"]["top_k_results"] == new_top_k

    def test_frontend_change_llm_provider_and_verify(self, client):
        """
        Simulate changing the LLM provider from the frontend.
        """
        # Read current
        get1 = _get(client, CONFIG_URL)
        config1 = get1.json()
        current_provider = config1["llm"]["provider"]

        # Switch to a different provider (ollama requires no API key)
        new_provider = "ollama" if current_provider != "ollama" else "lmstudio"

        # Update
        put_resp = _put(client, CONFIG_URL, {"llm_provider": new_provider})
        assert put_resp.status_code == 200

        # Verify
        get2 = _get(client, CONFIG_URL)
        config2 = get2.json()
        assert config2["llm"]["provider"] == new_provider

    def test_frontend_change_embedding_provider_and_verify(self, client):
        """
        Simulate changing the embedding provider from the frontend.
        """
        get1 = _get(client, CONFIG_URL)
        config1 = get1.json()
        current_provider = config1["embedding"]["provider"]

        new_provider = "ollama" if current_provider != "ollama" else "local"

        put_resp = _put(client, CONFIG_URL, {"embedding_provider": new_provider})
        assert put_resp.status_code == 200

        get2 = _get(client, CONFIG_URL)
        config2 = get2.json()
        assert config2["embedding"]["provider"] == new_provider

    def test_frontend_update_rag_settings_full_form(self, client):
        """
        Simulate updating all RAG settings as the frontend form would do.
        """
        put_resp = _put(client, CONFIG_URL, {
            "rag_top_k": 5,
            "rag_chunk_size": 1200,
            "rag_chunk_overlap": 100,
            "rag_score_threshold": 0.75,
        })
        assert put_resp.status_code == 200
        data = put_resp.json()
        assert data["success"] is True
        assert len(data["updated_fields"]) == 4

        # Verify all persisted
        get_resp = _get(client, CONFIG_URL)
        config = get_resp.json()
        assert config["rag"]["top_k_results"] == 5
        assert config["rag"]["chunk_size"] == 1200
        assert config["rag"]["chunk_overlap"] == 100
        assert config["rag"]["score_threshold"] == 0.75

    def test_frontend_set_api_key_and_verify_flag(self, client):
        """
        Set an API key and verify that api_key_set becomes True.
        """
        # First check current state
        get1 = _get(client, CONFIG_URL)
        config1 = get1.json()

        # Set an OpenAI API key
        put_resp = _put(client, CONFIG_URL, {
            "openai_api_key": "sk-test-valid-key-1234567890abcdef",
        })
        assert put_resp.status_code == 200

        # Verify api_key_set flag changed
        get2 = _get(client, CONFIG_URL)
        config2 = get2.json()
        assert config2["llm"]["api_key_set"] is True

    def test_frontend_update_response_contains_updated_config(self, client):
        """
        The PUT response should contain the updated config object so the
        frontend can immediately reflect changes without an extra GET.
        """
        put_resp = _put(client, CONFIG_URL, {"rag_top_k": 6})
        assert put_resp.status_code == 200
        data = put_resp.json()

        # The config field should be populated
        assert data["config"] is not None
        assert isinstance(data["config"], dict)
        assert "rag" in data["config"]
        assert "llm" in data["config"]
        assert "embedding" in data["config"]


# ===================================================================
# Section 8: Concurrent and repeated requests (stability)
# ===================================================================

class TestConfigStability:
    """Tests for configuration endpoint stability under repeated calls."""

    @pytest.fixture(scope="class")
    def client(self):
        with httpx.Client() as c:
            yield c

    @pytest.fixture(autouse=True)
    def restore_config(self, client):
        original = _get(client, CONFIG_URL).json()
        yield
        _put(client, CONFIG_URL, {
            "llm_provider": original["llm"]["provider"],
            "llm_model": original["llm"]["model"],
            "llm_temperature": original["llm"]["temperature"],
            "llm_max_tokens": original["llm"]["max_tokens"],
            "rag_top_k": original["rag"]["top_k_results"],
            "rag_chunk_size": original["rag"]["chunk_size"],
            "rag_chunk_overlap": original["rag"]["chunk_overlap"],
            "rag_score_threshold": original["rag"]["score_threshold"],
        })

    def test_repeated_gets_return_consistent_structure(self, client):
        """Multiple GET requests should return the same structure."""
        responses = [_get(client, CONFIG_URL).json() for _ in range(5)]
        for r in responses[1:]:
            assert set(r.keys()) == set(responses[0].keys())
            assert set(r["server"].keys()) == set(responses[0]["server"].keys())
            assert set(r["llm"].keys()) == set(responses[0]["llm"].keys())

    def test_idempotent_update(self, client):
        """Updating to the same value twice should succeed both times."""
        for _ in range(2):
            resp = _put(client, CONFIG_URL, {"llm_temperature": 0.65})
            assert resp.status_code == 200
            data = resp.json()
            assert data["success"] is True

        # Verify final state
        get_resp = _get(client, CONFIG_URL)
        assert get_resp.json()["llm"]["temperature"] == 0.65
