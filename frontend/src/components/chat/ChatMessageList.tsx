import { useEffect, useRef, useCallback } from 'react';
import type { ChatMessage } from '@/types/chat';
import { ChatMessageBubble } from './ChatMessageBubble';
import { TypingIndicator } from './TypingIndicator';

/**
 * Props for the ChatMessageList component.
 */
export interface ChatMessageListProps {
  /** Array of chat messages to display */
  messages: ChatMessage[];
  /** Optional conversation ID to show in message metadata */
  conversationId?: string;
  /** Optional additional CSS class names */
  className?: string;
  /** Whether to automatically scroll to the bottom when new messages arrive */
  autoScroll?: boolean;
  /** Whether the assistant is currently generating a response */
  isStreaming?: boolean;
  /** Whether a request is currently in progress (sending or receiving) */
  isLoading?: boolean;
}

/**
 * Welcome banner shown when there are no messages yet.
 * Features PoE-themed floating animation and staggered reveal.
 */
function WelcomeBanner() {
  return (
    <div className="text-center py-8 animate-poe-fade-in-up" data-testid="welcome-banner">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-poe-bg-tertiary border border-poe-gold/30 mb-4 animate-poe-float animate-poe-ambient-pulse shadow-[0_0_16px_rgba(175,96,37,0.15)]">
        <span className="text-2xl text-poe-gold">?</span>
      </div>
      <h2 className="poe-header text-xl mb-2 animate-poe-fade-in-up poe-stagger-1">
        Welcome, Exile
      </h2>
      <p className="text-poe-text-secondary text-sm animate-poe-fade-in-up poe-stagger-2">
        Ask me anything about Path of Exile - items, builds, mechanics, and more.
      </p>
      <div className="mt-6 flex justify-center gap-4 animate-poe-fade-in-up poe-stagger-3">
        <span className="px-3 py-1.5 rounded text-xs text-poe-text-muted bg-poe-bg-tertiary border border-poe-border/50 transition-colors duration-200 hover:border-poe-gold/30 hover:text-poe-text-secondary">
          "What are the best starter builds?"
        </span>
        <span className="px-3 py-1.5 rounded text-xs text-poe-text-muted bg-poe-bg-tertiary border border-poe-border/50 transition-colors duration-200 hover:border-poe-gold/30 hover:text-poe-text-secondary">
          "How does crafting work?"
        </span>
      </div>
    </div>
  );
}

/**
 * ChatMessageList renders a scrollable list of chat messages.
 *
 * Features:
 *  - Scrollable container that auto-scrolls to the latest message
 *  - Welcome banner when no messages are present
 *  - Different styling per message role (user/assistant/system)
 *  - Markdown rendering for assistant responses
 *  - Message metadata (timestamp, conversation ID)
 */
export function ChatMessageList({
  messages,
  conversationId,
  className = '',
  autoScroll = true,
  isStreaming = false,
  isLoading = false,
}: ChatMessageListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const previousMessageCountRef = useRef(messages.length);

  /**
   * Scroll to the bottom of the message list.
   */
  const scrollToBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, []);

  // Auto-scroll when new messages are added or loading state changes
  useEffect(() => {
    if (autoScroll && (messages.length > previousMessageCountRef.current || isStreaming || isLoading)) {
      scrollToBottom();
    }
    previousMessageCountRef.current = messages.length;
  }, [messages.length, autoScroll, scrollToBottom, isStreaming, isLoading]);

  // Scroll to bottom on initial mount if there are existing messages
  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={scrollContainerRef}
      className={`flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-6 lg:px-8 ${className}`}
      data-testid="chat-message-list"
      role="log"
      aria-label="Chat messages"
      aria-live="polite"
    >
      <div className="max-w-3xl mx-auto">
        {messages.length === 0 && !isLoading ? (
          <WelcomeBanner />
        ) : (
          <>
            {messages.map((message, index) => (
              <div
                key={`${message.timestamp}-${index}`}
                className="animate-poe-message"
                style={{ animationDelay: `${Math.min(index * 30, 150)}ms`, animationFillMode: 'both' }}
              >
                <ChatMessageBubble
                  message={message}
                  conversationId={conversationId}
                />
              </div>
            ))}
            {/* Typing indicator shown when streaming (receiving tokens) */}
            <TypingIndicator
              isVisible={isStreaming}
              label="Assistant is thinking..."
              variant="dots"
              size="md"
              display="bubble"
            />
            {/* Sending indicator shown when isLoading but not yet streaming */}
            <TypingIndicator
              isVisible={isLoading && !isStreaming}
              label="Sending..."
              variant="wave"
              size="md"
              display="bubble"
              ariaLabel="Sending message"
            />
          </>
        )}
      </div>
    </div>
  );
}
