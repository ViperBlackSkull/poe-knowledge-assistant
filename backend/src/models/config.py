"""
Configuration models for API requests and responses.
Handles application configuration and settings.
"""
from typing import Dict, List, Optional

from pydantic import BaseModel, Field, field_validator

# Import enums from config module to avoid duplication
from src.config import (
    EmbeddingProvider as EmbeddingProviderEnum,
    LLMProvider as LLMProviderEnum,
)


# Re-export enums for convenience
LLMProvider = LLMProviderEnum
EmbeddingProvider = EmbeddingProviderEnum


class ServerConfig(BaseModel):
    """
    Server configuration model.

    Attributes:
        host: Server host address
        port: Server port number
        debug: Whether debug mode is enabled
        workers: Number of worker processes
    """
    host: str = Field(
        default="0.0.0.0",
        description="Server host address"
    )
    port: int = Field(
        default=8000,
        description="Server port number",
        ge=1,
        le=65535
    )
    debug: bool = Field(
        default=True,
        description="Debug mode enabled"
    )
    workers: int = Field(
        default=1,
        description="Number of worker processes",
        ge=1,
        le=64
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "host": "0.0.0.0",
                    "port": 8000,
                    "debug": True,
                    "workers": 1
                }
            ]
        }
    }


class DatabaseConfig(BaseModel):
    """
    Database configuration model.

    Attributes:
        database_url: Database connection URL
        pool_size: Connection pool size
        max_overflow: Maximum overflow connections
    """
    database_url: str = Field(
        default="sqlite:///./data/poe_knowledge.db",
        description="Database connection URL"
    )
    pool_size: int = Field(
        default=5,
        description="Connection pool size",
        ge=1,
        le=100
    )
    max_overflow: int = Field(
        default=10,
        description="Maximum overflow connections",
        ge=0,
        le=100
    )

    @field_validator("database_url")
    @classmethod
    def validate_database_url(cls, v):
        """Validate database URL format."""
        if not v:
            raise ValueError("Database URL cannot be empty")
        # Basic validation for common database URL schemes
        valid_schemes = ["sqlite", "postgresql", "postgres", "mysql"]
        if not any(v.startswith(f"{scheme}://") for scheme in valid_schemes):
            raise ValueError(f"Database URL must start with one of: {valid_schemes}")
        return v

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "database_url": "sqlite:///./data/poe_knowledge.db",
                    "pool_size": 5,
                    "max_overflow": 10
                }
            ]
        }
    }


class ChromaDBConfig(BaseModel):
    """
    ChromaDB vector database configuration model.

    Attributes:
        persist_directory: Directory for data persistence
        collection_name: Name of the collection to use
    """
    persist_directory: str = Field(
        default="./data/chroma",
        description="Directory for ChromaDB persistence"
    )
    collection_name: str = Field(
        default="poe_knowledge",
        description="ChromaDB collection name",
        min_length=1,
        max_length=100
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "persist_directory": "./data/chroma",
                    "collection_name": "poe_knowledge"
                }
            ]
        }
    }


class RAGConfig(BaseModel):
    """
    RAG (Retrieval-Augmented Generation) configuration model.

    Attributes:
        top_k_results: Number of documents to retrieve
        chunk_size: Size of text chunks in characters
        chunk_overlap: Overlap between chunks in characters
        score_threshold: Minimum similarity score threshold
    """
    top_k_results: int = Field(
        default=3,
        description="Number of documents to retrieve",
        ge=1,
        le=20
    )
    chunk_size: int = Field(
        default=1000,
        description="Document chunk size in characters",
        ge=100,
        le=4000
    )
    chunk_overlap: int = Field(
        default=200,
        description="Overlap between chunks in characters",
        ge=0,
        le=1000
    )
    score_threshold: float = Field(
        default=0.7,
        description="Minimum similarity score threshold",
        ge=0.0,
        le=1.0
    )

    @field_validator("chunk_overlap")
    @classmethod
    def validate_chunk_overlap(cls, v, info):
        """Ensure chunk_overlap is less than chunk_size."""
        chunk_size = info.data.get("chunk_size", 1000)
        if v >= chunk_size:
            raise ValueError("chunk_overlap must be less than chunk_size")
        return v

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "top_k_results": 3,
                    "chunk_size": 1000,
                    "chunk_overlap": 200,
                    "score_threshold": 0.7
                }
            ]
        }
    }


class CORSConfig(BaseModel):
    """
    CORS (Cross-Origin Resource Sharing) configuration model.

    Attributes:
        origins: List of allowed origins
        allow_credentials: Whether to allow credentials
        allow_methods: Allowed HTTP methods
        allow_headers: Allowed HTTP headers
    """
    origins: List[str] = Field(
        default=["http://localhost:3000", "http://localhost:5173"],
        description="List of allowed CORS origins"
    )
    allow_credentials: bool = Field(
        default=True,
        description="Allow credentials in CORS requests"
    )
    allow_methods: List[str] = Field(
        default=["*"],
        description="Allowed HTTP methods"
    )
    allow_headers: List[str] = Field(
        default=["*"],
        description="Allowed HTTP headers"
    )

    @field_validator("origins")
    @classmethod
    def validate_origins(cls, v):
        """Validate that origins is not empty."""
        if not v:
            raise ValueError("At least one CORS origin must be specified")
        return v

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "origins": ["http://localhost:3000", "http://localhost:5173"],
                    "allow_credentials": True,
                    "allow_methods": ["*"],
                    "allow_headers": ["*"]
                }
            ]
        }
    }


class LLMConfigResponse(BaseModel):
    """
    LLM provider configuration for API responses.

    Attributes:
        provider: Current LLM provider
        model: Model name being used
        temperature: Temperature setting
        max_tokens: Maximum tokens for responses
        api_key_set: Whether API key is configured (not the actual key)
    """
    provider: LLMProvider = Field(
        ...,
        description="LLM provider being used"
    )
    model: str = Field(
        ...,
        description="Model name"
    )
    temperature: float = Field(
        default=0.7,
        description="Temperature setting",
        ge=0.0,
        le=2.0
    )
    max_tokens: int = Field(
        default=2000,
        description="Maximum tokens for responses",
        ge=1,
        le=32000
    )
    api_key_set: bool = Field(
        default=False,
        description="Whether API key is configured"
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "provider": "openai",
                    "model": "gpt-4",
                    "temperature": 0.7,
                    "max_tokens": 2000,
                    "api_key_set": True
                }
            ]
        }
    }


class EmbeddingConfigResponse(BaseModel):
    """
    Embedding provider configuration for API responses.

    Attributes:
        provider: Current embedding provider
        model: Embedding model name
        dimension: Dimension of embedding vectors
        batch_size: Batch size for embedding generation
    """
    provider: EmbeddingProvider = Field(
        ...,
        description="Embedding provider being used"
    )
    model: str = Field(
        ...,
        description="Embedding model name"
    )
    dimension: int = Field(
        default=384,
        description="Dimension of embedding vectors",
        ge=1
    )
    batch_size: int = Field(
        default=32,
        description="Batch size for embedding generation",
        ge=1,
        le=256
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "provider": "local",
                    "model": "all-MiniLM-L6-v2",
                    "dimension": 384,
                    "batch_size": 32
                }
            ]
        }
    }


class ScraperConfig(BaseModel):
    """
    Scraper configuration model.

    Attributes:
        rate_limit_delay: Delay between requests in seconds
        max_retries: Maximum retry attempts
        timeout: Request timeout in seconds
        concurrent_requests: Maximum concurrent requests
    """
    rate_limit_delay: float = Field(
        default=2.0,
        description="Delay between requests in seconds",
        ge=0.0,
        le=60.0
    )
    max_retries: int = Field(
        default=3,
        description="Maximum retry attempts",
        ge=0,
        le=10
    )
    timeout: int = Field(
        default=30,
        description="Request timeout in seconds",
        ge=1,
        le=300
    )
    concurrent_requests: int = Field(
        default=5,
        description="Maximum concurrent requests",
        ge=1,
        le=20
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "rate_limit_delay": 2.0,
                    "max_retries": 3,
                    "timeout": 30,
                    "concurrent_requests": 5
                }
            ]
        }
    }


class AppConfig(BaseModel):
    """
    Complete application configuration model.

    Attributes:
        app_name: Application name
        app_version: Application version
        environment: Application environment
        server: Server configuration
        database: Database configuration
        chromadb: ChromaDB configuration
        rag: RAG configuration
        cors: CORS configuration
        llm: LLM configuration
        embedding: Embedding configuration
        scraper: Scraper configuration
    """
    app_name: str = Field(
        default="POE Knowledge Assistant",
        description="Application name"
    )
    app_version: str = Field(
        default="1.0.0",
        description="Application version"
    )
    environment: str = Field(
        default="development",
        description="Application environment"
    )
    server: ServerConfig = Field(
        default_factory=ServerConfig,
        description="Server configuration"
    )
    database: DatabaseConfig = Field(
        default_factory=DatabaseConfig,
        description="Database configuration"
    )
    chromadb: ChromaDBConfig = Field(
        default_factory=ChromaDBConfig,
        description="ChromaDB configuration"
    )
    rag: RAGConfig = Field(
        default_factory=RAGConfig,
        description="RAG configuration"
    )
    cors: CORSConfig = Field(
        default_factory=CORSConfig,
        description="CORS configuration"
    )
    llm: LLMConfigResponse = Field(
        ...,
        description="LLM configuration"
    )
    embedding: EmbeddingConfigResponse = Field(
        ...,
        description="Embedding configuration"
    )
    scraper: ScraperConfig = Field(
        default_factory=ScraperConfig,
        description="Scraper configuration"
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "app_name": "POE Knowledge Assistant",
                    "app_version": "1.0.0",
                    "environment": "development",
                    "server": {
                        "host": "0.0.0.0",
                        "port": 8000,
                        "debug": True,
                        "workers": 1
                    },
                    "database": {
                        "database_url": "sqlite:///./data/poe_knowledge.db",
                        "pool_size": 5,
                        "max_overflow": 10
                    },
                    "chromadb": {
                        "persist_directory": "./data/chroma",
                        "collection_name": "poe_knowledge"
                    },
                    "rag": {
                        "top_k_results": 3,
                        "chunk_size": 1000,
                        "chunk_overlap": 200,
                        "score_threshold": 0.7
                    },
                    "cors": {
                        "origins": ["http://localhost:3000"],
                        "allow_credentials": True,
                        "allow_methods": ["*"],
                        "allow_headers": ["*"]
                    },
                    "llm": {
                        "provider": "openai",
                        "model": "gpt-4",
                        "temperature": 0.7,
                        "max_tokens": 2000,
                        "api_key_set": True
                    },
                    "embedding": {
                        "provider": "local",
                        "model": "all-MiniLM-L6-v2",
                        "dimension": 384,
                        "batch_size": 32
                    },
                    "scraper": {
                        "rate_limit_delay": 2.0,
                        "max_retries": 3,
                        "timeout": 30,
                        "concurrent_requests": 5
                    }
                }
            ]
        }
    }


class ConfigUpdateRequest(BaseModel):
    """
    Request model for updating configuration.

    All fields are optional - only provided fields will be updated.

    Attributes:
        llm_provider: New LLM provider
        llm_model: New LLM model name
        llm_temperature: New temperature setting
        llm_max_tokens: New max tokens setting
        openai_api_key: New OpenAI API key (stored securely)
        anthropic_api_key: New Anthropic API key (stored securely)
        embedding_provider: New embedding provider
        embedding_model: New embedding model
        openai_embedding_api_key: New OpenAI API key for embeddings
        rag_top_k: New top-k results setting
        rag_score_threshold: New score threshold
        rag_chunk_size: New chunk size setting
        rag_chunk_overlap: New chunk overlap setting
        ollama_base_url: New Ollama base URL
        lmstudio_base_url: New LM Studio base URL
    """
    llm_provider: Optional[LLMProvider] = Field(
        default=None,
        description="New LLM provider"
    )
    llm_model: Optional[str] = Field(
        default=None,
        description="New LLM model name"
    )
    llm_temperature: Optional[float] = Field(
        default=None,
        description="New temperature setting",
        ge=0.0,
        le=2.0
    )
    llm_max_tokens: Optional[int] = Field(
        default=None,
        description="New max tokens setting",
        ge=1,
        le=32000
    )
    openai_api_key: Optional[str] = Field(
        default=None,
        description="New OpenAI API key (stored securely, never returned in responses)",
        min_length=1,
        max_length=200,
    )
    anthropic_api_key: Optional[str] = Field(
        default=None,
        description="New Anthropic API key (stored securely, never returned in responses)",
        min_length=1,
        max_length=200,
    )
    embedding_provider: Optional[EmbeddingProvider] = Field(
        default=None,
        description="New embedding provider"
    )
    embedding_model: Optional[str] = Field(
        default=None,
        description="New embedding model"
    )
    openai_embedding_api_key: Optional[str] = Field(
        default=None,
        description="New OpenAI API key for embeddings (stored securely)",
        min_length=1,
        max_length=200,
    )
    rag_top_k: Optional[int] = Field(
        default=None,
        description="New top-k results setting",
        ge=1,
        le=20
    )
    rag_score_threshold: Optional[float] = Field(
        default=None,
        description="New score threshold",
        ge=0.0,
        le=1.0
    )
    rag_chunk_size: Optional[int] = Field(
        default=None,
        description="New chunk size setting",
        ge=100,
        le=4000,
    )
    rag_chunk_overlap: Optional[int] = Field(
        default=None,
        description="New chunk overlap setting",
        ge=0,
        le=1000,
    )
    ollama_base_url: Optional[str] = Field(
        default=None,
        description="New Ollama base URL",
    )
    lmstudio_base_url: Optional[str] = Field(
        default=None,
        description="New LM Studio base URL",
    )

    @field_validator("llm_model", "embedding_model", "ollama_base_url", "lmstudio_base_url")
    @classmethod
    def validate_non_empty_string(cls, v):
        """Validate that string fields are not empty when provided."""
        if v is not None and not v.strip():
            raise ValueError("Field cannot be empty or only whitespace")
        return v

    @field_validator("openai_api_key", "anthropic_api_key", "openai_embedding_api_key")
    @classmethod
    def validate_api_key(cls, v):
        """Validate API key format when provided."""
        if v is not None:
            v = v.strip()
            if not v:
                raise ValueError("API key cannot be empty or only whitespace")
            # Basic format validation - API keys should be reasonable strings
            if len(v) < 8:
                raise ValueError("API key appears too short to be valid")
        return v

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "llm_provider": "anthropic",
                    "llm_model": "claude-3-sonnet-20240229",
                    "llm_temperature": 0.8,
                    "anthropic_api_key": "sk-ant-...",
                    "embedding_provider": "openai",
                    "openai_embedding_api_key": "sk-...",
                    "rag_top_k": 5,
                    "rag_chunk_size": 1000,
                    "rag_chunk_overlap": 200,
                }
            ]
        }
    }


class ConfigUpdateResponse(BaseModel):
    """
    Response model for configuration update.

    Attributes:
        success: Whether the update was successful
        message: Human-readable status message
        updated_fields: List of field names that were updated
        requires_restart: Whether the changes require a restart to take effect
        config: The updated configuration (with sensitive data masked)
    """
    success: bool = Field(
        ...,
        description="Whether the update was successful"
    )
    message: str = Field(
        ...,
        description="Human-readable status message"
    )
    updated_fields: List[str] = Field(
        default_factory=list,
        description="List of field names that were updated"
    )
    requires_restart: bool = Field(
        default=False,
        description="Whether changes require a restart to take effect"
    )
    config: Optional[AppConfig] = Field(
        default=None,
        description="Updated configuration (with sensitive data masked)"
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "success": True,
                    "message": "Configuration updated successfully",
                    "updated_fields": ["llm_provider", "llm_model", "openai_api_key"],
                    "requires_restart": False,
                    "config": {
                        "app_name": "POE Knowledge Assistant",
                        "app_version": "1.0.0",
                        "environment": "development",
                    }
                }
            ]
        }
    }


__all__ = [
    "LLMProvider",
    "EmbeddingProvider",
    "ServerConfig",
    "DatabaseConfig",
    "ChromaDBConfig",
    "RAGConfig",
    "CORSConfig",
    "LLMConfigResponse",
    "EmbeddingConfigResponse",
    "ScraperConfig",
    "AppConfig",
    "ConfigUpdateRequest",
    "ConfigUpdateResponse",
]
