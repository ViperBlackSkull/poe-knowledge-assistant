import type { ChatMessage, MessageRole } from '@/types/chat';
import { MarkdownRenderer } from '../common/MarkdownRenderer';
import { CitationList } from './CitationList';
import { extractCitationsFromMetadata } from '@/utils/citation';

/**
 * Props for the ChatMessageBubble component.
 */
export interface ChatMessageBubbleProps {
  /** The chat message to display */
  message: ChatMessage;
  /** Optional conversation ID to display */
  conversationId?: string;
}

/**
 * Get avatar symbol based on message role.
 */
function getAvatarSymbol(role: MessageRole): string {
  switch (role) {
    case 'user': return '◆';
    case 'assistant': return '♦';
    case 'system': return '●';
    default: return '?';
  }
}

/**
 * Format an ISO 8601 timestamp for display.
 */
function formatTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return timestamp;
  }
}

/**
 * ChatMessageBubble renders a single chat message with PoE website styling.
 *
 * - User messages: gold avatar, gold name, message body with light font-weight
 * - Assistant messages: teal avatar, teal name, markdown rendered body
 * - System messages: centered, gem-colored accent
 */
export function ChatMessageBubble({
  message,
  conversationId,
}: ChatMessageBubbleProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  // System messages — centered
  if (isSystem) {
    return (
      <div className="flex justify-center my-3" data-message-role="system">
        <div className="bg-poe-bg-tertiary border border-poe-teal/20 rounded px-4 py-2 max-w-[85%]">
          <p className="text-poe-teal text-xs text-center italic">
            {message.content}
          </p>
          <div className="flex justify-center gap-3 mt-1">
            <span className="text-poe-text-muted text-[11px]">
              {formatTimestamp(message.timestamp)}
            </span>
            {conversationId && (
              <span className="text-poe-text-muted text-[11px]">
                ID: {conversationId.slice(0, 8)}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="py-4 border-b border-poe-border/50 animate-poe-message"
      data-message-role={message.role}
    >
      {/* Message header: avatar + name + timestamp */}
      <div className="flex items-center gap-2.5 mb-2">
        <div
          className={`w-7 h-7 border rounded-[3px] flex items-center justify-center text-xs shrink-0 ${
            isUser
              ? 'border-poe-gold-muted text-poe-gold-light bg-poe-gold/6'
              : 'border-poe-teal/25 text-poe-teal bg-poe-teal/6'
          }`}
          aria-label={`${message.role} avatar`}
        >
          {getAvatarSymbol(message.role)}
        </div>
        <span
          className={`text-xs font-semibold tracking-[0.5px] uppercase ${
            isUser ? 'text-poe-gold-light' : 'text-poe-teal'
          }`}
        >
          {isUser ? 'Exile' : 'Knowledge Assistant'}
        </span>
        <span className="text-poe-text-muted text-[11px] ml-auto">
          {formatTimestamp(message.timestamp)}
        </span>
      </div>

      {/* Message body — indented past avatar */}
      <div className="pl-[38px] text-sm leading-[1.7] text-poe-text-primary font-normal">
        {isUser ? (
          <p>{message.content}</p>
        ) : (
          <MarkdownRenderer content={message.content} variant="chat" showCodeCopyButton />
        )}

        {/* Citations (assistant messages only) */}
        {!isUser && message.metadata && (
          <CitationList
            citations={extractCitationsFromMetadata(message.metadata)}
            format="compact"
            className="mt-3"
          />
        )}
      </div>

      {/* Metadata footer */}
      {conversationId && (
        <div className="pl-[38px] mt-2">
          <span className="text-poe-text-muted text-[11px]">
            Conversation: {conversationId.slice(0, 8)}...
          </span>
        </div>
      )}
    </div>
  );
}
