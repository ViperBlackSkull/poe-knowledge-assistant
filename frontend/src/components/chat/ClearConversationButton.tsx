import { useState, useCallback } from 'react';
import { ConfirmationDialog } from '@/components/common/ConfirmationDialog';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClearConversationButtonProps {
  /** Callback invoked when the user confirms clearing the conversation */
  onClear: () => void;
  /** Number of messages currently in the conversation */
  messageCount?: number;
  /** Whether the button should be disabled (e.g. during streaming) */
  disabled?: boolean;
  /** Optional additional CSS class names */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * ClearConversationButton renders a PoE-themed button that clears the chat history.
 *
 * Features:
 *  - PoE-styled button with trash/scroll icon
 *  - Shows message count badge when there are messages
 *  - Confirmation dialog before clearing
 *  - Disabled state during streaming or when no messages exist
 *  - Keyboard accessible
 */
export function ClearConversationButton({
  onClear,
  messageCount = 0,
  disabled = false,
  className = '',
}: ClearConversationButtonProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleOpenDialog = useCallback(() => {
    if (!disabled && messageCount > 0) {
      setIsDialogOpen(true);
    }
  }, [disabled, messageCount]);

  const handleConfirm = useCallback(() => {
    setIsDialogOpen(false);
    onClear();
  }, [onClear]);

  const handleCancel = useCallback(() => {
    setIsDialogOpen(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Determine if button is interactive
  // ---------------------------------------------------------------------------

  const isButtonDisabled = disabled || messageCount === 0;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      <button
        type="button"
        onClick={handleOpenDialog}
        disabled={isButtonDisabled}
        className={`group relative flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-all duration-200 ${
          isButtonDisabled
            ? 'text-poe-text-muted cursor-not-allowed opacity-50'
            : 'text-poe-text-secondary hover:text-poe-text-primary hover:bg-poe-hover border border-transparent hover:border-poe-border-light hover:scale-[1.02] active:scale-[0.98]'
        } ${className}`}
        aria-label={`Clear conversation${messageCount > 0 ? ` (${messageCount} messages)` : ''}`}
        title={isButtonDisabled ? 'No messages to clear' : 'Clear conversation'}
        data-testid="clear-conversation-button"
      >
        {/* Scroll/burn icon - themed as burning scroll */}
        <svg
          className="w-4 h-4 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
          />
        </svg>

        {/* Button label */}
        <span className="hidden sm:inline">Clear</span>

        {/* Message count badge */}
        {messageCount > 0 && (
          <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full text-[0.625rem] font-semibold bg-poe-gold/20 text-poe-gold border border-poe-gold/30 transition-transform duration-200 group-hover:scale-110">
            {messageCount}
          </span>
        )}
      </button>

      {/* Confirmation dialog */}
      <ConfirmationDialog
        isOpen={isDialogOpen}
        title="Clear Conversation"
        message={
          <span>
            This will permanently clear all{' '}
            <span className="text-poe-gold font-semibold">{messageCount}</span>{' '}
            message{messageCount !== 1 ? 's' : ''} from the current conversation.
            This action cannot be undone.
          </span>
        }
        confirmLabel="Clear All"
        cancelLabel="Keep Chat"
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        variant="danger"
      />
    </>
  );
}
