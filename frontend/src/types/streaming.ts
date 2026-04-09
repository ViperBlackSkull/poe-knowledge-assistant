/**
 * Streaming types for Server-Sent Events (SSE) chat responses.
 * Mirrors the SSE event payloads produced by backend/src/services/streaming.py
 * and the ChatStreamRequest model from backend/src/main.py
 */

import type { GameVersion } from './chat';

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

/**
 * Request body for the streaming chat endpoint.
 *
 * Backend model: ChatStreamRequest (main.py)
 */
export interface ChatStreamRequest {
  /** User's message content (1 - 10000 chars) */
  message: string;
  /** Game version to query ('poe1' or 'poe2') */
  game_version?: GameVersion;
  /** Optional build context, e.g. class or ascendancy (max 500 chars) */
  build_context?: string | null;
  /** Optional conversation ID for maintaining context (max 100 chars) */
  conversation_id?: string | null;
  /** Optional list of previous messages with 'role' and 'content' keys */
  conversation_history?: ConversationHistoryEntry[] | null;
}

/**
 * A single entry in the conversation history sent with a stream request.
 */
export interface ConversationHistoryEntry {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// ---------------------------------------------------------------------------
// SSE Event Types
// ---------------------------------------------------------------------------

/** Discriminator for SSE event types. */
export type SSEEventType = 'sources' | 'token' | 'done' | 'error' | 'partial_complete';

// ---------------------------------------------------------------------------
// SSE Event Payloads
// ---------------------------------------------------------------------------

/**
 * Sources event -- sent first, contains retrieved source citations.
 *
 * SSE event: sources
 */
export interface SSESourcesEvent {
  /** Retrieved source citations */
  sources: SSESource[];
  /** Conversation identifier */
  conversation_id: string;
  /** Number of documents retrieved */
  document_count: number;
}

/**
 * A single source citation delivered via SSE.
 */
export interface SSESource {
  /** Content snippet (truncated to ~200 chars) */
  content: string;
  /** Source URL or document name */
  source: string;
  /** Similarity score between 0 and 1 */
  relevance_score: number;
}

/**
 * Token event -- sent for each chunk/token of the LLM response.
 *
 * SSE event: token
 */
export interface SSETokenEvent {
  /** The text chunk / token */
  token: string;
  /** 1-based index of this chunk in the stream */
  chunk_index: number;
}

/**
 * Done event -- sent when the full response is complete.
 *
 * SSE event: done
 */
export interface SSEDoneEvent {
  /** Conversation identifier */
  conversation_id: string;
  /** Game version that was queried */
  game: string;
  /** Total number of chunks streamed */
  total_chunks: number;
  /** ISO 8601 timestamp */
  timestamp: string;
}

/**
 * Error event -- sent if an error occurs at any stage.
 *
 * SSE event: error
 */
export interface SSEErrorEvent {
  /** Human-readable error message */
  error: string;
  /** Machine-readable error category */
  error_type:
    | 'llm_not_ready'
    | 'client_not_initialized'
    | 'stream_interrupted'
    | 'rag_error'
    | 'llm_error'
    | 'unexpected_error';
  /** Conversation identifier (when available) */
  conversation_id?: string;
}

/**
 * Partial complete event -- sent when the stream is interrupted
 * after some content has already been generated.
 *
 * SSE event: partial_complete
 */
export interface SSEPartialCompleteEvent {
  /** Human-readable message */
  message: string;
  /** The partial response text accumulated so far */
  partial_response: string;
}

// ---------------------------------------------------------------------------
// Union type for any SSE event data
// ---------------------------------------------------------------------------

/**
 * Union of all SSE event data payloads.
 * Use the `event` field (from the raw SSE) to discriminate.
 */
export type SSEEventData =
  | SSESourcesEvent
  | SSETokenEvent
  | SSEDoneEvent
  | SSEErrorEvent
  | SSEPartialCompleteEvent;

// ---------------------------------------------------------------------------
// Streaming health check
// ---------------------------------------------------------------------------

/**
 * Streaming service health check response.
 */
export interface StreamingHealthResponse {
  /** Overall status ("ready" or "error") */
  status: 'ready' | 'error';
  /** Human-readable status message */
  message: string;
  /** Status of individual dependencies */
  dependencies: Record<string, string>;
}
