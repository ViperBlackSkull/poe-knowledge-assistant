import { useState, useCallback, useEffect, useRef, createContext, useContext, type ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Severity levels for toast notifications. */
export type ToastSeverity = 'error' | 'warning' | 'info' | 'success';

/** A single toast notification entry. */
export interface ToastEntry {
  /** Unique identifier for this toast */
  id: string;
  /** Severity/type of the toast */
  severity: ToastSeverity;
  /** Human-readable message to display */
  message: string;
  /** Optional title for the toast */
  title?: string;
  /** ISO 8601 timestamp when the toast was created */
  timestamp: string;
  /** Auto-dismiss duration in milliseconds (0 = manual dismiss only) */
  duration: number;
  /** Whether a retry action is available */
  retryable: boolean;
  /** Retry callback, if available */
  onRetry?: () => void | Promise<void>;
  /** Whether the toast is currently dismissing (for exit animation) */
  isDismissing: boolean;
}

/** Options for adding a new toast. */
export interface AddToastOptions {
  /** Severity level */
  severity?: ToastSeverity;
  /** Optional title */
  title?: string;
  /** Auto-dismiss duration in ms (default: 5000 for errors, 3000 for others, 0 = manual) */
  duration?: number;
  /** Whether to show a retry button */
  retryable?: boolean;
  /** Retry callback */
  onRetry?: () => void | Promise<void>;
}

/** Context value provided by the ToastProvider. */
export interface ToastContextValue {
  /** Current active toasts */
  toasts: ToastEntry[];
  /** Add a new toast notification */
  addToast: (message: string, options?: AddToastOptions) => string;
  /** Remove a toast by ID */
  removeToast: (id: string) => void;
  /** Clear all toasts */
  clearAllToasts: () => void;
  /** Convenience: add an error toast */
  addError: (message: string, options?: AddToastOptions) => string;
  /** Convenience: add a warning toast */
  addWarning: (message: string, options?: AddToastOptions) => string;
  /** Convenience: add an info toast */
  addInfo: (message: string, options?: AddToastOptions) => string;
  /** Convenience: add a success toast */
  addSuccess: (message: string, options?: AddToastOptions) => string;
}

/** Props for the ToastProvider. */
export interface ToastProviderProps {
  /** Child components */
  children: ReactNode;
  /** Maximum number of toasts to show at once (default: 5) */
  maxToasts?: number;
}

/** Props for the ErrorToast standalone component (renders toast container). */
export interface ErrorToastProps {
  /** Optional additional CSS class names */
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_ERROR_DURATION = 6000;
const DEFAULT_DURATION = 4000;
const DEFAULT_SUCCESS_DURATION = 3000;
const MAX_TOASTS = 5;
const DISMISS_ANIMATION_MS = 300;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Hook to access the toast notification system.
 *
 * Must be used within a ToastProvider.
 *
 * @example
 * ```tsx
 * const { addError, addSuccess } = useToast();
 * addError('Failed to save settings', { retryable: true, onRetry: () => save() });
 * addSuccess('Settings saved successfully');
 * ```
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let toastIdCounter = 0;
function generateToastId(): string {
  return `toast_${Date.now()}_${++toastIdCounter}`;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/**
 * ToastProvider wraps the application and provides a toast notification system.
 *
 * Features:
 *  - Global toast management via React context
 *  - Auto-dismiss with configurable duration
 *  - Animated entry and exit transitions
 *  - Stacked toast display (bottom-right corner)
 *  - Multiple severity levels with distinct styling
 *  - Retry support for error toasts
 *  - Maximum toast limit with automatic pruning
 *
 * @example
 * ```tsx
 * <ToastProvider>
 *   <App />
 * </ToastProvider>
 * ```
 */
export function ToastProvider({ children, maxToasts = MAX_TOASTS }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Cleanup timers on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const dismissToast = useCallback((id: string) => {
    // Start dismiss animation
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, isDismissing: true } : t)),
    );

    // Remove after animation completes
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      const timer = timersRef.current.get(id);
      if (timer) {
        clearTimeout(timer);
        timersRef.current.delete(id);
      }
    }, DISMISS_ANIMATION_MS);
  }, []);

  const scheduleAutoDismiss = useCallback((id: string, duration: number) => {
    if (duration <= 0) return; // Manual dismiss only

    const timer = setTimeout(() => {
      dismissToast(id);
      timersRef.current.delete(id);
    }, duration);

    timersRef.current.set(id, timer);
  }, [dismissToast]);

  const addToast = useCallback((message: string, options: AddToastOptions = {}): string => {
    const id = generateToastId();
    const severity = options.severity ?? 'info';

    const entry: ToastEntry = {
      id,
      severity,
      message,
      title: options.title,
      timestamp: new Date().toISOString(),
      duration: options.duration ?? (
        severity === 'error' ? DEFAULT_ERROR_DURATION
          : severity === 'success' ? DEFAULT_SUCCESS_DURATION
            : DEFAULT_DURATION
      ),
      retryable: options.retryable ?? false,
      onRetry: options.onRetry,
      isDismissing: false,
    };

    setToasts((prev) => {
      // If we exceed the max, remove the oldest non-dismissing toast
      const active = prev.filter((t) => !t.isDismissing);
      if (active.length >= maxToasts) {
        const toRemove = active[0];
        if (toRemove) {
          const timer = timersRef.current.get(toRemove.id);
          if (timer) {
            clearTimeout(timer);
            timersRef.current.delete(toRemove.id);
          }
        }
        return [...prev.slice(1), entry];
      }
      return [...prev, entry];
    });

    scheduleAutoDismiss(id, entry.duration);
    return id;
  }, [maxToasts, scheduleAutoDismiss]);

  const removeToast = useCallback((id: string) => {
    dismissToast(id);
  }, [dismissToast]);

  const clearAllToasts = useCallback(() => {
    timersRef.current.forEach((timer) => clearTimeout(timer));
    timersRef.current.clear();
    setToasts([]);
  }, []);

  const addError = useCallback((message: string, options: AddToastOptions = {}): string => {
    return addToast(message, { ...options, severity: 'error' });
  }, [addToast]);

  const addWarning = useCallback((message: string, options: AddToastOptions = {}): string => {
    return addToast(message, { ...options, severity: 'warning' });
  }, [addToast]);

  const addInfo = useCallback((message: string, options: AddToastOptions = {}): string => {
    return addToast(message, { ...options, severity: 'info' });
  }, [addToast]);

  const addSuccess = useCallback((message: string, options: AddToastOptions = {}): string => {
    return addToast(message, { ...options, severity: 'success' });
  }, [addToast]);

  const contextValue: ToastContextValue = {
    toasts,
    addToast,
    removeToast,
    clearAllToasts,
    addError,
    addWarning,
    addInfo,
    addSuccess,
  };

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <ErrorToast />
    </ToastContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Severity styling configuration
// ---------------------------------------------------------------------------

const SEVERITY_CONFIG: Record<ToastSeverity, {
  cardBg: string;
  borderColor: string;
  accentColor: string;
  iconColor: string;
  textColor: string;
  titleColor: string;
  iconPath: string;
}> = {
  error: {
    cardBg: 'bg-poe-bg-card',
    borderColor: 'border-poe-border/60',
    accentColor: 'bg-[#cc4444]',
    iconColor: 'text-[#cc4444]',
    textColor: 'text-poe-text-primary',
    titleColor: 'text-[#cc4444]',
    iconPath: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
  },
  warning: {
    cardBg: 'bg-poe-bg-card',
    borderColor: 'border-poe-border/60',
    accentColor: 'bg-[#AF6025]',
    iconColor: 'text-poe-gold',
    textColor: 'text-poe-text-primary',
    titleColor: 'text-poe-gold-light',
    iconPath: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
  },
  info: {
    cardBg: 'bg-poe-bg-card',
    borderColor: 'border-poe-border/60',
    accentColor: 'bg-poe-text-secondary',
    iconColor: 'text-poe-text-secondary',
    textColor: 'text-poe-text-primary',
    titleColor: 'text-poe-text-highlight',
    iconPath: 'M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z',
  },
  success: {
    cardBg: 'bg-poe-bg-card',
    borderColor: 'border-poe-border/60',
    accentColor: 'bg-[#1BA29B]',
    iconColor: 'text-[#1BA29B]',
    textColor: 'text-poe-text-primary',
    titleColor: 'text-[#1BA29B]',
    iconPath: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
};

// ---------------------------------------------------------------------------
// Toast container component
// ---------------------------------------------------------------------------

/**
 * ErrorToast renders the toast notification container.
 *
 * This component is automatically rendered by ToastProvider and should not
 * be used directly unless outside of a ToastProvider context.
 *
 * Displays toasts in a stacked layout at the bottom-right of the screen.
 */
export function ErrorToast({ className = '' }: ErrorToastProps) {
  const toastContext = useContext(ToastContext);

  // If not in a provider (standalone usage), render nothing
  if (!toastContext) return null;

  const { toasts, removeToast } = toastContext;

  if (toasts.length === 0) return null;

  return (
    <div
      className={`fixed bottom-4 right-4 z-[100] flex flex-col-reverse gap-2 max-w-sm w-full pointer-events-none ${className}`}
      data-testid="toast-container"
      aria-label="Notifications"
      role="region"
    >
      {toasts.map((toast) => {
        const config = SEVERITY_CONFIG[toast.severity];
        return (
          <div
            key={toast.id}
            className={`
              pointer-events-auto
              ${config.cardBg}
              border ${config.borderColor}
              rounded shadow-[0_4px_24px_rgba(0,0,0,0.5)]
              transition-all duration-300 ease-in-out
              ${toast.isDismissing
                ? 'animate-poe-toast-out'
                : 'animate-poe-toast-in'
              }
            `}
            role="alert"
            aria-live="assertive"
            data-testid={`toast-${toast.id}`}
            data-severity={toast.severity}
          >
            <div className="flex">
              {/* Left accent stripe */}
              <div className={`w-1 shrink-0 rounded-l ${config.accentColor}`} />

              <div className="flex-1 p-3">
                <div className="flex items-start gap-2.5">
                  {/* Icon */}
                  <svg
                    className={`w-5 h-5 ${config.iconColor} shrink-0 mt-0.5`}
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d={config.iconPath}
                    />
                  </svg>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {toast.title && (
                      <p className={`text-xs font-semibold ${config.titleColor} mb-0.5 tracking-wide`}>
                        {toast.title}
                      </p>
                    )}
                    <p className={`text-sm ${config.textColor} leading-snug`}>
                      {toast.message}
                    </p>
                  </div>

                  {/* Dismiss button */}
                  <button
                    type="button"
                    onClick={() => removeToast(toast.id)}
                    className="shrink-0 p-0.5 rounded text-poe-text-muted hover:text-poe-text-highlight transition-colors"
                    aria-label="Dismiss notification"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Retry button for retryable toasts */}
                {toast.retryable && toast.onRetry && (
                  <div className="mt-2 ml-7.5 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={toast.onRetry}
                      className={`text-xs font-medium ${config.iconColor} hover:underline transition-colors`}
                      data-testid={`toast-retry-${toast.id}`}
                    >
                      Retry
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
