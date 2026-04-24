/**
 * Unit tests for the useErrorHandling hook.
 *
 * Covers:
 *   - Initial state
 *   - Error classification (network, api, validation, auth, streaming, unknown)
 *   - User message extraction
 *   - Retry logic (successful operation, retryable errors, non-retryable errors)
 *   - Reset and clearError
 *   - Abort cancellation
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

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  describe('initial state', () => {
    it('returns default values', () => {
      const { result } = renderHook(() => useErrorHandling());

      expect(result.current.lastError).toBeNull();
      expect(result.current.retryCount).toBe(0);
      expect(result.current.isRetrying).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // classifyError
  // -------------------------------------------------------------------------

  describe('classifyError', () => {
    it('classifies network errors (TypeError with fetch)', () => {
      const { result } = renderHook(() => useErrorHandling());

      let classified: ReturnType<typeof result.current.classifyError>;
      act(() => {
        classified = result.current.classifyError(new TypeError('Failed to fetch'));
      });

      expect(classified!.category).toBe('network');
      expect(classified!.retryable).toBe(true);
      expect(result.current.lastError).not.toBeNull();
    });

    it('classifies API errors with 401 status as authentication', () => {
      const { result } = renderHook(() => useErrorHandling());

      let classified: ReturnType<typeof result.current.classifyError>;
      act(() => {
        classified = result.current.classifyError({ status: 401, detail: 'Unauthorized' });
      });

      expect(classified!.category).toBe('authentication');
      expect(classified!.retryable).toBe(false);
      expect(classified!.statusCode).toBe(401);
    });

    it('classifies 400/422 as validation errors', () => {
      const { result } = renderHook(() => useErrorHandling());

      act(() => { result.current.classifyError({ status: 400 }); });
      expect(result.current.lastError!.category).toBe('validation');

      act(() => { result.current.classifyError({ status: 422, detail: 'Bad input' }); });
      expect(result.current.lastError!.category).toBe('validation');
    });

    it('classifies 429 as retryable api error', () => {
      const { result } = renderHook(() => useErrorHandling());

      act(() => { result.current.classifyError({ status: 429 }); });

      expect(result.current.lastError!.category).toBe('api');
      expect(result.current.lastError!.retryable).toBe(true);
    });

    it('classifies 500+ as retryable api errors', () => {
      const { result } = renderHook(() => useErrorHandling());

      act(() => { result.current.classifyError({ status: 500 }); });

      expect(result.current.lastError!.category).toBe('api');
      expect(result.current.lastError!.retryable).toBe(true);
    });

    it('classifies streaming errors by message content', () => {
      const { result } = renderHook(() => useErrorHandling());

      act(() => { result.current.classifyError(new Error('SSE connection lost')); });

      expect(result.current.lastError!.category).toBe('streaming');
      expect(result.current.lastError!.retryable).toBe(true);
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

      act(() => { result.current.classifyError('something went wrong'); });

      expect(result.current.lastError!.category).toBe('unknown');
      expect(result.current.lastError!.message).toBe('something went wrong');
    });

    it('classifies null as unknown', () => {
      const { result } = renderHook(() => useErrorHandling());

      act(() => { result.current.classifyError(null); });

      expect(result.current.lastError!.category).toBe('unknown');
    });

    it('classifies ECONNABORTED code as network', () => {
      const { result } = renderHook(() => useErrorHandling());

      act(() => { result.current.classifyError({ code: 'ECONNABORTED' }); });

      expect(result.current.lastError!.category).toBe('network');
      expect(result.current.lastError!.retryable).toBe(true);
    });

    it('classifies network-related Error messages', () => {
      const { result } = renderHook(() => useErrorHandling());

      act(() => { result.current.classifyError(new Error('Network connection lost')); });

      expect(result.current.lastError!.category).toBe('network');
    });
  });

  // -------------------------------------------------------------------------
  // getUserMessage
  // -------------------------------------------------------------------------

  describe('getUserMessage', () => {
    it('returns user-friendly message for errors', () => {
      const { result } = renderHook(() => useErrorHandling());

      const message = result.current.getUserMessage(
        new TypeError('Failed to fetch'),
      );
      expect(message).toContain('Unable to connect');
    });
  });

  // -------------------------------------------------------------------------
  // withRetry
  // -------------------------------------------------------------------------

  describe('withRetry', () => {
    it('returns result on first successful attempt', async () => {
      const { result } = renderHook(() => useErrorHandling());
      const operation = vi.fn().mockResolvedValue('success');

      let res: string | undefined;
      await act(async () => {
        res = await result.current.withRetry(operation);
      });

      expect(res).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
      expect(result.current.lastError).toBeNull();
      expect(result.current.retryCount).toBe(0);
      expect(result.current.isRetrying).toBe(false);
    });

    it('retries on retryable errors and succeeds', async () => {
      const { result } = renderHook(() => useErrorHandling());
      const retryableError = { status: 500 };
      const operation = vi.fn()
        .mockRejectedValueOnce(retryableError)
        .mockResolvedValueOnce('recovered');

      let res: string | undefined;
      await act(async () => {
        res = await result.current.withRetry(operation, {
          baseDelay: 10,
          maxRetries: 3,
        });
      });

      expect(res).toBe('recovered');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('throws immediately on non-retryable errors', async () => {
      const { result } = renderHook(() => useErrorHandling());
      const nonRetryableError = { status: 401 };
      const operation = vi.fn().mockRejectedValue(nonRetryableError);

      await act(async () => {
        await expect(
          result.current.withRetry(operation),
        ).rejects.toBe(nonRetryableError);
      });

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('throws after max retries exhausted', async () => {
      const { result } = renderHook(() => useErrorHandling());
      const retryableError = { status: 500 };
      const operation = vi.fn().mockRejectedValue(retryableError);
      const onRetry = vi.fn();

      await act(async () => {
        await expect(
          result.current.withRetry(operation, {
            maxRetries: 2,
            baseDelay: 10,
            onRetry,
          }),
        ).rejects.toBe(retryableError);
      });

      // Initial attempt + 2 retries = 3 total
      expect(operation).toHaveBeenCalledTimes(3);
      expect(onRetry).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // reset
  // -------------------------------------------------------------------------

  describe('reset', () => {
    it('clears all error state', () => {
      const { result } = renderHook(() => useErrorHandling());

      act(() => { result.current.classifyError(new Error('test')); });
      expect(result.current.lastError).not.toBeNull();

      act(() => { result.current.reset(); });

      expect(result.current.lastError).toBeNull();
      expect(result.current.retryCount).toBe(0);
      expect(result.current.isRetrying).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // clearError
  // -------------------------------------------------------------------------

  describe('clearError', () => {
    it('clears lastError', () => {
      const { result } = renderHook(() => useErrorHandling());

      act(() => { result.current.classifyError(new Error('test')); });
      act(() => { result.current.clearError(); });

      expect(result.current.lastError).toBeNull();
    });
  });
});
