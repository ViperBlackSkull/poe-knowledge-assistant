/**
 * TypeScript type definitions for all API request/response contracts.
 *
 * Types mirror the backend Pydantic models exactly and are organised by domain:
 *
 *   chat.ts      -- Chat messages, requests, responses, conversation history
 *   config.ts    -- Application configuration (LLM, embeddings, RAG, CORS, etc.)
 *   system.ts    -- Health, standard response wrappers, error models, pagination
 *   scraper.ts   -- Data ingestion models (items, categories, scrape jobs)
 *   streaming.ts -- SSE streaming events for real-time chat
 *   endpoints.ts -- Per-endpoint request/response shapes for the live API routes
 *
 * Usage:
 *   import { ChatRequest, ChatResponse } from '@/types';
 *   import type { HealthCheckResponse } from '@/types';
 */

// ---------------------------------------------------------------------------
// Chat types
// ---------------------------------------------------------------------------
export type {
  MessageRole,
  GameVersion,
  ChatMessage,
  ChatRequest,
  Source,
  ChatResponse,
  ConversationHistory,
} from './chat';

// ---------------------------------------------------------------------------
// Configuration types
// ---------------------------------------------------------------------------
export type {
  LLMProvider,
  EmbeddingProvider,
  ServerConfig,
  DatabaseConfig,
  ChromaDBConfig,
  RAGConfig,
  CORSConfig,
  LLMConfigResponse,
  EmbeddingConfigResponse,
  AppConfig,
  ConfigUpdateRequest,
} from './config';

// ---------------------------------------------------------------------------
// System / error / pagination types
// ---------------------------------------------------------------------------
export type {
  HealthStatus,
  APIResponse,
  PaginatedResponse,
  ErrorDetail,
  ValidationError,
  APIError,
  ErrorResponse,
} from './system';

// ---------------------------------------------------------------------------
// Scraper types
// ---------------------------------------------------------------------------
export type {
  Game,
  ItemType,
  ScrapeStatus,
  PoECategory,
  PoEItem,
  ScrapedData,
  ScrapeJob,
  ScrapeRequest,
} from './scraper';

// ---------------------------------------------------------------------------
// Streaming / SSE types
// ---------------------------------------------------------------------------
export type {
  ChatStreamRequest,
  ConversationHistoryEntry,
  SSEEventType,
  SSESourcesEvent,
  SSESource,
  SSETokenEvent,
  SSEDoneEvent,
  SSEErrorEvent,
  SSEPartialCompleteEvent,
  SSEEventData,
  StreamingHealthResponse,
} from './streaming';

// ---------------------------------------------------------------------------
// Endpoint-specific types
// ---------------------------------------------------------------------------
export type {
  RootResponse,
  HealthCheckResponse,
  GetConfigResponse,
  EmbedQueryResponse,
  EmbedDocumentsResponse,
  CreateEmbeddingsRequest,
  CreateEmbeddingsResponse,
  VectorStoreHealthResponse,
  VectorStoreAddRequest,
  VectorStoreAddResponse,
  VectorStoreSearchRequest,
  VectorStoreSearchResponse,
  LLMHealthResponse,
  CreateLLMRequest,
  CreateLLMResponse,
  LLMProvidersResponse,
  ScraperHealthResponse,
  ScraperFetchRequest,
  ScraperFetchResponse,
  ScraperFetchAsyncResponse,
  ScraperConfigResponse,
} from './endpoints';
