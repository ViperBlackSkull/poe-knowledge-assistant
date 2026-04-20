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
  /** Callback when a welcome screen suggestion is clicked */
  onSuggestionClick?: (text: string) => void;
}

/**
 * Welcome banner shown when there are no messages yet.
 * Features PoE-themed floating animation and staggered reveal.
 */
function WelcomeBanner({ onSuggestionClick }: { onSuggestionClick?: (text: string) => void }) {
  const suggestions = [
    'What are the best starter builds?',
    'How does crafting work?',
    'Explain the passive tree',
  ];

  return (
    <div className="text-center py-12 px-6 animate-poe-fade-in-up" data-testid="welcome-banner">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-full border-[1.5px] border-[#4A3A28] mb-5 bg-[#AF6025]/[0.04] animate-poe-float">
        <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="#D4A85A">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
        </svg>
      </div>
      <h2 className="font-[Cinzel,Georgia,serif] text-[22px] font-semibold text-[#D4A85A] tracking-[2px] mb-2 animate-poe-fade-in-up poe-stagger-1">
        Welcome, Exile
      </h2>
      <p className="text-[#9F9FA8] text-sm font-light animate-poe-fade-in-up poe-stagger-2">
        Ask me anything about Path of Exile
      </p>
      <div className="mt-7 flex justify-center gap-2.5 flex-wrap animate-poe-fade-in-up poe-stagger-3">
        {suggestions.map((text) => (
          <button
            key={text}
            type="button"
            onClick={() => onSuggestionClick?.(text)}
            className="px-4 py-[7px] rounded-[3px] text-xs text-[#8888FF] border border-[#4A3A28]/20 select-none transition-all duration-200 hover:border-[#8888FF]/35 hover:bg-[#8888FF]/[0.04] active:scale-[0.98] cursor-pointer"
          >
            &ldquo;{text}&rdquo;
          </button>
        ))}
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
  onSuggestionClick,
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
      className={`flex-1 overflow-y-auto px-6 py-8 sm:px-12 ${className}`}
      data-testid="chat-message-list"
      role="log"
      aria-label="Chat messages"
      aria-live="polite"
    >
      <div className="max-w-3xl mx-auto">
        {messages.length === 0 && !isLoading ? (
          <WelcomeBanner onSuggestionClick={onSuggestionClick} />
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
