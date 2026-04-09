/**
 * Chat types for API request/response contracts.
 * Mirrors backend Pydantic models from backend/src/models/chat.py
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Roles for chat messages. */
export type MessageRole = 'user' | 'assistant' | 'system';

/** Supported Path of Exile game versions. */
export type GameVersion = 'poe1' | 'poe2';

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

/**
 * A single chat message in the conversation.
 *
 * Backend model: ChatMessage (chat.py)
 */
export interface ChatMessage {
  /** Role of the message sender */
  role: MessageRole;
  /** Text content of the message (1 - 10000 chars) */
  content: string;
  /** ISO 8601 timestamp when the message was created */
  timestamp: string;
  /** Optional metadata (e.g., sources, citations) */
  metadata?: Record<string, unknown> | null;
}

/**
 * Request body for the chat endpoint.
 *
 * Backend model: ChatRequest (chat.py)
 */
export interface ChatRequest {
  /** User's message content (1 - 10000 chars) */
  message: string;
  /** Optional conversation ID for maintaining context (max 100 chars) */
  conversation_id?: string | null;
  /** Game version to query */
  game_version?: GameVersion;
  /** Optional build context, e.g. class or ascendancy (max 500 chars) */
  build_context?: string | null;
  /** Whether to stream the response via SSE */
  stream?: boolean;
}

/**
 * Source citation for RAG responses.
 *
 * Backend model: Source (chat.py)
 */
export interface Source {
  /** Retrieved content snippet */
  content: string;
  /** Original source (URL or document name) */
  source: string;
  /** Similarity score between 0 and 1 */
  relevance_score: number;
}

/**
 * Response body from the chat endpoint.
 *
 * Backend model: ChatResponse (chat.py)
 */
export interface ChatResponse {
  /** The assistant's response message */
  message: ChatMessage;
  /** Conversation ID for maintaining context */
  conversation_id: string;
  /** Sources used to generate the response */
  sources: Source[];
  /** Game version that was queried */
  game_version: GameVersion;
  /** ISO 8601 timestamp when the response was generated */
  timestamp: string;
}

/**
 * Conversation history model.
 *
 * Backend model: ConversationHistory (chat.py)
 */
export interface ConversationHistory {
  /** Unique conversation identifier */
  conversation_id: string;
  /** List of messages in the conversation */
  messages: ChatMessage[];
  /** ISO 8601 timestamp when the conversation was created */
  created_at: string;
  /** ISO 8601 timestamp when the conversation was last updated */
  updated_at: string;
  /** Game version for this conversation */
  game_version: GameVersion;
  /** Build context for this conversation */
  build_context?: string | null;
}
