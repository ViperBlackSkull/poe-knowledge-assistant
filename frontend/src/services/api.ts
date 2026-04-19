// API service for communicating with the backend
// Uses TypeScript types from src/types for full type safety

import type {
  RootResponse,
  HealthCheckResponse,
  GetConfigResponse,
  ChatStreamRequest,
  ChatRequest,
  ChatResponse,
} from '../types';

const API_BASE_URL = '/api';

// ---------------------------------------------------------------------------
// Health & status
// ---------------------------------------------------------------------------

export async function healthCheck(): Promise<HealthCheckResponse> {
  const response = await fetch(`${API_BASE_URL}/health`);
  return response.json();
}

export async function getRoot(): Promise<RootResponse> {
  const response = await fetch(`${API_BASE_URL}/`);
  return response.json();
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export async function getConfig(): Promise<GetConfigResponse> {
  const response = await fetch(`${API_BASE_URL}/config`);
  return response.json();
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export async function sendChat(request: ChatRequest): Promise<ChatResponse> {
  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return response.json();
}

export async function streamChat(
  request: ChatStreamRequest,
  onToken: (token: string) => void,
  onSources?: (sources: unknown[]) => void,
  onDone?: (data: unknown) => void,
  onError?: (error: string) => void,
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.body) {
    throw new Error('ReadableStream not supported');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    let currentEvent = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6));
        switch (currentEvent) {
          case 'token':
            onToken(data.token);
            break;
          case 'sources':
            onSources?.(data.sources);
            break;
          case 'done':
            onDone?.(data);
            break;
          case 'error':
            onError?.(data.error);
            break;
        }
      }
    }
  }
}
