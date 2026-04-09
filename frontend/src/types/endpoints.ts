/**
 * Endpoint-specific response types for the live API routes defined in
 * backend/src/main.py. These represent the exact JSON shapes returned by
 * each endpoint, including inline models not defined in the shared model
 * modules.
 */

import type { LLMProvider, EmbeddingProvider } from './config';

// ---------------------------------------------------------------------------
// Root endpoint
// ---------------------------------------------------------------------------

/**
 * Response from `GET /api/`.
 */
export interface RootResponse {
  message: string;
  version: string;
  status: string;
}

// ---------------------------------------------------------------------------
// Health endpoint
// ---------------------------------------------------------------------------

/**
 * Response from `GET /api/health`.
 *
 * This is the *actual* shape returned by the health_check handler -- it is
 * more detailed than the generic HealthStatus model and includes per-service
 * messages.
 */
export interface HealthCheckResponse {
  /** Overall status: "healthy" or "degraded" */
  status: 'healthy' | 'degraded';
  /** ChromaDB connection status */
  chromadb_status: 'connected' | 'disconnected';
  /** Embeddings service status */
  embeddings_status: 'ready' | 'error';
  /** Vector store status */
  vectorstore_status: 'ready' | 'error';
  /** Application version */
  version: string;
  /** Detailed ChromaDB status message */
  chromadb_message: string;
  /** Detailed embeddings status message */
  embeddings_message: string;
  /** Detailed vector store status message */
  vectorstore_message: string;
  /** ISO 8601 timestamp */
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Config endpoint
// ---------------------------------------------------------------------------

/**
 * Response from `GET /api/config`.
 *
 * This is the *actual* shape returned by the get_config handler.
 */
export interface GetConfigResponse {
  app_name: string;
  app_version: string;
  environment: 'development' | 'production' | 'testing';
  llm_provider: LLMProvider;
  embedding_provider: EmbeddingProvider;
  server: {
    host: string;
    port: number;
  };
  database: {
    url: string;
  };
  chromadb: {
    persist_directory: string;
    collection_name: string;
  };
  rag: {
    top_k: number;
    chunk_size: number;
  };
}

// ---------------------------------------------------------------------------
// Embedding test endpoints
// ---------------------------------------------------------------------------

/**
 * Response from `POST /api/test/embeddings/query`.
 */
export interface EmbedQueryResponse {
  success: boolean;
  text: string;
  embedding_dimension: number;
  /** First few values of the embedding vector */
  embedding_preview: number[];
  message: string;
}

/**
 * Response from `POST /api/test/embeddings/documents`.
 */
export interface EmbedDocumentsResponse {
  success: boolean;
  document_count: number;
  embedding_dimension: number;
  /** First few values of each embedding vector */
  embeddings_preview: number[][];
  message: string;
}

/**
 * Request for `POST /api/test/embeddings/factory`.
 */
export interface CreateEmbeddingsRequest {
  provider?: 'local' | 'openai';
  api_key?: string | null;
  model_name?: string | null;
  test_text?: string;
}

/**
 * Response from `POST /api/test/embeddings/factory`.
 */
export interface CreateEmbeddingsResponse {
  success: boolean;
  provider_requested: string;
  provider_created: string;
  model_name: string;
  embedding_dimension: number;
  is_ready: boolean;
  test_embedding_dimension?: number;
  test_embedding_preview?: number[];
  test_error?: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Vector store test endpoints
// ---------------------------------------------------------------------------

/**
 * Response from `GET /api/test/vectorstore/health`.
 */
export interface VectorStoreHealthResponse {
  success: boolean;
  status: string;
  message: string;
}

/**
 * Request for `POST /api/test/vectorstore/add`.
 */
export interface VectorStoreAddRequest {
  texts: string[];
  metadatas?: Record<string, unknown>[] | null;
}

/**
 * Response from `POST /api/test/vectorstore/add`.
 */
export interface VectorStoreAddResponse {
  success: boolean;
  documents_added: number;
  ids: string[];
  message: string;
}

/**
 * Request for `POST /api/test/vectorstore/search`.
 */
export interface VectorStoreSearchRequest {
  query: string;
  k?: number;
  game?: string | null;
}

/**
 * Response from `POST /api/test/vectorstore/search`.
 */
export interface VectorStoreSearchResponse {
  success: boolean;
  query: string;
  game_filter: string | null;
  results_count: number;
  results: Array<{
    content: string;
    metadata: Record<string, unknown>;
  }>;
  message: string;
}

// ---------------------------------------------------------------------------
// LLM test endpoints
// ---------------------------------------------------------------------------

/**
 * Response from `GET /api/test/llm/health`.
 */
export interface LLMHealthResponse {
  success: boolean;
  status: string;
  message: string;
}

/**
 * Request for `POST /api/test/llm/factory`.
 */
export interface CreateLLMRequest {
  provider?: string;
  api_key?: string | null;
  model_name?: string | null;
  temperature?: number | null;
  max_tokens?: number | null;
  base_url?: string | null;
}

/**
 * Response from `POST /api/test/llm/factory`.
 */
export interface CreateLLMResponse {
  success: boolean;
  provider_requested: string;
  provider_created: string;
  model_name: string;
  is_ready: boolean;
  health: Record<string, unknown>;
  message: string;
}

/**
 * Response from `GET /api/test/llm/providers`.
 */
export interface LLMProvidersResponse {
  success: boolean;
  available_providers: Array<{
    name: string;
    is_default: boolean;
  }>;
  default_provider: string;
  default_model_by_provider: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Scraper test endpoints
// ---------------------------------------------------------------------------

/**
 * Response from `GET /api/test/scraper/health`.
 */
export interface ScraperHealthResponse {
  success: boolean;
  status: string;
  message: string;
  response_time_s?: number;
}

/**
 * Request for `POST /api/test/scraper/fetch` and `/fetch-async`.
 */
export interface ScraperFetchRequest {
  path?: string;
}

/**
 * Response from `POST /api/test/scraper/fetch`.
 */
export interface ScraperFetchResponse {
  success: boolean;
  url: string;
  elapsed_s: number;
  page_title?: string | null;
  html_length?: number;
  error?: string;
  message: string;
}

/**
 * Response from `POST /api/test/scraper/fetch-async`.
 */
export interface ScraperFetchAsyncResponse {
  success: boolean;
  url: string;
  page_title: string | null;
  html_length: number;
  message: string;
  client_config: {
    base_url: string;
    timeout: number;
    max_retries: number;
    rate_limit_delay: number;
    user_agent: string;
  };
}

/**
 * Response from `GET /api/test/scraper/config`.
 */
export interface ScraperConfigResponse {
  success: boolean;
  scraper_config: {
    base_url: string;
    rate_limit_delay: number;
    max_retries: number;
    timeout: number;
    user_agent: string;
    concurrent_requests: number;
  };
  message: string;
}
