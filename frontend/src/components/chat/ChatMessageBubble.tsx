import type { ChatMessage, MessageRole } from '@/types/chat';
import { MarkdownRenderer } from './MarkdownRenderer';

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
 * Get display initials for the avatar based on message role.
 */
function getAvatarInitial(role: MessageRole): string {
  switch (role) {
    case 'user':
      return 'U';
    case 'assistant':
      return 'A';
    case 'system':
      return 'S';
    default:
      return '?';
  }
}

/**
 * Get avatar background classes based on message role.
 */
function getAvatarClasses(role: MessageRole): string {
  switch (role) {
    case 'user':
      return 'bg-poe-bg-tertiary border-poe-border';
    case 'assistant':
      return 'bg-poe-gold/20 border-poe-gold/30';
    case 'system':
      return 'bg-poe-rarity-gem/20 border-poe-rarity-gem/30';
    default:
      return 'bg-poe-bg-tertiary border-poe-border';
  }
}

/**
 * Get avatar text color based on message role.
 */
function getAvatarTextClass(role: MessageRole): string {
  switch (role) {
    case 'user':
      return 'text-poe-text-secondary';
    case 'assistant':
      return 'text-poe-gold';
    case 'system':
      return 'text-poe-rarity-gem';
    default:
      return 'text-poe-text-secondary';
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
 * ChatMessageBubble renders a single chat message with appropriate styling
 * based on the sender role.
 *
 * - User messages: aligned to the right, tertiary background
 * - Assistant messages: aligned to the left, card background, markdown rendered
 * - System messages: centered, gem-colored accent
 */
export function ChatMessageBubble({
  message,
  conversationId,
}: ChatMessageBubbleProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  // System messages are displayed centered
  if (isSystem) {
    return (
      <div className="flex justify-center my-3" data-message-role="system">
        <div className="bg-poe-bg-tertiary border border-poe-rarity-gem/20 rounded-lg px-4 py-2 max-w-[85%]">
          <p className="text-poe-rarity-gem text-xs text-center italic">
            {message.content}
          </p>
          <div className="flex justify-center gap-3 mt-1">
            <span className="text-poe-text-muted text-xs">
              {formatTimestamp(message.timestamp)}
            </span>
            {conversationId && (
              <span className="text-poe-text-muted text-xs">
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
      className={`flex gap-3 mb-4 ${isUser ? 'justify-end' : 'justify-start'}`}
      data-message-role={message.role}
    >
      {/* Avatar - left side for assistant */}
      {!isUser && (
        <div
          className={`shrink-0 w-8 h-8 rounded border flex items-center justify-center ${getAvatarClasses(message.role)}`}
          aria-label={`${message.role} avatar`}
        >
          <span className={`text-xs font-bold ${getAvatarTextClass(message.role)}`}>
            {getAvatarInitial(message.role)}
          </span>
        </div>
      )}

      {/* Message content */}
      <div
        className={`flex-1 max-w-[80%] ${
          isUser
            ? 'poe-card bg-poe-bg-tertiary border-poe-gold/30'
            : 'poe-card'
        }`}
      >
        {/* Role label */}
        <div className="flex items-center justify-between mb-1">
          <span
            className={`text-xs font-medium ${
              isUser ? 'text-poe-text-highlight' : 'text-poe-gold'
            }`}
          >
            {isUser ? 'You' : 'Assistant'}
          </span>
          <span className="text-poe-text-muted text-xs">
            {formatTimestamp(message.timestamp)}
          </span>
        </div>

        {/* Message body */}
        {isUser ? (
          <p className="text-poe-text-highlight text-sm leading-relaxed">
            {message.content}
          </p>
        ) : (
          <MarkdownRenderer content={message.content} />
        )}

        {/* Metadata footer */}
        {conversationId && (
          <div className="mt-2 pt-2 border-t border-poe-border">
            <span className="text-poe-text-muted text-xs">
              Conversation: {conversationId.slice(0, 8)}...
            </span>
          </div>
        )}
      </div>

      {/* Avatar - right side for user */}
      {isUser && (
        <div
          className={`shrink-0 w-8 h-8 rounded border flex items-center justify-center ${getAvatarClasses(message.role)}`}
          aria-label={`${message.role} avatar`}
        >
          <span className={`text-xs font-bold ${getAvatarTextClass(message.role)}`}>
            {getAvatarInitial(message.role)}
          </span>
        </div>
      )}
    </div>
  );
}
