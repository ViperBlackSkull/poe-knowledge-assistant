import { Component, type ReactNode, type ErrorInfo } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ErrorBoundaryProps {
  /** Child components to wrap with the error boundary */
  children: ReactNode;
  /** Optional fallback UI to display when an error occurs */
  fallback?: ReactNode;
  /** Callback invoked when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Optional component name for debugging */
  name?: string;
  /** Optional additional CSS class names */
  className?: string;
}

export interface ErrorBoundaryState {
  /** Whether an error has been caught */
  hasError: boolean;
  /** The error that was caught */
  error: Error | null;
  /** React error info containing the component stack */
  errorInfo: ErrorInfo | null;
  /** Number of times the error boundary has been triggered */
  errorCount: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * ErrorBoundary catches JavaScript errors anywhere in its child component tree,
 * logs those errors, and displays a fallback UI instead of crashing the app.
 *
 * Features:
 *  - Catches render errors in child components
 *  - Displays a PoE-themed error fallback UI
 *  - Provides a retry button to reset the boundary
 *  - Shows error details in development mode
 *  - Tracks error count for repeated failures
 *  - Reports errors via the onError callback
 *  - Accessible with proper ARIA attributes
 *
 * @example
 * ```tsx
 * <ErrorBoundary name="ChatPanel" onError={(err) => logError(err)}>
 *   <ChatPanel />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const errorCount = this.state.errorCount + 1;

    this.setState((prev) => ({
      ...prev,
      errorInfo,
      errorCount,
    }));

    // Report the error
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Log in development
    if (import.meta.env.DEV) {
      console.error(
        `[ErrorBoundary${this.props.name ? ` (${this.props.name})` : ''}] Caught error:`,
        error,
        errorInfo,
      );
    }
  }

  handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isDev = import.meta.env.DEV;
      const errorCount = this.state.errorCount;
      const componentName = this.props.name || 'this component';

      return (
        <div
          className={`flex flex-col items-center justify-center p-8 min-h-[200px] ${this.props.className || ''}`}
          role="alert"
          aria-label="An error occurred in the application"
          data-testid="error-boundary-fallback"
        >
          {/* Error icon */}
          <div className="w-16 h-16 rounded-full bg-red-900/20 border border-red-500/30 flex items-center justify-center mb-4">
            <svg
              className="w-8 h-8 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>

          {/* Error title */}
          <h3 className="poe-header text-lg font-semibold text-red-400 mb-2">
            Something went wrong
          </h3>

          {/* Error description */}
          <p className="text-sm text-poe-text-secondary text-center max-w-md mb-4">
            An unexpected error occurred in {componentName}.
            {errorCount > 2
              ? ' This error keeps repeating. Try reloading the page.'
              : ' You can try again or reload the page.'}
          </p>

          {/* Error details in development mode */}
          {isDev && this.state.error && (
            <details className="w-full max-w-lg mb-4">
              <summary className="text-xs text-poe-text-muted cursor-pointer hover:text-poe-text-highlight transition-colors">
                Error details (development only)
              </summary>
              <pre className="mt-2 p-3 bg-poe-bg-primary border border-poe-border rounded text-xs text-red-300 overflow-auto max-h-40 whitespace-pre-wrap">
                {this.state.error.toString()}
                {this.state.errorInfo?.componentStack && (
                  <>
                    {'\n\nComponent stack:'}
                    {this.state.errorInfo.componentStack}
                  </>
                )}
              </pre>
            </details>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={this.handleRetry}
              className="poe-button px-4 py-2 text-sm rounded bg-poe-gold hover:bg-poe-gold-light border-poe-gold-dark text-white hover:shadow-poe-glow transition-all"
              data-testid="error-boundary-retry"
            >
              Try Again
            </button>
            {errorCount > 2 && (
              <button
                type="button"
                onClick={this.handleReload}
                className="poe-button-secondary px-4 py-2 text-sm rounded transition-all"
                data-testid="error-boundary-reload"
              >
                Reload Page
              </button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
