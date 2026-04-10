import { useEffect, useRef, useCallback, type ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConfirmationDialogProps {
  /** Whether the dialog is currently visible */
  isOpen: boolean;
  /** Title displayed at the top of the dialog */
  title: string;
  /** Descriptive message explaining the action */
  message: string | ReactNode;
  /** Label for the confirm/action button */
  confirmLabel?: string;
  /** Label for the cancel button */
  cancelLabel?: string;
  /** Callback invoked when the user confirms the action */
  onConfirm: () => void;
  /** Callback invoked when the user cancels or closes the dialog */
  onCancel: () => void;
  /** Visual variant for the confirm button */
  variant?: 'danger' | 'warning' | 'default';
  /** Optional additional CSS class names */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * A PoE-themed confirmation dialog with modal overlay.
 *
 * Features:
 *  - Dark overlay backdrop with focus trapping
 *  - PoE-styled card dialog with header, message, and actions
 *  - Keyboard accessible (Escape to close, focus management)
 *  - Danger/warning/default visual variants
 *  - Smooth fade-in transition
 */
export function ConfirmationDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'default',
  className = '',
}: ConfirmationDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  // ---------------------------------------------------------------------------
  // Focus management
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (isOpen && confirmButtonRef.current) {
      // Focus the confirm button when the dialog opens
      confirmButtonRef.current.focus();
    }
  }, [isOpen]);

  // ---------------------------------------------------------------------------
  // Keyboard handling
  // ---------------------------------------------------------------------------

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }

      // Trap focus inside the dialog
      if (e.key === 'Tab' && dialogRef.current) {
        const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        const firstEl = focusableElements[0];
        const lastEl = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl?.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl?.focus();
        }
      }
    },
    [onCancel],
  );

  // ---------------------------------------------------------------------------
  // Variant styling
  // ---------------------------------------------------------------------------

  const confirmButtonStyles: Record<string, string> = {
    danger:
      'bg-red-800 hover:bg-red-700 border-red-600 text-red-100 hover:shadow-[0_0_10px_rgba(239,68,68,0.4)]',
    warning:
      'bg-yellow-800 hover:bg-yellow-700 border-yellow-600 text-yellow-100 hover:shadow-[0_0_10px_rgba(234,179,8,0.4)]',
    default:
      'bg-[#AF6025] hover:bg-[#D4A85A] border-[#7D4A1C] text-white hover:shadow-[0_0_10px_rgba(175,96,37,0.5)]',
  };

  // ---------------------------------------------------------------------------
  // Don't render if not open
  // ---------------------------------------------------------------------------

  if (!isOpen) return null;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirmation-dialog-title"
      aria-describedby="confirmation-dialog-message"
      data-testid="confirmation-dialog"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop overlay */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Dialog card */}
      <div
        ref={dialogRef}
        className={`relative w-full max-w-md bg-[#1A1A1F] border border-[#3D3D44] rounded-lg shadow-2xl ${className}`}
        data-testid="confirmation-dialog-card"
      >
        {/* Decorative top border accent */}
        <div className="h-0.5 w-full rounded-t-lg bg-gradient-to-r from-transparent via-[#AF6025] to-transparent" />

        <div className="p-4 sm:p-6">
          {/* Icon and title */}
          <div className="flex items-start gap-3 sm:gap-4 mb-4">
            {/* Warning icon */}
            <div
              className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                variant === 'danger'
                  ? 'bg-red-900/30 border border-red-700/40'
                  : variant === 'warning'
                    ? 'bg-yellow-900/30 border border-yellow-700/40'
                    : 'bg-[#AF6025]/20 border border-[#AF6025]/30'
              }`}
            >
              <svg
                className={`w-5 h-5 ${
                  variant === 'danger'
                    ? 'text-red-400'
                    : variant === 'warning'
                      ? 'text-yellow-400'
                      : 'text-[#AF6025]'
                }`}
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
            </div>

            {/* Title and message */}
            <div className="flex-1 min-w-0">
              <h3
                id="confirmation-dialog-title"
                className="poe-header text-lg font-semibold mb-1"
              >
                {title}
              </h3>
              <div
                id="confirmation-dialog-message"
                className="text-sm text-[#9E9EA8] leading-relaxed"
              >
                {message}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2 sm:gap-3 mt-4 sm:mt-6">
            <button
              type="button"
              onClick={onCancel}
              className="poe-button-secondary px-3 sm:px-4 py-2 text-sm rounded transition-all touch-manipulation min-h-[40px]"
              aria-label={cancelLabel}
              data-testid="confirmation-dialog-cancel"
            >
              {cancelLabel}
            </button>
            <button
              ref={confirmButtonRef}
              type="button"
              onClick={onConfirm}
              className={`poe-button px-3 sm:px-4 py-2 text-sm rounded border transition-all touch-manipulation min-h-[40px] ${confirmButtonStyles[variant]}`}
              aria-label={confirmLabel}
              data-testid="confirmation-dialog-confirm"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
