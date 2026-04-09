"""
Runtime configuration manager for POE Knowledge Assistant.

Provides dynamic runtime configuration changes without requiring server restart.
Manages hot-reloadable settings like LLM provider, model, API keys, embedding
settings, and RAG parameters.
"""
import logging
import os
import threading
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

from src.config import (
    get_settings,
    clear_settings_cache,
    AppSettings,
    LLMSettings,
    EmbeddingSettings,
    RAGSettings,
    LLMProvider,
    EmbeddingProvider,
)
from src.models.config import ConfigUpdateRequest

logger = logging.getLogger(__name__)


class ConfigUpdateError(Exception):
    """Raised when a configuration update fails validation or application."""
    pass


# Fields that can be hot-reloaded without restarting the server
HOT_RELOADABLE_FIELDS: Set[str] = {
    "llm_provider",
    "llm_model",
    "llm_temperature",
    "llm_max_tokens",
    "openai_api_key",
    "anthropic_api_key",
    "embedding_provider",
    "embedding_model",
    "openai_embedding_api_key",
    "rag_top_k",
    "rag_score_threshold",
    "rag_chunk_size",
    "rag_chunk_overlap",
    "ollama_base_url",
    "lmstudio_base_url",
}

# Fields that require a restart to take effect
RESTART_REQUIRED_FIELDS: Set[str] = set()  # All current fields are hot-reloadable


class RuntimeConfigManager:
    """
    Manages runtime configuration updates for the application.

    This class provides a thread-safe way to update configuration settings
    at runtime. It validates changes before applying them and tracks
    what has been modified.
    """

    def __init__(self):
        """Initialize the runtime config manager."""
        self._lock = threading.Lock()
        self._update_history: List[Dict[str, Any]] = []
        self._max_history = 100

    def update_config(self, request: ConfigUpdateRequest) -> Dict[str, Any]:
        """
        Apply a configuration update request.

        Args:
            request: The configuration update request with optional fields.

        Returns:
            Dict with keys: success, message, updated_fields, requires_restart

        Raises:
            ConfigUpdateError: If validation fails or update cannot be applied.
        """
        with self._lock:
            updated_fields: List[str] = []
            requires_restart = False
            settings = get_settings()

            # Validate the request before applying any changes
            self._validate_update(request, settings)

            # Apply LLM provider changes
            if request.llm_provider is not None:
                self._apply_llm_provider(request.llm_provider)
                updated_fields.append("llm_provider")

            if request.llm_model is not None:
                self._apply_llm_model(request.llm_model, settings.llm.provider)
                updated_fields.append("llm_model")

            if request.llm_temperature is not None:
                self._apply_llm_temperature(
                    request.llm_temperature, settings.llm.provider
                )
                updated_fields.append("llm_temperature")

            if request.llm_max_tokens is not None:
                self._apply_llm_max_tokens(
                    request.llm_max_tokens, settings.llm.provider
                )
                updated_fields.append("llm_max_tokens")

            # Apply API key changes
            if request.openai_api_key is not None:
                self._apply_api_key("OPENAI_API_KEY", request.openai_api_key)
                settings.llm.openai_api_key = request.openai_api_key
                updated_fields.append("openai_api_key")

            if request.anthropic_api_key is not None:
                self._apply_api_key("ANTHROPIC_API_KEY", request.anthropic_api_key)
                settings.llm.anthropic_api_key = request.anthropic_api_key
                updated_fields.append("anthropic_api_key")

            if request.openai_embedding_api_key is not None:
                self._apply_api_key(
                    "EMBEDDING_OPENAI_API_KEY", request.openai_embedding_api_key
                )
                settings.embedding.openai_api_key = request.openai_embedding_api_key
                updated_fields.append("openai_embedding_api_key")

            # Apply embedding provider changes
            if request.embedding_provider is not None:
                self._apply_embedding_provider(request.embedding_provider)
                updated_fields.append("embedding_provider")

            if request.embedding_model is not None:
                self._apply_embedding_model(
                    request.embedding_model, settings.embedding.provider
                )
                updated_fields.append("embedding_model")

            # Apply RAG settings
            if request.rag_top_k is not None:
                settings.rag.top_k_results = request.rag_top_k
                updated_fields.append("rag_top_k")

            if request.rag_score_threshold is not None:
                settings.rag.score_threshold = request.rag_score_threshold
                updated_fields.append("rag_score_threshold")

            if request.rag_chunk_size is not None:
                settings.rag.chunk_size = request.rag_chunk_size
                updated_fields.append("rag_chunk_size")

            if request.rag_chunk_overlap is not None:
                settings.rag.chunk_overlap = request.rag_chunk_overlap
                updated_fields.append("rag_chunk_overlap")

            # Apply base URL changes
            if request.ollama_base_url is not None:
                settings.llm.ollama_base_url = request.ollama_base_url
                updated_fields.append("ollama_base_url")

            if request.lmstudio_base_url is not None:
                settings.llm.lmstudio_base_url = request.lmstudio_base_url
                updated_fields.append("lmstudio_base_url")

            # Check if restart is required
            for field in updated_fields:
                if field in RESTART_REQUIRED_FIELDS:
                    requires_restart = True
                    break

            # Record the update in history
            self._record_update(updated_fields)

            return {
                "success": True,
                "message": f"Configuration updated successfully. {len(updated_fields)} field(s) changed.",
                "updated_fields": updated_fields,
                "requires_restart": requires_restart,
            }

    def _validate_update(
        self, request: ConfigUpdateRequest, settings: AppSettings
    ) -> None:
        """
        Validate the update request before applying changes.

        Args:
            request: The configuration update request.
            settings: Current application settings.

        Raises:
            ConfigUpdateError: If validation fails.
        """
        # Determine the effective LLM provider (requested or current)
        effective_provider = request.llm_provider or settings.llm.provider

        # Validate that API key requirements are met for the provider
        if effective_provider == LLMProvider.OPENAI:
            effective_key = request.openai_api_key or settings.llm.openai_api_key
            if not effective_key:
                # In development mode, allow missing keys
                if os.getenv("ENVIRONMENT", "development") == "production":
                    raise ConfigUpdateError(
                        "OpenAI provider requires an API key. "
                        "Provide 'openai_api_key' in the request."
                    )

        if effective_provider == LLMProvider.ANTHROPIC:
            effective_key = request.anthropic_api_key or settings.llm.anthropic_api_key
            if not effective_key:
                if os.getenv("ENVIRONMENT", "development") == "production":
                    raise ConfigUpdateError(
                        "Anthropic provider requires an API key. "
                        "Provide 'anthropic_api_key' in the request."
                    )

        # Validate embedding provider API key requirements
        effective_embedding_provider = (
            request.embedding_provider or settings.embedding.provider
        )
        if effective_embedding_provider == EmbeddingProvider.OPENAI:
            effective_key = (
                request.openai_embedding_api_key
                or settings.embedding.openai_api_key
            )
            if not effective_key:
                if os.getenv("ENVIRONMENT", "development") == "production":
                    raise ConfigUpdateError(
                        "OpenAI embedding provider requires an API key. "
                        "Provide 'openai_embedding_api_key' in the request."
                    )

        # Validate chunk_overlap < chunk_size if either is provided
        if request.rag_chunk_overlap is not None or request.rag_chunk_size is not None:
            effective_chunk_size = request.rag_chunk_size or settings.rag.chunk_size
            effective_chunk_overlap = (
                request.rag_chunk_overlap or settings.rag.chunk_overlap
            )
            if effective_chunk_overlap >= effective_chunk_size:
                raise ConfigUpdateError(
                    f"chunk_overlap ({effective_chunk_overlap}) must be less than "
                    f"chunk_size ({effective_chunk_size})."
                )

        # Validate that at least one field is provided
        all_fields = [
            request.llm_provider,
            request.llm_model,
            request.llm_temperature,
            request.llm_max_tokens,
            request.openai_api_key,
            request.anthropic_api_key,
            request.embedding_provider,
            request.embedding_model,
            request.openai_embedding_api_key,
            request.rag_top_k,
            request.rag_score_threshold,
            request.rag_chunk_size,
            request.rag_chunk_overlap,
            request.ollama_base_url,
            request.lmstudio_base_url,
        ]
        if all(f is None for f in all_fields):
            raise ConfigUpdateError(
                "No fields provided for update. At least one configuration "
                "field must be specified."
            )

    def _apply_llm_provider(self, provider: LLMProvider) -> None:
        """Apply LLM provider change to settings and environment."""
        settings = get_settings()
        settings.llm.provider = provider
        logger.info(f"LLM provider changed to: {provider.value}")

    def _apply_llm_model(self, model: str, provider: LLMProvider) -> None:
        """Apply LLM model name change based on the current provider."""
        settings = get_settings()
        if provider == LLMProvider.OPENAI:
            settings.llm.openai_model = model
        elif provider == LLMProvider.ANTHROPIC:
            settings.llm.anthropic_model = model
        elif provider == LLMProvider.OLLAMA:
            settings.llm.ollama_model = model
        elif provider == LLMProvider.LMSTUDIO:
            settings.llm.lmstudio_model = model
        logger.info(
            f"LLM model changed to: {model} (provider: {provider.value})"
        )

    def _apply_llm_temperature(
        self, temperature: float, provider: LLMProvider
    ) -> None:
        """Apply temperature change to the appropriate provider settings."""
        settings = get_settings()
        if provider == LLMProvider.OPENAI:
            settings.llm.openai_temperature = temperature
        elif provider == LLMProvider.ANTHROPIC:
            settings.llm.anthropic_temperature = temperature
        elif provider == LLMProvider.OLLAMA:
            settings.llm.ollama_temperature = temperature
        elif provider == LLMProvider.LMSTUDIO:
            settings.llm.lmstudio_temperature = temperature
        logger.info(
            f"LLM temperature changed to: {temperature} "
            f"(provider: {provider.value})"
        )

    def _apply_llm_max_tokens(
        self, max_tokens: int, provider: LLMProvider
    ) -> None:
        """Apply max tokens change to the appropriate provider settings."""
        settings = get_settings()
        if provider == LLMProvider.OPENAI:
            settings.llm.openai_max_tokens = max_tokens
        elif provider == LLMProvider.ANTHROPIC:
            settings.llm.anthropic_max_tokens = max_tokens
        # Ollama and LMStudio do not use max_tokens in their settings
        logger.info(
            f"LLM max_tokens changed to: {max_tokens} "
            f"(provider: {provider.value})"
        )

    def _apply_api_key(self, env_var: str, key: str) -> None:
        """
        Apply API key change by setting the environment variable.

        This ensures that new LLM/embedding instances will pick up
        the updated key.
        """
        os.environ[env_var] = key
        logger.info(f"API key updated for: {env_var}")

    def _apply_embedding_provider(
        self, provider: EmbeddingProvider
    ) -> None:
        """Apply embedding provider change."""
        settings = get_settings()
        settings.embedding.provider = provider
        logger.info(f"Embedding provider changed to: {provider.value}")

    def _apply_embedding_model(
        self, model: str, provider: EmbeddingProvider
    ) -> None:
        """Apply embedding model name change based on the provider."""
        settings = get_settings()
        if provider == EmbeddingProvider.OPENAI:
            settings.embedding.openai_embedding_model = model
        elif provider == EmbeddingProvider.OLLAMA:
            settings.embedding.ollama_embedding_model = model
        else:
            # Local or LM Studio - use the generic model field
            settings.embedding.model = model
        logger.info(
            f"Embedding model changed to: {model} "
            f"(provider: {provider.value})"
        )

    def _record_update(self, updated_fields: List[str]) -> None:
        """Record the update in history for auditing."""
        record = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "fields_updated": updated_fields,
            "field_count": len(updated_fields),
        }
        self._update_history.append(record)
        # Trim history if it exceeds max
        if len(self._update_history) > self._max_history:
            self._update_history = self._update_history[-self._max_history :]

    def get_update_history(self, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Get the recent configuration update history.

        Args:
            limit: Maximum number of records to return.

        Returns:
            List of update history records, most recent first.
        """
        return list(reversed(self._update_history[-limit:]))

    def get_health(self) -> Dict[str, Any]:
        """
        Get health status of the runtime config manager.

        Returns:
            Dict with health status information.
        """
        return {
            "status": "ready",
            "total_updates": len(self._update_history),
            "hot_reloadable_fields": sorted(list(HOT_RELOADABLE_FIELDS)),
            "restart_required_fields": sorted(list(RESTART_REQUIRED_FIELDS)),
        }


# Singleton instance
_runtime_config_manager: Optional[RuntimeConfigManager] = None


def get_runtime_config_manager() -> RuntimeConfigManager:
    """
    Get or create the singleton RuntimeConfigManager instance.

    Returns:
        RuntimeConfigManager: The singleton manager instance.
    """
    global _runtime_config_manager
    if _runtime_config_manager is None:
        _runtime_config_manager = RuntimeConfigManager()
    return _runtime_config_manager


def check_runtime_config_health() -> Dict[str, Any]:
    """
    Check health of the runtime configuration manager.

    Returns:
        Dict with health status.
    """
    manager = get_runtime_config_manager()
    return manager.get_health()


__all__ = [
    "RuntimeConfigManager",
    "ConfigUpdateError",
    "get_runtime_config_manager",
    "check_runtime_config_health",
    "HOT_RELOADABLE_FIELDS",
    "RESTART_REQUIRED_FIELDS",
]
