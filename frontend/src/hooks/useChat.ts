import { useState, useCallback, useRef } from 'react';
import type { ChatMessage, GameVersion, ConversationHistory } from '@/types/chat';
import type { SSESource } from '@/types/streaming';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Loading states for the chat interface.
 * - 'idle' -- no request in progress
 * - 'sending' -- user message sent, waiting for server response
 * - 'receiving' -- server is streaming tokens back
 */
export type ChatLoadingState = 'idle' | 'sending' | 'receiving';

/**
 * A single recorded error in the chat conversation.
 */
export interface ChatError {
  /** Unique identifier for this error */
  id: string;
  /** Human-readable error message */
  message: string;
  /** ISO 8601 timestamp when the error occurred */
  timestamp: string;
  /** Machine-readable error category (if available) */
  type?: string;
}

/**
 * Options accepted by the useChat hook.
 */
export interface UseChatOptions {
  /** Game version to use for queries (default: 'poe2') */
  gameVersion?: GameVersion;
  /** Optional build context string */
  buildContext?: string;
  /** Maximum number of messages to keep in history (0 = unlimited, default: 0) */
  maxHistoryLength?: number;
  /** Callback invoked when a new conversation is started */
  onConversationStart?: (conversationId: string) => void;
  /** Callback invoked when the conversation is cleared */
  onConversationClear?: () => void;
}

/**
 * State and callbacks returned by the useChat hook.
 */
export interface UseChatReturn {
  // -- Message state --
  /** Array of all chat messages in the current conversation */
  messages: ChatMessage[];
  /** Number of messages in the conversation */
  messageCount: number;
  /** Current conversation ID (undefined if no conversation started) */
  conversationId: string | undefined;
  /** Whether the conversation has started (at least one message sent) */
  hasConversation: boolean;

  // -- Loading state --
  /** Current loading state */
  loadingState: ChatLoadingState;
  /** Whether a request is currently in progress */
  isLoading: boolean;
  /** Whether the assistant is currently streaming a response */
  isStreaming: boolean;

  // -- Error state --
  /** Current error, if any */
  error: ChatError | null;
  /** All errors that occurred during the conversation */
  errors: ChatError[];

  // -- Game version --
  /** Currently selected game version */
  gameVersion: GameVersion;
  /** Change the game version (clears the conversation) */
  setGameVersion: (version: GameVersion) => void;

  // -- Message actions --
  /** Add a user message to the conversation and prepare an assistant placeholder */
  addUserMessage: (content: string) => ChatMessage;
  /** Append streaming token content to the last assistant message */
  appendStreamingToken: (token: string) => void;
  /** Complete the streaming response with the conversation ID */
  completeStreaming: (conversationId: string) => void;
  /** Attach sources metadata to the last assistant message */
  attachSources: (sources: SSESource[]) => void;
  /** Handle an error that occurred during the chat request */
  handleError: (errorMessage: string, errorType?: string) => void;
  /** Clear the entire conversation and reset all state */
  clearConversation: () => void;
  /** Remove a specific message by index */
  removeMessage: (index: number) => void;
  /** Update an existing message by index */
  updateMessage: (index: number, updater: (msg: ChatMessage) => ChatMessage) => void;

  // -- Context --
  /** Build context string */
  buildContext: string | undefined;
  /** Update the build context */
  setBuildContext: (context: string | undefined) => void;

  // -- History helpers --
  /** Export the current messages as a ConversationHistory-compatible shape */
  getConversationHistory: () => ConversationHistory;
  /** Load a previous conversation from history */
  loadConversation: (history: ConversationHistory) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a unique error ID. */
function generateErrorId(): string {
  return `err_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/** Create a ChatMessage with current timestamp. */
function createMessage(role: ChatMessage['role'], content: string, metadata?: Record<string, unknown> | null): ChatMessage {
  return {
    role,
    content,
    timestamp: new Date().toISOString(),
    metadata: metadata ?? null,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Centralized state management hook for the chat interface.
 *
 * Manages:
 *  - Chat messages array (add, remove, update)
 *  - Loading states (idle, sending, receiving)
 *  - Error states and error history
 *  - Conversation ID tracking
 *  - Streaming response buffer
 *  - Game version and build context
 *  - Conversation history export/import
 *
 * @param options - Configuration options for the hook
 * @returns Full chat state and action callbacks
 *
 * @example
 * ```tsx
 * const chat = useChat({ gameVersion: 'poe2' });
 *
 * // In ChatInput:
 * const userMsg = chat.addUserMessage(inputText);
 * // After streaming completes:
 * chat.completeStreaming(convId);
 *
 * // In ChatMessageList:
 * <ChatMessageList messages={chat.messages} isStreaming={chat.isStreaming} />
 * ```
 */
export function useChat(options: UseChatOptions = {}): UseChatReturn {
  const {
    gameVersion: initialGameVersion = 'poe2',
    buildContext: initialBuildContext,
    maxHistoryLength = 0,
    onConversationStart,
    onConversationClear,
  } = options;

  // -- Core state --
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [loadingState, setLoadingState] = useState<ChatLoadingState>('idle');
  const [error, setError] = useState<ChatError | null>(null);
  const [errors, setErrors] = useState<ChatError[]>([]);
  const [gameVersion, setGameVersionState] = useState<GameVersion>(initialGameVersion);
  const [buildContext, setBuildContextState] = useState<string | undefined>(initialBuildContext);

  // -- Refs --
  const streamingBufferRef = useRef<string>('');
  const maxHistoryRef = useRef(maxHistoryLength);
  maxHistoryRef.current = maxHistoryLength;
  const onConversationStartRef = useRef(onConversationStart);
  onConversationStartRef.current = onConversationStart;
  const onConversationClearRef = useRef(onConversationClear);
  onConversationClearRef.current = onConversationClear;

  // -- Derived state --
  const messageCount = messages.length;
  const hasConversation = conversationId !== undefined;
  const isLoading = loadingState === 'sending' || loadingState === 'receiving';
  const isStreaming = loadingState === 'receiving';

  // ---------------------------------------------------------------------------
  // Game version
  // ---------------------------------------------------------------------------

  const setGameVersion = useCallback((version: GameVersion) => {
    setGameVersionState(version);
    // Clear conversation when changing game version for a fresh context
    setMessages([]);
    setConversationId(undefined);
    streamingBufferRef.current = '';
    setLoadingState('idle');
    setError(null);
    onConversationClearRef.current?.();
  }, []);

  // ---------------------------------------------------------------------------
  // Build context
  // ---------------------------------------------------------------------------

  const setBuildContext = useCallback((context: string | undefined) => {
    setBuildContextState(context);
  }, []);

  // ---------------------------------------------------------------------------
  // Message actions
  // ---------------------------------------------------------------------------

  /**
   * Add a user message to the conversation and create a placeholder
   * assistant message for the streaming response.
   */
  const addUserMessage = useCallback((content: string): ChatMessage => {
    const userMessage = createMessage('user', content);
    const assistantPlaceholder = createMessage('assistant', '');

    setMessages((prev) => {
      const next = [...prev, userMessage, assistantPlaceholder];
      // Trim history if maxHistoryLength is set
      if (maxHistoryRef.current > 0 && next.length > maxHistoryRef.current) {
        return next.slice(next.length - maxHistoryRef.current);
      }
      return next;
    });

    setLoadingState('sending');
    streamingBufferRef.current = '';

    return userMessage;
  }, []);

  /**
   * Append streaming token content to the last assistant message.
   */
  const appendStreamingToken = useCallback((token: string) => {
    streamingBufferRef.current += token;
    const currentContent = streamingBufferRef.current;

    setMessages((prev) => {
      const updated = [...prev];
      if (updated.length > 0 && updated[updated.length - 1].role === 'assistant') {
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          content: currentContent,
        };
      }
      return updated;
    });

    // Transition to 'receiving' state if still in 'sending'
    setLoadingState((prev) => prev === 'sending' ? 'receiving' : prev);
  }, []);

  /**
   * Complete the streaming response with the conversation ID.
   */
  const completeStreaming = useCallback((convId: string) => {
    // Only set conversation ID if this is a new conversation
    setConversationId((prev) => {
      const newId = prev ?? convId;
      if (!prev) {
        onConversationStartRef.current?.(newId);
      }
      return newId;
    });
    setLoadingState('idle');
  }, []);

  /**
   * Attach sources metadata to the last assistant message.
   */
  const attachSources = useCallback((sources: SSESource[]) => {
    setMessages((prev) => {
      const updated = [...prev];
      if (updated.length > 0 && updated[updated.length - 1].role === 'assistant') {
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          metadata: { sources },
        };
      }
      return updated;
    });
  }, []);

  /**
   * Handle an error that occurred during the chat request.
   * Removes empty assistant placeholders and adds a system error message.
   */
  const handleError = useCallback((errorMessage: string, errorType?: string) => {
    setLoadingState('idle');

    const chatError: ChatError = {
      id: generateErrorId(),
      message: errorMessage,
      timestamp: new Date().toISOString(),
      type: errorType,
    };

    setError(chatError);
    setErrors((prev) => [...prev, chatError]);

    // Remove empty assistant placeholder if present
    setMessages((prev) => {
      const updated = [...prev];
      if (
        updated.length > 0 &&
        updated[updated.length - 1].role === 'assistant' &&
        updated[updated.length - 1].content === ''
      ) {
        updated.pop();
      }
      return updated;
    });

    // Add a system message with the error
    const systemMessage = createMessage('system', `Error: ${errorMessage}`);
    setMessages((prev) => [...prev, systemMessage]);
  }, []);

  /**
   * Clear the entire conversation and reset all state.
   */
  const clearConversation = useCallback(() => {
    setMessages([]);
    setConversationId(undefined);
    streamingBufferRef.current = '';
    setLoadingState('idle');
    setError(null);
    onConversationClearRef.current?.();
  }, []);

  /**
   * Remove a specific message by index.
   */
  const removeMessage = useCallback((index: number) => {
    setMessages((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  /**
   * Update an existing message by index.
   */
  const updateMessage = useCallback((index: number, updater: (msg: ChatMessage) => ChatMessage) => {
    setMessages((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      const updated = [...prev];
      updated[index] = updater(updated[index]);
      return updated;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // History helpers
  // ---------------------------------------------------------------------------

  /**
   * Export the current messages as a ConversationHistory-compatible shape.
   */
  const getConversationHistory = useCallback((): ConversationHistory => {
    return {
      conversation_id: conversationId ?? '',
      messages: [...messages],
      created_at: messages.length > 0 ? messages[0].timestamp : new Date().toISOString(),
      updated_at: messages.length > 0 ? messages[messages.length - 1].timestamp : new Date().toISOString(),
      game_version: gameVersion,
      build_context: buildContext ?? null,
    };
  }, [messages, conversationId, gameVersion, buildContext]);

  /**
   * Load a previous conversation from history.
   */
  const loadConversation = useCallback((history: ConversationHistory) => {
    setMessages(history.messages);
    setConversationId(history.conversation_id);
    setLoadingState('idle');
    setError(null);
    streamingBufferRef.current = '';
    if (history.game_version) {
      setGameVersionState(history.game_version);
    }
    if (history.build_context !== undefined) {
      setBuildContextState(history.build_context ?? undefined);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    // Message state
    messages,
    messageCount,
    conversationId,
    hasConversation,

    // Loading state
    loadingState,
    isLoading,
    isStreaming,

    // Error state
    error,
    errors,

    // Game version
    gameVersion,
    setGameVersion,

    // Message actions
    addUserMessage,
    appendStreamingToken,
    completeStreaming,
    attachSources,
    handleError,
    clearConversation,
    removeMessage,
    updateMessage,

    // Context
    buildContext,
    setBuildContext,

    // History helpers
    getConversationHistory,
    loadConversation,
  };
}
