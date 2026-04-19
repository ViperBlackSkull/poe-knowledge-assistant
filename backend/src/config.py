"""
Environment configuration module for POE Knowledge Assistant.
Handles all configuration settings with validation and sensible defaults.
"""
import os
from typing import Optional, List
from enum import Enum
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class LLMProvider(str, Enum):
    """Supported LLM providers."""
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    OLLAMA = "ollama"
    LMSTUDIO = "lmstudio"


class EmbeddingProvider(str, Enum):
    """Supported embedding providers."""
    LOCAL = "local"
    OLLAMA = "ollama"
    LMSTUDIO = "lmstudio"
    OPENAI = "openai"


class Environment(str, Enum):
    """Application environment types."""
    DEVELOPMENT = "development"
    PRODUCTION = "production"
    TESTING = "testing"


class DatabaseSettings(BaseSettings):
    """Database configuration settings."""

    model_config = SettingsConfigDict(env_prefix="", env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # PostgreSQL/SQLite database
    database_url: str = Field(
        default="sqlite:///./data/poe_knowledge.db",
        description="Database connection URL"
    )
    database_pool_size: int = Field(
        default=5,
        description="Database connection pool size"
    )
    database_max_overflow: int = Field(
        default=10,
        description="Maximum overflow for database connections"
    )


class ChromaDBSettings(BaseSettings):
    """ChromaDB vector database settings."""

    model_config = SettingsConfigDict(env_prefix="chroma_", env_file=".env", env_file_encoding="utf-8", extra="ignore")

    persist_directory: str = Field(
        default="./data/chroma",
        description="Directory for ChromaDB persistence"
    )
    collection_name: str = Field(
        default="poe_knowledge",
        description="ChromaDB collection name"
    )


class LLMSettings(BaseSettings):
    """LLM provider configuration."""

    model_config = SettingsConfigDict(env_prefix="", env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Provider selection
    provider: LLMProvider = Field(
        default=LLMProvider.OPENAI,
        description="LLM provider to use"
    )

    # OpenAI settings
    openai_api_key: Optional[str] = Field(
        default=None,
        description="OpenAI API key"
    )
    openai_model: str = Field(
        default="gpt-4",
        description="OpenAI model to use"
    )
    openai_temperature: float = Field(
        default=0.7,
        description="OpenAI temperature setting"
    )
    openai_max_tokens: int = Field(
        default=2000,
        description="Maximum tokens for OpenAI responses"
    )

    # Anthropic settings
    anthropic_api_key: Optional[str] = Field(
        default=None,
        description="Anthropic API key"
    )
    anthropic_base_url: Optional[str] = Field(
        default=None,
        description="Anthropic API base URL (for compatible proxies)"
    )
    anthropic_model: str = Field(
        default="claude-3-sonnet-20240229",
        description="Anthropic model to use"
    )
    anthropic_temperature: float = Field(
        default=0.7,
        description="Anthropic temperature setting"
    )
    anthropic_max_tokens: int = Field(
        default=2000,
        description="Maximum tokens for Anthropic responses"
    )

    # Ollama settings
    ollama_base_url: str = Field(
        default="http://localhost:11434",
        description="Ollama base URL"
    )
    ollama_model: str = Field(
        default="llama2",
        description="Ollama model to use"
    )
    ollama_temperature: float = Field(
        default=0.7,
        description="Ollama temperature setting"
    )

    # LM Studio settings
    lmstudio_base_url: str = Field(
        default="http://localhost:1234",
        description="LM Studio base URL"
    )
    lmstudio_model: str = Field(
        default="local-model",
        description="LM Studio model identifier"
    )
    lmstudio_temperature: float = Field(
        default=0.7,
        description="LM Studio temperature setting"
    )

    @field_validator("openai_api_key")
    @classmethod
    def validate_openai_key(cls, v, info):
        """Validate OpenAI API key if provider is OpenAI."""
        if info.data.get("provider") == LLMProvider.OPENAI and not v:
            # In development, allow missing API key
            if os.getenv("ENVIRONMENT", "development") != "production":
                return v
            raise ValueError("OPENAI_API_KEY is required when using OpenAI provider")
        return v

    @field_validator("anthropic_api_key")
    @classmethod
    def validate_anthropic_key(cls, v, info):
        """Validate Anthropic API key if provider is Anthropic."""
        if info.data.get("provider") == LLMProvider.ANTHROPIC and not v:
            # In development, allow missing API key
            if os.getenv("ENVIRONMENT", "development") != "production":
                return v
            raise ValueError("ANTHROPIC_API_KEY is required when using Anthropic provider")
        return v


class EmbeddingSettings(BaseSettings):
    """Embedding provider configuration."""

    model_config = SettingsConfigDict(env_prefix="embedding_", env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Provider selection
    provider: EmbeddingProvider = Field(
        default=EmbeddingProvider.LOCAL,
        description="Embedding provider to use"
    )

    # Model settings (applies to all providers)
    model: str = Field(
        default="all-MiniLM-L6-v2",
        description="Embedding model name"
    )

    # OpenAI embeddings
    openai_api_key: Optional[str] = Field(
        default=None,
        description="OpenAI API key for embeddings"
    )
    openai_embedding_model: str = Field(
        default="text-embedding-ada-002",
        description="OpenAI embedding model"
    )

    # Ollama embeddings
    ollama_base_url: str = Field(
        default="http://localhost:11434",
        description="Ollama base URL for embeddings"
    )
    ollama_embedding_model: str = Field(
        default="nomic-embed-text",
        description="Ollama embedding model"
    )

    # LM Studio embeddings
    lmstudio_base_url: str = Field(
        default="http://localhost:1234",
        description="LM Studio base URL for embeddings"
    )

    # Embedding dimensions (for vector storage)
    embedding_dimension: int = Field(
        default=384,
        description="Dimension of embedding vectors"
    )

    # Batch settings
    batch_size: int = Field(
        default=32,
        description="Batch size for embedding generation"
    )

    @field_validator("openai_api_key")
    @classmethod
    def validate_openai_key(cls, v, info):
        """Validate OpenAI API key if embedding provider is OpenAI."""
        if info.data.get("provider") == EmbeddingProvider.OPENAI and not v:
            # In development, allow missing API key
            if os.getenv("ENVIRONMENT", "development") != "production":
                return v
            raise ValueError("OPENAI_API_KEY is required when using OpenAI embeddings")
        return v


class ServerSettings(BaseSettings):
    """Server configuration."""

    model_config = SettingsConfigDict(env_prefix="api_", env_file=".env", env_file_encoding="utf-8", extra="ignore")

    host: str = Field(
        default="0.0.0.0",
        description="Server host"
    )
    port: int = Field(
        default=8000,
        description="Server port"
    )
    debug: bool = Field(
        default=True,
        description="Debug mode"
    )
    reload: bool = Field(
        default=True,
        description="Auto-reload on code changes"
    )
    workers: int = Field(
        default=1,
        description="Number of worker processes"
    )


class CORSSettings(BaseSettings):
    """CORS configuration."""

    model_config = SettingsConfigDict(env_prefix="cors_", env_file=".env", env_file_encoding="utf-8", extra="ignore")

    origins: str = Field(
        default="http://localhost:3000,http://localhost:5173",
        description="Allowed CORS origins (comma-separated)"
    )
    allow_credentials: bool = Field(
        default=True,
        description="Allow credentials in CORS"
    )
    allow_methods: str = Field(
        default="*",
        description="Allowed HTTP methods"
    )
    allow_headers: str = Field(
        default="*",
        description="Allowed HTTP headers"
    )

    def get_origins_list(self) -> List[str]:
        """Parse CORS origins into a list."""
        return [origin.strip() for origin in self.origins.split(",")]


class LoggingSettings(BaseSettings):
    """Logging configuration."""

    model_config = SettingsConfigDict(env_prefix="log_", env_file=".env", env_file_encoding="utf-8", extra="ignore")

    level: str = Field(
        default="INFO",
        description="Logging level"
    )
    format: str = Field(
        default="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        description="Log format string"
    )
    file_path: Optional[str] = Field(
        default=None,
        description="Optional log file path"
    )
    max_bytes: int = Field(
        default=10485760,  # 10MB
        description="Maximum log file size in bytes"
    )
    backup_count: int = Field(
        default=5,
        description="Number of backup log files to keep"
    )

    @field_validator("level")
    @classmethod
    def validate_log_level(cls, v):
        """Validate logging level."""
        valid_levels = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
        if v.upper() not in valid_levels:
            raise ValueError(f"Invalid log level. Must be one of: {valid_levels}")
        return v.upper()


class SecuritySettings(BaseSettings):
    """Security configuration."""

    model_config = SettingsConfigDict(env_prefix="", env_file=".env", env_file_encoding="utf-8", extra="ignore")

    secret_key: str = Field(
        default="your-secret-key-change-in-production-please",
        description="Secret key for JWT encoding"
    )
    algorithm: str = Field(
        default="HS256",
        description="JWT algorithm"
    )
    access_token_expire_minutes: int = Field(
        default=30,
        description="Access token expiration time in minutes"
    )
    api_key_header: str = Field(
        default="X-API-Key",
        description="API key header name"
    )

    @field_validator("secret_key")
    @classmethod
    def validate_secret_key(cls, v):
        """Validate secret key in production."""
        if os.getenv("ENVIRONMENT", "development") == "production":
            if v == "your-secret-key-change-in-production-please":
                raise ValueError("Must change SECRET_KEY in production environment")
        return v


class RAGSettings(BaseSettings):
    """RAG pipeline configuration."""

    model_config = SettingsConfigDict(env_prefix="rag_", env_file=".env", env_file_encoding="utf-8", extra="ignore")

    top_k_results: int = Field(
        default=3,
        description="Number of documents to retrieve"
    )
    chunk_size: int = Field(
        default=1000,
        description="Document chunk size in characters"
    )
    chunk_overlap: int = Field(
        default=200,
        description="Overlap between chunks in characters"
    )
    score_threshold: float = Field(
        default=0.7,
        description="Minimum similarity score threshold"
    )


class ScraperSettings(BaseSettings):
    """Scraper configuration."""

    model_config = SettingsConfigDict(env_prefix="scraper_", env_file=".env", env_file_encoding="utf-8", extra="ignore")

    rate_limit_delay: float = Field(
        default=2.0,
        description="Delay between requests in seconds"
    )
    max_retries: int = Field(
        default=3,
        description="Maximum retry attempts"
    )
    timeout: int = Field(
        default=30,
        description="Request timeout in seconds"
    )
    user_agent: str = Field(
        default="Mozilla/5.0 (compatible; POEKnowledgeBot/1.0)",
        description="User agent string for requests"
    )
    concurrent_requests: int = Field(
        default=5,
        description="Maximum concurrent requests"
    )


class AppSettings(BaseSettings):
    """Main application settings."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )

    # Application metadata
    app_name: str = Field(
        default="POE Knowledge Assistant",
        description="Application name"
    )
    app_version: str = Field(
        default="1.0.0",
        description="Application version"
    )
    environment: Environment = Field(
        default=Environment.DEVELOPMENT,
        description="Application environment"
    )

    # Nested settings
    database: DatabaseSettings = Field(default_factory=DatabaseSettings)
    chromadb: ChromaDBSettings = Field(default_factory=ChromaDBSettings)
    llm: LLMSettings = Field(default_factory=LLMSettings)
    embedding: EmbeddingSettings = Field(default_factory=EmbeddingSettings)
    server: ServerSettings = Field(default_factory=ServerSettings)
    cors: CORSSettings = Field(default_factory=CORSSettings)
    logging: LoggingSettings = Field(default_factory=LoggingSettings)
    security: SecuritySettings = Field(default_factory=SecuritySettings)
    rag: RAGSettings = Field(default_factory=RAGSettings)
    scraper: ScraperSettings = Field(default_factory=ScraperSettings)


@lru_cache()
def get_settings() -> AppSettings:
    """
    Get application settings with caching.

    This function caches the settings object to avoid
    re-reading environment variables on every request.

    Returns:
        AppSettings: Cached application settings instance
    """
    return AppSettings()


def clear_settings_cache():
    """Clear the settings cache (useful for testing)."""
    get_settings.cache_clear()


# Convenience function to check if we're in production
def is_production() -> bool:
    """Check if running in production environment."""
    return get_settings().environment == Environment.PRODUCTION


# Convenience function to check if we're in development
def is_development() -> bool:
    """Check if running in development environment."""
    return get_settings().environment == Environment.DEVELOPMENT


# Export commonly used items
__all__ = [
    "AppSettings",
    "DatabaseSettings",
    "ChromaDBSettings",
    "LLMSettings",
    "EmbeddingSettings",
    "ServerSettings",
    "CORSSettings",
    "LoggingSettings",
    "SecuritySettings",
    "RAGSettings",
    "ScraperSettings",
    "LLMProvider",
    "EmbeddingProvider",
    "Environment",
    "get_settings",
    "clear_settings_cache",
    "is_production",
    "is_development",
]
