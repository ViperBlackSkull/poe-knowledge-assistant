/**
 * Unit tests for the useConfig hook.
 *
 * Covers:
 *   - Initial state defaults
 *   - Auto-fetch on mount
 *   - Manual fetch (success and error)
 *   - Config save/update flow (success and error)
 *   - clearError and reset
 *   - Loading states
 *   - Callbacks (onConfigFetched, onConfigUpdated, onError)
 *   - autoFetch: false skips initial fetch
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

// Mock the api-client module
const mockFetchConfig = vi.hoisted(() => vi.fn());
const mockUpdateConfig = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-client', () => ({
  fetchConfig: mockFetchConfig,
  updateConfig: mockUpdateConfig,
}));

import { useConfig } from '../useConfig';
import type { GetConfigResponse } from '@/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRawConfig(overrides: Partial<GetConfigResponse> = {}): GetConfigResponse {
  return {
    app_name: 'PoE Knowledge Assistant',
    app_version: '1.0.0',
    environment: 'development',
    llm_provider: 'openai',
    embedding_provider: 'local',
    llm: {
      model: 'gpt-4',
      temperature: 0.7,
      max_tokens: 2048,
    },
    embedding: {
      model: 'all-MiniLM-L6-v2',
      dimension: 384,
    },
    rag: {
      top_k: 5,
      chunk_size: 1000,
      chunk_overlap: 200,
    },
    server: {
      host: 'localhost',
      port: 8460,
    },
    chromadb: {
      host: 'localhost',
      port: 8000,
      collection_name: 'poe_knowledge',
    },
    cors: {
      allowed_origins: ['*'],
    },
    ...overrides,
  } as GetConfigResponse;
}

const mockUpdateResponse = {
  success: true,
  message: 'Configuration updated',
  updated_fields: ['llm_provider'],
  config: { llm_provider: 'ollama' },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchConfig.mockReset();
    mockUpdateConfig.mockReset();
  });

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  describe('initial state', () => {
    it('returns null config when autoFetch is false', () => {
      const { result } = renderHook(() => useConfig({ autoFetch: false }));

      expect(result.current.config).toBeNull();
      expect(result.current.rawConfig).toBeNull();
      expect(result.current.isLoaded).toBe(false);
      expect(result.current.loadingState).toBe('idle');
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.errors).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Auto-fetch on mount
  // -------------------------------------------------------------------------

  describe('auto-fetch on mount', () => {
    it('fetches config automatically when autoFetch is true (default)', async () => {
      const raw = makeRawConfig();
      mockFetchConfig.mockResolvedValueOnce(raw);

      const { result } = renderHook(() => useConfig());

      await waitFor(() => {
        expect(mockFetchConfig).toHaveBeenCalledTimes(1);
      });

      await waitFor(() => {
        expect(result.current.loadingState).toBe('idle');
      });

      expect(result.current.config).not.toBeNull();
      expect(result.current.config!.llmProvider).toBe('openai');
      expect(result.current.config!.appName).toBe('PoE Knowledge Assistant');
      expect(result.current.config!.ragTopK).toBe(5);
      expect(result.current.config!.serverPort).toBe(8460);
      expect(result.current.config!.chromaCollectionName).toBe('poe_knowledge');
      expect(result.current.isLoaded).toBe(true);
      expect(result.current.rawConfig).toEqual(raw);
    });

    it('does not fetch when autoFetch is false', () => {
      renderHook(() => useConfig({ autoFetch: false }));
      expect(mockFetchConfig).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Fetch success
  // -------------------------------------------------------------------------

  describe('fetch() - success', () => {
    it('returns transformed config', async () => {
      const raw = makeRawConfig();
      mockFetchConfig.mockResolvedValueOnce(raw);

      const { result } = renderHook(() => useConfig({ autoFetch: false }));

      let configResult: typeof result.current.config = null;
      await act(async () => {
        configResult = await result.current.fetch();
      });

      expect(configResult).not.toBeNull();
      expect(configResult!.llmProvider).toBe('openai');
    });

    it('calls onConfigFetched callback', async () => {
      const raw = makeRawConfig();
      mockFetchConfig.mockResolvedValueOnce(raw);
      const onConfigFetched = vi.fn();

      const { result } = renderHook(() =>
        useConfig({ autoFetch: false, onConfigFetched }),
      );

      await act(async () => {
        await result.current.fetch();
      });

      expect(onConfigFetched).toHaveBeenCalledTimes(1);
      expect(onConfigFetched).toHaveBeenCalledWith(
        expect.objectContaining({ llmProvider: 'openai' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Fetch error
  // -------------------------------------------------------------------------

  describe('fetch() - error', () => {
    it('sets error state on fetch failure', async () => {
      mockFetchConfig.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useConfig({ autoFetch: false }));

      await act(async () => {
        const res = await result.current.fetch();
        expect(res).toBeNull();
      });

      expect(result.current.error).not.toBeNull();
      expect(result.current.error!.message).toBe('Network error');
      expect(result.current.error!.type).toBe('fetch');
      expect(result.current.errors).toHaveLength(1);
    });

    it('calls onError callback', async () => {
      mockFetchConfig.mockRejectedValueOnce(new Error('Fail'));
      const onError = vi.fn();

      const { result } = renderHook(() =>
        useConfig({ autoFetch: false, onError }),
      );

      await act(async () => {
        await result.current.fetch();
      });

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'fetch' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // save (updateConfig)
  // -------------------------------------------------------------------------

  describe('save()', () => {
    it('saves config and calls onConfigUpdated', async () => {
      const raw = makeRawConfig();
      mockFetchConfig.mockResolvedValue(raw);
      mockUpdateConfig.mockResolvedValueOnce(mockUpdateResponse);
      const onConfigUpdated = vi.fn();

      const { result } = renderHook(() =>
        useConfig({ autoFetch: false, onConfigUpdated }),
      );

      await act(async () => {
        const response = await result.current.save({ llm_provider: 'ollama' });
        expect(response).toEqual(mockUpdateResponse);
      });

      expect(mockUpdateConfig).toHaveBeenCalledWith({ llm_provider: 'ollama' });
      expect(onConfigUpdated).toHaveBeenCalledWith(mockUpdateResponse);
    });

    it('handles update errors', async () => {
      mockUpdateConfig.mockRejectedValueOnce(new Error('Update failed'));
      const onError = vi.fn();

      const { result } = renderHook(() =>
        useConfig({ autoFetch: false, onError }),
      );

      await act(async () => {
        const response = await result.current.save({ llm_provider: 'ollama' });
        expect(response).toBeNull();
      });

      expect(result.current.error).not.toBeNull();
      expect(result.current.error!.type).toBe('update');
      expect(onError).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // clearError
  // -------------------------------------------------------------------------

  describe('clearError', () => {
    it('clears the current error', async () => {
      mockFetchConfig.mockRejectedValueOnce(new Error('Fail'));

      const { result } = renderHook(() => useConfig());

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      act(() => { result.current.clearError(); });
      expect(result.current.error).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // reset
  // -------------------------------------------------------------------------

  describe('reset', () => {
    it('resets all state to initial values', async () => {
      const raw = makeRawConfig();
      mockFetchConfig.mockResolvedValueOnce(raw);

      const { result } = renderHook(() => useConfig());

      await waitFor(() => {
        expect(result.current.config).not.toBeNull();
      });

      act(() => { result.current.reset(); });

      expect(result.current.config).toBeNull();
      expect(result.current.rawConfig).toBeNull();
      expect(result.current.loadingState).toBe('idle');
      expect(result.current.error).toBeNull();
      expect(result.current.errors).toEqual([]);
    });
  });
});
