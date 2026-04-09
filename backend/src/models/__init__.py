"""
Pydantic models for API requests and responses.

This module exports all models used throughout the application:
- Chat models: For conversation and chat interactions
- Config models: For application configuration
- System models: For standard responses and error handling
- Scraper models: For data ingestion and scraping

Usage:
    from src.models import ChatRequest, ChatResponse
    from src.models import HealthStatus, APIResponse
"""

# Chat models
from src.models.chat import (
    ChatMessage,
    ChatRequest,
    ChatResponse,
    ConversationHistory,
    GameVersion,
    MessageRole,
    Source,
)

# Configuration models
from src.models.config import (
    AppConfig,
    ChromaDBConfig,
    ConfigUpdateRequest,
    CORSConfig,
    DatabaseConfig,
    EmbeddingConfigResponse,
    EmbeddingProvider,
    LLMConfigResponse,
    LLMProvider,
    RAGConfig,
    ServerConfig,
)

# Scraper models
from src.models.scraper import (
    Game,
    ItemType,
    PoECategory,
    PoEItem,
    ScrapedData,
    ScrapeJob,
    ScrapeRequest,
    ScrapeStatus,
)

# System models
from src.models.system import (
    APIError,
    APIResponse,
    ErrorDetail,
    ErrorResponse,
    HealthStatus,
    PaginatedResponse,
    ValidationError,
)

# Export all models
__all__ = [
    # Chat models
    "MessageRole",
    "ChatMessage",
    "GameVersion",
    "ChatRequest",
    "Source",
    "ChatResponse",
    "ConversationHistory",
    # Config models
    "LLMProvider",
    "EmbeddingProvider",
    "ServerConfig",
    "DatabaseConfig",
    "ChromaDBConfig",
    "RAGConfig",
    "CORSConfig",
    "LLMConfigResponse",
    "EmbeddingConfigResponse",
    "AppConfig",
    "ConfigUpdateRequest",
    # System models
    "HealthStatus",
    "APIResponse",
    "ErrorDetail",
    "ValidationError",
    "APIError",
    "ErrorResponse",
    "PaginatedResponse",
    # Scraper models
    "Game",
    "ItemType",
    "PoECategory",
    "PoEItem",
    "ScrapedData",
    "ScrapeStatus",
    "ScrapeJob",
    "ScrapeRequest",
]
