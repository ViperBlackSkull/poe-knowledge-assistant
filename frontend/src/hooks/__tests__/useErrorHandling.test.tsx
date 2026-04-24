/**
 * Unit tests for the useErrorHandling hook.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useErrorHandling } from '../useErrorHandling';

describe('useErrorHandling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('returns default values', () => {
      const { result } = renderHook(() => useErrorHandling());

      expect(result.current.lastError).toBeNull();
      expect(result.current.retryCount).toBe(0);
      expect(result.current.isRetrying).toBe(false);
    });
  });

  describe('classifyError', () => {
    it('classifies network errors (TypeError with fetch)', () => {
      const { result } = renderHook(() => useErrorHandling());

      let classified: ReturnType<typeof result.current.classifyError>;
      act(() => {
        classified = result.current.classifyError(
          new TypeError('Failed to fetch'),
        );
      });

      expect(classified!.category).toBe('network');
      expect(classified!.retryable).toBe(true);
      expect(result.current.lastError).not.toBeNull();
    });

    it('classifies API errors with 401 status as authentication', () => {
      const { result } = renderHook(() => useErrorHandling());

      let classified: ReturnType<typeof result.current.classifyError>;
      act(() => {
        classified = result.current.classifyError({
          status: 401,
          detail: 'Unauthorized',
        });
      });

      expect(classified!.category).toBe('authentication');
      expect(classified!.retryable).toBe(false);
      expect(classified!.statusCode).toBe(401);
    });

    it('classifies API errors with 403 status as authentication', () => {
      const { result } = renderHook(() => useErrorHandling());

      let classified: ReturnType<typeof result.current.classifyError>;
      act(() => {
        classified = result.current.classifyError({ status: 403 });
      });

      expect(classified!.category).toBe('authentication');
      expect(classified!.statusCode).toBe(403);
    });

    it('classifies 400/422 as validation errors', () => {
      const { result } = renderHook(() => useErrorHandling());

      act(() => {
        result.current.classifyError({ status: 400 });
      });
      expect(result.current.lastError!.category).toBe('validation');

      act(() => {
        result.current.classifyError({ status: 422, detail: 'Bad input' });
      });
      expect(result.current.lastError!.category).toBe('validation');
    });

    it('classifies 429 as retryable api error', () => {
      const { result } = renderHook(() => useErrorHandling());

      act(() => {
        result.current.classifyError({ status: 429 });
      });

      expect(result.current.lastError!.category).toBe('api');
      expect(result.current.lastError!.retryable).toBe(true);
      expect(result.current.lastError!.statusCode).toBe(429);
    });

    it('classifies 500+ as retryable api errors', () => {
      const { result } = renderHook(() => useErrorHandling());

      act(() => {
        result.current.classifyError({ status: 500 });
      });

      expect(result.current.lastError!.category).toBe('api');
      expect(result.current.lastError!.retryable).toBe(true);
      expect(result.current.lastError!.statusCode).toBe(500);
    });

    it('classifies streaming errors by message content', () => {
      const { result } = renderHook(() => useErrorHandling());

      act(() => {
        result.current.classifyError(new Error('SSE connection lost'));
      });

      expect(result.current.lastError!.category).toBe('streaming');
      expect(result.current.lastError!.retryable).toBe(true);
    });

    it('classifies readable stream errors', () => {
      const { result } = renderHook(() => useErrorHandling());

      act(() => {
        result.current.classifyError(new Error('Readable stream failed'));
      });

      expect(result.current.lastError!.category).toBe('streaming');
    });

    it('classifies abort errors as non-retryable unknown', () => {
      const { result } = renderHook(() => useErrorHandling());

      act(() => {
        result.current.classifyError(new DOMException('Aborted', 'AbortError'));
      });

      expect(result.current.lastError!.category).toBe('unknown');
      expect(result.current.lastError!.retryable).toBe(false);
    });

    it('classifies string errors as unknown', () => {
      const { result } = renderHook(() => useErrorHandling());

      act(() => {
        result.current.classifyError('something went wrong');
      });

      expect(result.current.lastError!.category).toBe('unknown');
      expect(result.current.lastError!.message).toBe('something went wrong');
    });

    it('classifies null as unknown', () => {
      const { result } = renderHook(() => useErrorHandling());

      act(() => {
        result.current.classifyError(null);
      });

      expect(result.current.lastError!.category).toBe('unknown');
      expect(result.current.lastError!.retryable).toBe(false);
    });

    it('classifies errors with ECONNABORTED code as network', () => {
      const { result } = renderHook(() => useErrorHandling());

      act(() => {
        result.current.classifyError({ code: 'ECONNABORTED' });
      });

      expect(result.current.lastError!.category).toBe('network');
      expect(result.current.lastError!.retryable).toBe(true);
    });

    it('classifies network-related Error messages', () => {
      const { result } = renderHook(() => useErrorHandling());

      act(() => {
        result.current.classifyError(new Error('Network connection lost'));
      });

      expect(result.current.lastError!.category).toBe('network');
    });

    it('classifies ERR_CANCELED code via abort path', () => {
      const { result } = renderHook(() => useErrorHandling());

      act(() => {
        result.current.classifyError({ code: 'ERR_CANCELED' });
      });

      expect(result.current.lastError!.category).toBe('unknown');
      expect(result.current.lastError!.retryable).toBe(false);
    });
  });

  describe('getUserMessage', () => {
    it('returns user-friendly message for network errors', () => {
      const { result } = renderHook(() => useErrorHandling());

      const message = result.current.getUserMessage(
        new TypeError('Failed to fetch'),
      );

      expect(message).toContain('Unable to connect');
    });

    it('returns message for API auth errors', () => {
      const { result } = renderHook(() => useErrorHandling());

      const message = result.current.getUserMessage({ status: 401 });

      expect(message).toContain('Authentication');
    });

    it('returns message for string errors', () => {
      const { result } = renderHook(() => useErrorHandling());

      const message = result.current.getUserMessage('Oops');

      expect(message).toBe('Oops');
    });
  });

  describe('withRetry - success', () => {
    it('returns result on successful operation', async () => {
      const { result } = renderHook(() => useErrorHandling());

      let res: string | undefined;
      await act(async () => {
        res = await result.current.withRetry(async () => 'success');
      });

      expect(res).toBe('success');
      expect(result.current.lastError).toBeNull();
      expect(result.current.retryCount).toBe(0);
      expect(result.current.isRetrying).toBe(false);
    });
  });

  describe('withRetry - retryable errors', () => {
    it('retries retryable errors up to maxRetries', async () => {
      const { result } = renderHook(() => useErrorHandling());

      let attempts = 0;
      const operation = async (): Promise<string> => {
        attempts++;
        if (attempts < 3) {
          throw { status: 500 };
        }
        return 'done';
      };

      let res: string | undefined;
      await act(async () => {
        res = await result.current.withRetry(operation, {
          maxRetries: 3,
          baseDelay: 10,
          exponentialBackoff: false,
        });
      });

      expect(res).toBe('done');
      expect(attempts).toBe(3);
    });

    it('calls onRetry callback before each retry', async () => {
      const { result } = renderHook(() => useErrorHandling());
      const onRetry = vi.fn();

      let attempts = 0;
      const operation = async (): Promise<string> => {
        attempts++;
        if (attempts < 2) {
          throw { status: 500 };
        }
        return 'ok';
      };

      await act(async () => {
        await result.current.withRetry(operation, {
          maxRetries: 2,
          baseDelay: 10,
          exponentialBackoff: false,
          onRetry,
        });
      });

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(1, expect.objectContaining({ category: 'api' }));
    });

    it('throws after exhausting retries', async () => {
      const { result } = renderHook(() => useErrorHandling());

      const operation = async (): Promise<string> => {
        throw { status: 500 };
      };

      await act(async () => {
        await expect(
          result.current.withRetry(operation, {
            maxRetries: 2,
            baseDelay: 10,
            exponentialBackoff: false,
          }),
        ).rejects.toEqual({ status: 500 });
      });

      expect(result.current.isRetrying).toBe(false);
    });
  });

  describe('withRetry - non-retryable errors', () => {
    it('does not retry non-retryable errors', async () => {
      const { result } = renderHook(() => useErrorHandling());

      let attempts = 0;
      const operation = async (): Promise<string> => {
        attempts++;
        throw { status: 401 };
      };

      await act(async () => {
        await expect(
          result.current.withRetry(operation, {
            maxRetries: 3,
            baseDelay: 10,
          }),
        ).rejects.toEqual({ status: 401 });
      });

      expect(attempts).toBe(1);
      expect(result.current.isRetrying).toBe(false);
    });
  });

  describe('reset()', () => {
    it('clears error state and retry count', () => {
      const { result } = renderHook(() => useErrorHandling());

      act(() => {
        result.current.classifyError(new Error('Test'));
      });

      expect(result.current.lastError).not.toBeNull();

      act(() => {
        result.current.reset();
      });

      expect(result.current.lastError).toBeNull();
      expect(result.current.retryCount).toBe(0);
      expect(result.current.isRetrying).toBe(false);
    });
  });

  describe('clearError()', () => {
    it('clears only the error', () => {
      const { result } = renderHook(() => useErrorHandling());

      act(() => {
        result.current.classifyError(new Error('Test'));
      });

      expect(result.current.lastError).not.toBeNull();

      act(() => {
        result.current.clearError();
      });

      expect(result.current.lastError).toBeNull();
    });
  });
});
