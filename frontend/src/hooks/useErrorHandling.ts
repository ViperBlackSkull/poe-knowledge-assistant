import { useState, useCallback, useRef } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Error categories for classification and handling. */
export type ErrorCategory =
  | 'network'       // Connection issues, timeouts, DNS errors
  | 'api'           // Server returned an error response (4xx, 5xx)
  | 'validation'    // Input validation failures
  | 'authentication'// Auth/API key issues
  | 'streaming'     // SSE streaming errors
  | 'unknown';      // Unclassified errors

/** A classified error with metadata. */
export interface ClassifiedError {
  /** The original error */
  originalError: Error | unknown;
  /** Human-readable error message */
  message: string;
  /** Error category */
  category: ErrorCategory;
  /** Whether the operation can be retried */
  retryable: boolean;
  /** HTTP status code (if applicable) */
  statusCode?: number;
  /** Suggested user action */
  suggestion?: string;
}

/** Retry configuration options. */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in ms between retries (default: 1000) */
  baseDelay?: number;
  /** Whether to use exponential backoff (default: true) */
  exponentialBackoff?: boolean;
  /** Maximum delay cap in ms (default: 10000) */
  maxDelay?: number;
  /** Callback invoked before each retry attempt */
  onRetry?: (attempt: number, error: ClassifiedError) => void;
}

/** Return type for the useErrorHandling hook. */
export interface UseErrorHandlingReturn {
  /** The last classified error, or null */
  lastError: ClassifiedError | null;
  /** Number of consecutive retry attempts */
  retryCount: number;
  /** Whether a retry is currently in progress */
  isRetrying: boolean;
  /** Classify an error into a category with metadata */
  classifyError: (error: unknown) => ClassifiedError;
  /** Get a user-friendly message for an error */
  getUserMessage: (error: unknown) => string;
  /** Execute an async operation with retry logic */
  withRetry: <T>(
    operation: () => Promise<T>,
    options?: RetryOptions,
  ) => Promise<T>;
  /** Reset error state and retry count */
  reset: () => void;
  /** Clear just the error, keeping retry count */
  clearError: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check if an error has a status property (like APIClientError).
 */
function hasStatus(error: unknown): error is { status: number; detail?: string; code?: string } {
  return (
    error !== null &&
    typeof error === 'object' &&
    'status' in error &&
    typeof (error as { status: unknown }).status === 'number'
  );
}

/**
 * Check if an error is a network error (no response received).
 */
function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }
  if (hasStatus(error) && error.status === 0) {
    return true;
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    ((error as { code: unknown }).code === 'ECONNABORTED' ||
      (error as { code: unknown }).code === 'ERR_NETWORK' ||
      (error as { code: unknown }).code === 'ECONNREFUSED')
  ) {
    return true;
  }
  return false;
}

/**
 * Check if an error is an abort/cancel error.
 */
function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'ERR_CANCELED'
  ) {
    return true;
  }
  return false;
}

/**
 * Classify an unknown error into a structured ClassifiedError.
 */
export function classifyError(error: unknown): ClassifiedError {
  // Abort errors are intentional, not real errors
  if (isAbortError(error)) {
    return {
      originalError: error,
      message: 'Request was cancelled.',
      category: 'unknown',
      retryable: false,
    };
  }

  // Network errors
  if (isNetworkError(error)) {
    return {
      originalError: error,
      message: 'Unable to connect to the server. Please check your internet connection.',
      category: 'network',
      retryable: true,
      suggestion: 'Check your connection and try again.',
    };
  }

  // API errors with status codes
  if (hasStatus(error)) {
    const status = error.status;
    const detail = error.detail || '';

    // Authentication errors
    if (status === 401 || status === 403) {
      return {
        originalError: error,
        message: detail || 'Authentication required. Please check your API key in settings.',
        category: 'authentication',
        retryable: false,
        statusCode: status,
        suggestion: 'Open Settings and verify your API key.',
      };
    }

    // Validation errors
    if (status === 400 || status === 422) {
      return {
        originalError: error,
        message: detail || 'Invalid input. Please check your data and try again.',
        category: 'validation',
        retryable: false,
        statusCode: status,
      };
    }

    // Rate limiting
    if (status === 429) {
      return {
        originalError: error,
        message: 'Too many requests. Please wait a moment before trying again.',
        category: 'api',
        retryable: true,
        statusCode: status,
        suggestion: 'Wait a few seconds and try again.',
      };
    }

    // Server errors (retryable)
    if (status >= 500) {
      return {
        originalError: error,
        message: detail || 'The server encountered an error. Please try again later.',
        category: 'api',
        retryable: true,
        statusCode: status,
        suggestion: 'The issue may be temporary. Try again in a moment.',
      };
    }

    // Other API errors
    return {
      originalError: error,
      message: detail || `Request failed with status ${status}.`,
      category: 'api',
      retryable: status >= 500,
      statusCode: status,
    };
  }

  // Standard Error objects
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Streaming-related errors
    if (
      message.includes('stream') ||
      message.includes('sse') ||
      message.includes('readable')
    ) {
      return {
        originalError: error,
        message: error.message || 'Streaming error occurred.',
        category: 'streaming',
        retryable: true,
        suggestion: 'Try sending your message again.',
      };
    }

    // Network-related by message
    if (
      message.includes('network') ||
      message.includes('failed to fetch') ||
      message.includes('net::') ||
      message.includes('connection')
    ) {
      return {
        originalError: error,
        message: 'Network error. Please check your connection.',
        category: 'network',
        retryable: true,
      };
    }

    return {
      originalError: error,
      message: error.message,
      category: 'unknown',
      retryable: false,
    };
  }

  // String errors
  if (typeof error === 'string') {
    return {
      originalError: error,
      message: error,
      category: 'unknown',
      retryable: false,
    };
  }

  // Unknown error type
  return {
    originalError: error,
    message: 'An unexpected error occurred.',
    category: 'unknown',
    retryable: false,
  };
}

/**
 * Get a user-friendly message for an error.
 */
export function getUserMessage(error: unknown): string {
  return classifyError(error).message;
}

/**
 * Calculate delay for retry with optional exponential backoff.
 */
function getRetryDelay(
  attempt: number,
  baseDelay: number,
  exponential: boolean,
  maxDelay: number,
): number {
  if (!exponential) return baseDelay;
  const delay = baseDelay * Math.pow(2, attempt);
  return Math.min(delay, maxDelay);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Custom hook providing comprehensive error handling utilities.
 *
 * Features:
 *  - Error classification into categories (network, api, validation, auth, etc.)
 *  - User-friendly error message extraction
 *  - Retry mechanism with exponential backoff
 *  - Error state tracking
 *  - Retry count tracking
 *
 * @example
 * ```tsx
 * const { withRetry, lastError, getUserMessage } = useErrorHandling();
 *
 * const result = await withRetry(
 *   () => fetchConfig(),
 *   { maxRetries: 3, exponentialBackoff: true },
 * );
 *
 * if (lastError) {
 *   toast.addError(getUserMessage(lastError));
 * }
 * ```
 */
export function useErrorHandling(): UseErrorHandlingReturn {
  const [lastError, setLastError] = useState<ClassifiedError | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const classifyErrorCallback = useCallback((error: unknown): ClassifiedError => {
    const classified = classifyError(error);
    setLastError(classified);
    return classified;
  }, []);

  const getUserMessageCallback = useCallback((error: unknown): string => {
    return classifyError(error).message;
  }, []);

  const withRetry = useCallback(
    async <T>(
      operation: () => Promise<T>,
      options: RetryOptions = {},
    ): Promise<T> => {
      const {
        maxRetries = 3,
        baseDelay = 1000,
        exponentialBackoff = true,
        maxDelay = 10000,
        onRetry,
      } = options;

      let lastAttemptError: ClassifiedError | null = null;
      setRetryCount(0);
      setIsRetrying(true);

      // Cancel any previous retry chain
      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        // Check if this retry chain was cancelled
        if (controller.signal.aborted) {
          setIsRetrying(false);
          throw new DOMException('Retry cancelled', 'AbortError');
        }

        try {
          const result = await operation();
          setLastError(null);
          setRetryCount(0);
          setIsRetrying(false);
          return result;
        } catch (error) {
          const classified = classifyError(error);
          lastAttemptError = classified;
          setLastError(classified);

          // Don't retry non-retryable errors
          if (!classified.retryable) {
            setIsRetrying(false);
            throw error;
          }

          // Don't retry if we've exhausted attempts
          if (attempt >= maxRetries) {
            setIsRetrying(false);
            throw error;
          }

          // Set retry count for UI feedback
          setRetryCount(attempt + 1);

          // Notify callback
          onRetry?.(attempt + 1, classified);

          // Wait before retrying
          const delay = getRetryDelay(attempt, baseDelay, exponentialBackoff, maxDelay);
          await new Promise((resolve) => {
            const timer = setTimeout(resolve, delay);
            controller.signal.addEventListener('abort', () => {
              clearTimeout(timer);
              resolve(undefined);
            }, { once: true });
          });
        }
      }

      setIsRetrying(false);
      throw lastAttemptError?.originalError ?? new Error('Max retries exceeded');
    },
    [],
  );

  const reset = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    setLastError(null);
    setRetryCount(0);
    setIsRetrying(false);
  }, []);

  const clearError = useCallback(() => {
    setLastError(null);
  }, []);

  return {
    lastError,
    retryCount,
    isRetrying,
    classifyError: classifyErrorCallback,
    getUserMessage: getUserMessageCallback,
    withRetry,
    reset,
    clearError,
  };
}
