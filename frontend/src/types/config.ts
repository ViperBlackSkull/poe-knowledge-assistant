/**
 * Configuration types for API request/response contracts.
 * Mirrors backend Pydantic models from backend/src/models/config.py
 * and enums from backend/src/config.py
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Supported LLM providers. */
export type LLMProvider = 'openai' | 'anthropic' | 'ollama' | 'lmstudio';

/** Supported embedding providers. */
export type EmbeddingProvider = 'local' | 'ollama' | 'lmstudio' | 'openai';

// ---------------------------------------------------------------------------
// Sub-configuration models
// ---------------------------------------------------------------------------

/**
 * Server configuration.
 *
 * Backend model: ServerConfig (config.py)
 */
export interface ServerConfig {
  /** Server host address */
  host: string;
  /** Server port number (1 - 65535) */
  port: number;
  /** Whether debug mode is enabled */
  debug: boolean;
  /** Number of worker processes (1 - 64) */
  workers: number;
}

/**
 * Database configuration.
 *
 * Backend model: DatabaseConfig (config.py)
 */
export interface DatabaseConfig {
  /** Database connection URL */
  database_url: string;
  /** Connection pool size (1 - 100) */
  pool_size: number;
  /** Maximum overflow connections (0 - 100) */
  max_overflow: number;
}

/**
 * ChromaDB vector database configuration.
 *
 * Backend model: ChromaDBConfig (config.py)
 */
export interface ChromaDBConfig {
  /** Directory for ChromaDB persistence */
  persist_directory: string;
  /** ChromaDB collection name (1 - 100 chars) */
  collection_name: string;
}

/**
 * RAG (Retrieval-Augmented Generation) configuration.
 *
 * Backend model: RAGConfig (config.py)
 */
export interface RAGConfig {
  /** Number of documents to retrieve (1 - 20) */
  top_k_results: number;
  /** Document chunk size in characters (100 - 4000) */
  chunk_size: number;
  /** Overlap between chunks in characters (0 - 1000) */
  chunk_overlap: number;
  /** Minimum similarity score threshold (0.0 - 1.0) */
  score_threshold: number;
}

/**
 * CORS (Cross-Origin Resource Sharing) configuration.
 *
 * Backend model: CORSConfig (config.py)
 */
export interface CORSConfig {
  /** List of allowed CORS origins */
  origins: string[];
  /** Whether to allow credentials in CORS requests */
  allow_credentials: boolean;
  /** Allowed HTTP methods */
  allow_methods: string[];
  /** Allowed HTTP headers */
  allow_headers: string[];
}

/**
 * LLM provider configuration for API responses.
 *
 * Backend model: LLMConfigResponse (config.py)
 */
export interface LLMConfigResponse {
  /** LLM provider being used */
  provider: LLMProvider;
  /** Model name */
  model: string;
  /** Temperature setting (0.0 - 2.0) */
  temperature: number;
  /** Maximum tokens for responses (1 - 32000) */
  max_tokens: number;
  /** Whether API key is configured (actual key is never exposed) */
  api_key_set: boolean;
}

/**
 * Embedding provider configuration for API responses.
 *
 * Backend model: EmbeddingConfigResponse (config.py)
 */
export interface EmbeddingConfigResponse {
  /** Embedding provider being used */
  provider: EmbeddingProvider;
  /** Embedding model name */
  model: string;
  /** Dimension of embedding vectors (>= 1) */
  dimension: number;
  /** Batch size for embedding generation (1 - 256) */
  batch_size: number;
}

// ---------------------------------------------------------------------------
// Top-level configuration models
// ---------------------------------------------------------------------------

/**
 * Complete application configuration model.
 *
 * Backend model: AppConfig (config.py)
 */
export interface AppConfig {
  /** Application name */
  app_name: string;
  /** Application version */
  app_version: string;
  /** Server configuration */
  server: ServerConfig;
  /** Database configuration */
  database: DatabaseConfig;
  /** ChromaDB configuration */
  chromadb: ChromaDBConfig;
  /** RAG configuration */
  rag: RAGConfig;
  /** CORS configuration */
  cors: CORSConfig;
  /** LLM configuration */
  llm: LLMConfigResponse;
  /** Embedding configuration */
  embedding: EmbeddingConfigResponse;
}

/**
 * Request body for updating configuration.
 * All fields are optional -- only provided fields will be updated.
 *
 * Backend model: ConfigUpdateRequest (config.py)
 */
export interface ConfigUpdateRequest {
  /** New LLM provider */
  llm_provider?: LLMProvider | null;
  /** New LLM model name */
  llm_model?: string | null;
  /** New temperature setting (0.0 - 2.0) */
  llm_temperature?: number | null;
  /** New max tokens setting (1 - 32000) */
  llm_max_tokens?: number | null;
  /** New OpenAI API key (stored securely on server, never returned in responses) */
  openai_api_key?: string | null;
  /** New Anthropic API key (stored securely on server, never returned in responses) */
  anthropic_api_key?: string | null;
  /** New embedding provider */
  embedding_provider?: EmbeddingProvider | null;
  /** New embedding model */
  embedding_model?: string | null;
  /** New OpenAI API key for embeddings */
  openai_embedding_api_key?: string | null;
  /** New top-k results setting (1 - 20) */
  rag_top_k?: number | null;
  /** New score threshold (0.0 - 1.0) */
  rag_score_threshold?: number | null;
  /** New chunk size setting */
  rag_chunk_size?: number | null;
  /** New chunk overlap setting */
  rag_chunk_overlap?: number | null;
  /** New Ollama base URL */
  ollama_base_url?: string | null;
  /** New LM Studio base URL */
  lmstudio_base_url?: string | null;
}

// ---------------------------------------------------------------------------
// Config update response model
// ---------------------------------------------------------------------------

/**
 * Response from `PUT /api/config`.
 *
 * Backend model: ConfigUpdateResponse (config.py)
 */
export interface ConfigUpdateResponse {
  /** Whether the update was successful */
  success: boolean;
  /** Human-readable status message */
  message: string;
  /** List of field names that were updated */
  updated_fields: string[];
  /** Whether changes require a restart to take effect */
  requires_restart: boolean;
  /** Updated configuration (with sensitive data masked) */
  config: AppConfig | null;
}
