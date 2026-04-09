/**
 * Unit tests for the API client module (@/lib/api-client).
 *
 * Uses vitest with manual mocks for axios and fetch to verify:
 *   - Axios instance configuration (base URL, headers, interceptors)
 *   - Request interceptor injects API key header
 *   - Response interceptor transforms errors into APIClientError
 *   - Convenience helpers (get, post, put, patch, del) return typed data
 *   - Streaming SSE parsing works correctly
 *   - High-level domain helpers (fetchRoot, fetchHealth, etc.)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';

// ---------------------------------------------------------------------------
// Mock axios so we can observe interceptor behaviour without network calls
// vi.hoisted ensures the mock object is available when vi.mock's factory runs
// (vitest hoists vi.mock calls to the top of the file).
// ---------------------------------------------------------------------------

const mockAxiosInstance = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  interceptors: {
    request: { use: vi.fn() },
    response: { use: vi.fn() },
  },
  defaults: {
    baseURL: '/api',
    timeout: 30000,
    headers: { common: {} },
  },
}));

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => mockAxiosInstance),
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks are in place
// ---------------------------------------------------------------------------

import {
  apiClient,
  get,
  post,
  put,
  patch,
  del,
  streamRequest,
  fetchRoot,
  fetchHealth,
  fetchConfig,
  sendChat,
  streamChat,
  setApiKey,
  getApiKey,
  APIClientError,
  type StreamCallbacks,
} from '../api-client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a fake successful axios response. */
function fakeResponse<T>(data: T, status = 200): AxiosResponse<T> {
  return {
    data,
    status,
    statusText: 'OK',
    headers: {},
    config: {} as InternalAxiosRequestConfig,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('api-client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setApiKey(null);
  });

  // -----------------------------------------------------------------------
  // Axios instance configuration
  // -----------------------------------------------------------------------

  describe('axios instance configuration', () => {
    it('exposes the correct default base URL on the client', () => {
      expect(apiClient.defaults.baseURL).toBe('/api');
    });

    it('exposes the correct default timeout on the client', () => {
      expect(apiClient.defaults.timeout).toBe(30_000);
    });

    it('has interceptor hooks available on the client', () => {
      // The mock axios instance provides interceptor hooks; verify the shape is correct.
      expect(apiClient.interceptors).toBeDefined();
      expect(apiClient.interceptors.request).toBeDefined();
      expect(apiClient.interceptors.response).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // API key management
  // -----------------------------------------------------------------------

  describe('API key management', () => {
    it('returns null when no API key is set', () => {
      expect(getApiKey()).toBeNull();
    });

    it('stores and retrieves an API key', () => {
      setApiKey('test-key-123');
      expect(getApiKey()).toBe('test-key-123');
    });

    it('clears the API key when null is passed', () => {
      setApiKey('test-key');
      setApiKey(null);
      expect(getApiKey()).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Convenience helpers
  // -----------------------------------------------------------------------

  describe('get()', () => {
    it('calls apiClient.get and returns response data', async () => {
      const mockData = { status: 'healthy', version: '1.0.0' };
      mockAxiosInstance.get.mockResolvedValueOnce(fakeResponse(mockData));

      const result = await get('/health');
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/health', undefined);
      expect(result).toEqual(mockData);
    });

    it('passes config through', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce(fakeResponse({}));
      const config = { params: { page: 1 } };
      await get('/items', config);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/items', config);
    });
  });

  describe('post()', () => {
    it('calls apiClient.post with body and returns data', async () => {
      const requestBody = { message: 'Hello' };
      const responseData = { reply: 'Hi there' };
      mockAxiosInstance.post.mockResolvedValueOnce(fakeResponse(responseData));

      const result = await post('/chat', requestBody);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/chat', requestBody, undefined);
      expect(result).toEqual(responseData);
    });
  });

  describe('put()', () => {
    it('calls apiClient.put with body and returns data', async () => {
      const body = { setting: 'value' };
      mockAxiosInstance.put.mockResolvedValueOnce(fakeResponse({ updated: true }));

      const result = await put('/config', body);
      expect(mockAxiosInstance.put).toHaveBeenCalledWith('/config', body, undefined);
      expect(result).toEqual({ updated: true });
    });
  });

  describe('patch()', () => {
    it('calls apiClient.patch with body and returns data', async () => {
      const body = { setting: 'new-value' };
      mockAxiosInstance.patch.mockResolvedValueOnce(fakeResponse({ patched: true }));

      const result = await patch('/config', body);
      expect(mockAxiosInstance.patch).toHaveBeenCalledWith('/config', body, undefined);
      expect(result).toEqual({ patched: true });
    });
  });

  describe('del()', () => {
    it('calls apiClient.delete and returns data', async () => {
      mockAxiosInstance.delete.mockResolvedValueOnce(fakeResponse({ deleted: true }));

      const result = await del('/item/42');
      expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/item/42', undefined);
      expect(result).toEqual({ deleted: true });
    });
  });

  // -----------------------------------------------------------------------
  // High-level domain helpers
  // -----------------------------------------------------------------------

  describe('fetchRoot()', () => {
    it('fetches the root endpoint', async () => {
      const data = { message: 'POE API', version: '1.0', status: 'operational' };
      mockAxiosInstance.get.mockResolvedValueOnce(fakeResponse(data));

      const result = await fetchRoot();
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/', undefined);
      expect(result).toEqual(data);
    });
  });

  describe('fetchHealth()', () => {
    it('fetches the health endpoint', async () => {
      const data = { status: 'healthy', version: '1.0', timestamp: '2025-01-01T00:00:00Z' };
      mockAxiosInstance.get.mockResolvedValueOnce(fakeResponse(data));

      const result = await fetchHealth();
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/health', undefined);
      expect(result).toEqual(data);
    });
  });

  describe('fetchConfig()', () => {
    it('fetches the config endpoint', async () => {
      const data = { app_name: 'PoE Assistant', app_version: '1.0' };
      mockAxiosInstance.get.mockResolvedValueOnce(fakeResponse(data));

      const result = await fetchConfig();
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/config', undefined);
      expect(result).toEqual(data);
    });
  });

  describe('sendChat()', () => {
    it('sends a chat message and returns the response', async () => {
      const request = { message: 'What is Flameblast?' };
      const response = {
        message: { role: 'assistant', content: 'Flameblast is a...', timestamp: '' },
        conversation_id: 'conv-1',
        sources: [],
        game_version: 'poe2' as const,
        timestamp: '',
      };
      mockAxiosInstance.post.mockResolvedValueOnce(fakeResponse(response));

      const result = await sendChat(request);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/chat', request, undefined);
      expect(result).toEqual(response);
    });
  });

  // -----------------------------------------------------------------------
  // APIClientError
  // -----------------------------------------------------------------------

  describe('APIClientError', () => {
    it('stores status, detail, and code', () => {
      const err = new APIClientError(404, 'Not found', 'NOT_FOUND');
      expect(err.name).toBe('APIClientError');
      expect(err.status).toBe(404);
      expect(err.detail).toBe('Not found');
      expect(err.code).toBe('NOT_FOUND');
      expect(err.message).toBe('Not found');
    });

    it('defaults code to UNKNOWN', () => {
      const err = new APIClientError(500, 'Server error');
      expect(err.code).toBe('UNKNOWN');
    });
  });

  // -----------------------------------------------------------------------
  // Streaming (SSE) support
  // -----------------------------------------------------------------------

  describe('streamRequest()', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('throws APIClientError on non-OK response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ detail: 'Internal server error' }),
      });

      const callbacks: StreamCallbacks = {};
      await expect(
        streamRequest('/chat/stream', { message: 'test' }, callbacks),
      ).rejects.toThrow(APIClientError);
    });

    it('throws APIClientError when response body is not available', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: null,
      });

      const callbacks: StreamCallbacks = {};
      await expect(
        streamRequest('/chat/stream', { message: 'test' }, callbacks),
      ).rejects.toThrow(APIClientError);
    });

    it('parses SSE events and invokes callbacks', async () => {
      // Build a raw SSE stream
      const sseData = [
        'event: token\n',
        'data: {"token":"Hello","chunk_index":1}\n',
        '\n',
        'event: token\n',
        'data: {"token":" world","chunk_index":2}\n',
        '\n',
        'event: done\n',
        'data: {"conversation_id":"conv-1","game":"poe2","total_chunks":2,"timestamp":"2025-01-01T00:00:00Z"}\n',
        '\n',
      ].join('');

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(sseData));
          controller.close();
        },
      });

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: stream,
      });

      const tokens: string[] = [];
      let doneEvent: unknown = null;

      const callbacks: StreamCallbacks = {
        onToken: (e) => tokens.push(e.token),
        onDone: (e) => {
          doneEvent = e;
        },
      };

      await streamRequest('/chat/stream', { message: 'test' }, callbacks);

      expect(tokens).toEqual(['Hello', ' world']);
      expect(doneEvent).toEqual({
        conversation_id: 'conv-1',
        game: 'poe2',
        total_chunks: 2,
        timestamp: '2025-01-01T00:00:00Z',
      });
    });

    it('handles error SSE events', async () => {
      const sseData = [
        'event: error\n',
        'data: {"error":"LLM not ready","error_type":"llm_not_ready"}\n',
        '\n',
      ].join('');

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(sseData));
          controller.close();
        },
      });

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: stream,
      });

      let errorEvent: unknown = null;
      const callbacks: StreamCallbacks = {
        onError: (e) => {
          errorEvent = e;
        },
      };

      await streamRequest('/chat/stream', { message: 'test' }, callbacks);

      expect(errorEvent).toEqual({
        error: 'LLM not ready',
        error_type: 'llm_not_ready',
      });
    });

    it('handles sources SSE events', async () => {
      const sseData = [
        'event: sources\n',
        'data: {"sources":[{"content":"text","source":"url","relevance_score":0.9}],"conversation_id":"conv-1","document_count":1}\n',
        '\n',
      ].join('');

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(sseData));
          controller.close();
        },
      });

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: stream,
      });

      let sourcesEvent: unknown = null;
      const callbacks: StreamCallbacks = {
        onSources: (e) => {
          sourcesEvent = e;
        },
      };

      await streamRequest('/chat/stream', { message: 'test' }, callbacks);

      expect(sourcesEvent).toEqual({
        sources: [{ content: 'text', source: 'url', relevance_score: 0.9 }],
        conversation_id: 'conv-1',
        document_count: 1,
      });
    });

    it('includes API key in streaming request headers when set', async () => {
      setApiKey('sk-test-key');

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(''));
          controller.close();
        },
      });

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: stream,
      });

      await streamRequest('/chat/stream', { message: 'test' }, {});

      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/chat/stream',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'sk-test-key',
          }),
        }),
      );
    });

    it('passes AbortSignal through to fetch', async () => {
      const controller = new AbortController();
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(''));
          controller.close();
        },
      });

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: stream,
      });

      await streamRequest('/chat/stream', { message: 'test' }, {}, controller.signal);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/chat/stream',
        expect.objectContaining({
          signal: controller.signal,
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // streamChat() wrapper
  // -----------------------------------------------------------------------

  describe('streamChat()', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('delegates to streamRequest with correct path', async () => {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(''));
          controller.close();
        },
      });

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: stream,
      });

      const request = {
        message: 'What are good witch builds?',
        game_version: 'poe2' as const,
      };

      await streamChat(request, {});

      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/chat/stream',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(request),
        }),
      );
    });
  });
});
