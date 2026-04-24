/**
 * Unit tests for the API service module.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const originalFetch = globalThis.fetch;

describe('api service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('healthCheck()', () => {
    it('fetches /api/health and returns parsed JSON', async () => {
      const mockData = { status: 'healthy', version: '1.0.0', timestamp: '2025-01-01T00:00:00Z' };
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      const { healthCheck } = await import('../../services/api');
      const result = await healthCheck();

      expect(globalThis.fetch).toHaveBeenCalledWith('/api/health');
      expect(result).toEqual(mockData);
    });
  });

  describe('getRoot()', () => {
    it('fetches /api/ and returns parsed JSON', async () => {
      const mockData = { message: 'PoE API', version: '1.0', status: 'operational' };
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      const { getRoot } = await import('../../services/api');
      const result = await getRoot();

      expect(globalThis.fetch).toHaveBeenCalledWith('/api/');
      expect(result).toEqual(mockData);
    });
  });

  describe('getConfig()', () => {
    it('fetches /api/config and returns parsed JSON', async () => {
      const mockData = { app_name: 'Test', app_version: '1.0', llm_provider: 'openai' };
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      const { getConfig } = await import('../../services/api');
      const result = await getConfig();

      expect(globalThis.fetch).toHaveBeenCalledWith('/api/config');
      expect(result).toEqual(mockData);
    });
  });

  describe('sendChat()', () => {
    it('POSTs to /api/chat with request body and returns response', async () => {
      const request = { message: 'What is Flameblast?', game_version: 'poe2' as const };
      const responseData = {
        message: { role: 'assistant', content: 'Flameblast is...', timestamp: '' },
        conversation_id: 'conv-1',
        sources: [],
        game_version: 'poe2',
        timestamp: '',
      };
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => responseData,
      });

      const { sendChat } = await import('../../services/api');
      const result = await sendChat(request);

      expect(globalThis.fetch).toHaveBeenCalledWith('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      expect(result).toEqual(responseData);
    });
  });

  describe('streamChat()', () => {
    it('parses SSE events and invokes callbacks', async () => {
      const sseData = [
        'event: token\n',
        'data: {"token":"Hello","chunk_index":1}\n',
        '\n',
        'event: token\n',
        'data: {"token":" world","chunk_index":2}\n',
        '\n',
        'event: sources\n',
        'data: {"sources":[{"content":"text","source":"url","relevance_score":0.9}],"conversation_id":"conv-1","document_count":1}\n',
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

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: stream,
      });

      const tokens: string[] = [];
      let sourcesResult: unknown = null;
      let doneResult: unknown = null;

      const { streamChat } = await import('../../services/api');
      await streamChat(
        { message: 'test', game_version: 'poe2' },
        (token: string) => { tokens.push(token); },
        (sources?: unknown[]) => { sourcesResult = sources; },
        (data?: unknown) => { doneResult = data; },
      );

      expect(tokens).toEqual(['Hello', ' world']);
      expect(sourcesResult).toEqual([
        { content: 'text', source: 'url', relevance_score: 0.9 },
      ]);
      expect(doneResult).toEqual({
        conversation_id: 'conv-1',
        game: 'poe2',
        total_chunks: 2,
        timestamp: '2025-01-01T00:00:00Z',
      });

      expect(globalThis.fetch).toHaveBeenCalledWith('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'test', game_version: 'poe2' }),
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

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: stream,
      });

      let errorResult: string | undefined;
      const { streamChat } = await import('../../services/api');
      await streamChat(
        { message: 'test' },
        () => {},
        undefined,
        undefined,
        (error?: string) => { errorResult = error; },
      );

      expect(errorResult).toBe('LLM not ready');
    });

    it('throws when response body is null', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: null,
      });

      const { streamChat } = await import('../../services/api');
      await expect(
        streamChat({ message: 'test' }, () => {}),
      ).rejects.toThrow('ReadableStream not supported');
    });
  });
});
