import { useState, useRef, useCallback, useEffect, type KeyboardEvent, type FormEvent } from 'react';
import type { ChatMessage, GameVersion } from '@/types/chat';
import type { ChatStreamRequest, SSESource } from '@/types/streaming';
import { streamChat as streamChatApi, sendChat as sendChatApi } from '@/lib/api-client';
import { classifyError } from '@/hooks/useErrorHandling';
import { TypingIndicator } from './TypingIndicator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Props for the ChatInput component.
 */
export interface ChatInputProps {
  /** Callback invoked when a new user message is sent */
  onSendMessage: (message: ChatMessage) => void;
  /** Callback invoked as streaming tokens arrive (for updating assistant message) */
  onStreamingToken?: (token: string) => void;
  /** Callback invoked when the streaming response completes */
  onStreamingDone?: (conversationId: string) => void;
  /** Callback invoked when sources are received from the streaming response */
  onSources?: (sources: SSESource[]) => void;
  /** Callback invoked when an error occurs during the chat request */
  onError?: (error: string) => void;
  /** Whether the input is currently disabled (e.g. during streaming) */
  disabled?: boolean;
  /** Current conversation ID (maintained across messages) */
  conversationId?: string;
  /** Game version to use for queries */
  gameVersion?: GameVersion;
  /** Optional build context */
  buildContext?: string;
  /** Whether to use streaming (default: true) */
  useStreaming?: boolean;
  /** Maximum character limit for input */
  maxCharLimit?: number;
  /** Placeholder text for the input */
  placeholder?: string;
  /** Optional additional CSS class names */
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_CHAR_LIMIT = 10000;
const DEFAULT_PLACEHOLDER = 'Ask about items, builds, mechanics...';
const MIN_ROWS = 1;
const MAX_ROWS = 6;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * ChatInput provides a text input area for sending chat messages.
 *
 * Features:
 *  - Auto-growing textarea with character limit validation
 *  - Send button with icon and disabled state
 *  - Form submission with Enter key (Shift+Enter for newline)
 *  - Streaming response support via SSE
 *  - Typing indicator while waiting for response
 *  - Error message display for failed requests
 *  - Full keyboard accessibility
 */
export function ChatInput({
  onSendMessage,
  onStreamingToken,
  onStreamingDone,
  onSources,
  onError,
  disabled = false,
  conversationId,
  gameVersion = 'poe2',
  buildContext,
  useStreaming = true,
  maxCharLimit = DEFAULT_MAX_CHAR_LIMIT,
  placeholder = DEFAULT_PLACEHOLDER,
  className = '',
}: ChatInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [charCount, setCharCount] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ---------------------------------------------------------------------------
  // Auto-resize textarea
  // ---------------------------------------------------------------------------

  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to shrink when content is removed
    textarea.style.height = 'auto';

    // Calculate new height based on scrollHeight, clamped to max
    const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 24;
    const maxHeight = lineHeight * MAX_ROWS;
    const newHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${newHeight}px`;
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [inputValue, adjustTextareaHeight]);

  // ---------------------------------------------------------------------------
  // Input change handler
  // ---------------------------------------------------------------------------

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      const count = value.length;

      if (count > maxCharLimit) {
        return; // Don't allow input beyond the limit
      }

      setInputValue(value);
      setCharCount(count);
      // Clear error when user starts typing
      if (error) setError(null);
    },
    [maxCharLimit, error],
  );

  // ---------------------------------------------------------------------------
  // Streaming request handler
  // ---------------------------------------------------------------------------

  const handleStreamingRequest = useCallback(
    async (message: string) => {
      abortControllerRef.current = new AbortController();

      const request: ChatStreamRequest = {
        message,
        game_version: gameVersion,
        build_context: buildContext,
        conversation_id: conversationId,
      };

      console.log('[ChatInput] Streaming request:', {
        message: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
        game_version: gameVersion,
        build_context: buildContext || '(none)',
        conversation_id: conversationId || '(new)',
      });

      await streamChatApi(
        request,
        {
          onToken: (event) => {
            onStreamingToken?.(event.token);
          },
          onSources: (event) => {
            // Sources received, propagate to parent
            onSources?.(event.sources);
          },
          onDone: (event) => {
            onStreamingDone?.(event.conversation_id);
          },
          onError: (event) => {
            const errorMessage = event.error || 'An error occurred during streaming.';
            setError(errorMessage);
            onError?.(errorMessage);
          },
          onPartialComplete: (event) => {
            // Stream was interrupted but partial content is available
            if (event.partial_response) {
              onStreamingToken?.(event.partial_response);
            }
          },
        },
        abortControllerRef.current.signal,
      );
    },
    [gameVersion, buildContext, conversationId, onStreamingToken, onStreamingDone, onError],
  );

  // ---------------------------------------------------------------------------
  // Non-streaming request handler
  // ---------------------------------------------------------------------------

  const handleNonStreamingRequest = useCallback(
    async (message: string) => {
      console.log('[ChatInput] Non-streaming request:', {
        message: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
        game_version: gameVersion,
        build_context: buildContext || '(none)',
        conversation_id: conversationId || '(new)',
      });

      const response = await sendChatApi({
        message,
        game_version: gameVersion,
        build_context: buildContext,
        conversation_id: conversationId,
        stream: false,
      });

      // Create assistant message from response
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.message.content,
        timestamp: response.message.timestamp,
        metadata: response.sources.length > 0 ? { sources: response.sources } : null,
      };

      // Stream the whole response at once via the token callback
      onStreamingToken?.(assistantMessage.content);
      onStreamingDone?.(response.conversation_id);
    },
    [gameVersion, buildContext, conversationId, onStreamingToken, onStreamingDone],
  );

  // ---------------------------------------------------------------------------
  // Send message
  // ---------------------------------------------------------------------------

  const handleSend = useCallback(
    async (messageText: string) => {
      const trimmed = messageText.trim();
      if (!trimmed || isLoading || disabled) return;

      // Character limit validation
      if (trimmed.length > maxCharLimit) {
        setError(`Message exceeds the ${maxCharLimit.toLocaleString()} character limit.`);
        return;
      }

      if (trimmed.length < 1) {
        setError('Message cannot be empty.');
        return;
      }

      // Create user message
      const userMessage: ChatMessage = {
        role: 'user',
        content: trimmed,
        timestamp: new Date().toISOString(),
      };

      // Notify parent of user message
      onSendMessage(userMessage);

      // Clear input
      setInputValue('');
      setCharCount(0);
      setError(null);
      setIsLoading(true);

      try {
        if (useStreaming) {
          await handleStreamingRequest(trimmed);
        } else {
          await handleNonStreamingRequest(trimmed);
        }
      } catch (err) {
        // Classify the error for a better user message
        const classified = classifyError(err);
        let errorMessage = classified.message;

        // Add specific guidance based on error category
        if (classified.category === 'network') {
          errorMessage = 'Unable to reach the server. Please check your connection and try again.';
        } else if (classified.category === 'authentication') {
          errorMessage = 'Authentication failed. Please check your API key in Settings.';
        } else if (classified.category === 'streaming') {
          errorMessage = 'The response was interrupted. Please try sending your message again.';
        } else if (classified.category === 'api' && (classified.statusCode ?? 0) >= 500) {
          errorMessage = 'The server encountered an error. Please try again in a moment.';
        }

        setError(errorMessage);
        onError?.(errorMessage);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, disabled, maxCharLimit, onSendMessage, onError, useStreaming, handleStreamingRequest, handleNonStreamingRequest],
  );

  // ---------------------------------------------------------------------------
  // Form submission
  // ---------------------------------------------------------------------------

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      handleSend(inputValue);
    },
    [handleSend, inputValue],
  );

  // ---------------------------------------------------------------------------
  // Keyboard handler
  // ---------------------------------------------------------------------------

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter to send, Shift+Enter for newline
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend(inputValue);
      }
    },
    [handleSend, inputValue],
  );

  // ---------------------------------------------------------------------------
  // Cancel ongoing request
  // ---------------------------------------------------------------------------

  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Character limit display
  // ---------------------------------------------------------------------------

  const charCountColor =
    charCount > maxCharLimit * 0.9
      ? 'text-red-400'
      : charCount > maxCharLimit * 0.7
        ? 'text-yellow-400'
        : 'text-poe-text-muted';

  const isSendDisabled = !inputValue.trim() || isLoading || disabled || charCount > maxCharLimit;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      className={`border-t border-[#2A2A30] bg-[#121215] px-6 py-4 sm:px-12 relative transition-all duration-300 ${isLoading ? 'border-[#6B5530]/30' : ''} ${className}`}
      data-testid="chat-input-container"
    >
      {/* Loading overlay bar at top with enhanced animation */}
      {isLoading && (
        <div
          className="absolute top-0 left-0 right-0 h-0.5 overflow-hidden animate-poe-fade-in"
          data-testid="chat-input-loading-bar"
        >
          <div className="h-full bg-gradient-to-r from-transparent via-poe-gold to-transparent animate-[loading-progress_1.5s_ease-in-out_infinite]" />
        </div>
      )}
      <div className="max-w-3xl mx-auto">
        {/* Error message display */}
        {error && (
          <div
            className="mb-3 px-4 py-2 bg-red-900/20 border border-red-500/30 rounded-lg text-red-300 text-sm flex items-center gap-2 animate-poe-fade-in-up"
            role="alert"
            data-testid="chat-error-message"
          >
            <svg
              className="w-4 h-4 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={() => {
                setError(null);
                // Refocus the textarea so the user can retry
                textareaRef.current?.focus();
              }}
              className="text-red-400 hover:text-red-300"
              aria-label="Dismiss error"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Typing indicator */}
        <TypingIndicator
          isVisible={isLoading}
          label="Assistant is thinking..."
          variant="dots"
          size="sm"
          display="inline"
          className="mb-3"
        />

        {/* Input form */}
        <form
          onSubmit={handleSubmit}
          className="flex gap-3 items-end"
          data-testid="chat-input-form"
        >
          {/* Textarea */}
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              rows={MIN_ROWS}
              disabled={disabled || isLoading}
              className={`poe-input w-full resize-none text-sm sm:text-sm pr-10 py-2.5 sm:py-2 ${
                disabled || isLoading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              aria-label="Chat message input"
              data-testid="chat-input-textarea"
            />
            {/* Character count */}
            {charCount > 0 && (
              <span
                className={`absolute bottom-1.5 right-2 text-xs ${charCountColor}`}
                data-testid="char-count"
              >
                {charCount.toLocaleString()}/{maxCharLimit.toLocaleString()}
              </span>
            )}
          </div>

          {/* Send / Cancel button */}
          {isLoading ? (
            <button
              type="button"
              onClick={handleCancel}
              className="poe-button shrink-0 flex items-center gap-2 bg-red-700 hover:bg-red-600 border-red-500 min-h-[40px] min-w-[40px] sm:min-w-0 touch-manipulation"
              aria-label="Cancel request"
              data-testid="chat-cancel-button"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span className="hidden sm:inline">Cancel</span>
            </button>
          ) : (
            <button
              type="submit"
              disabled={isSendDisabled}
              className={`poe-button shrink-0 flex items-center gap-2 min-h-[40px] min-w-[40px] sm:min-w-0 touch-manipulation ${
                isSendDisabled
                  ? 'opacity-40 cursor-not-allowed'
                  : 'hover:scale-[1.02] active:scale-[0.98]'
              } transition-transform`}
              aria-label="Send message"
              data-testid="chat-send-button"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                />
              </svg>
              <span className="hidden sm:inline">Send</span>
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
