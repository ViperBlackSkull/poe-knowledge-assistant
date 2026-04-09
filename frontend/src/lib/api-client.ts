/**
 * Reusable API client module built on axios with:
 *   - Base URL configuration from environment variables
 *   - Request/response interceptors for consistent error handling
 *   - Streaming SSE response support via fetch + ReadableStream
 *   - Full TypeScript types imported from @/types
 *   - Automatic API key injection from configuration
 *
 * Usage:
 *   import { apiClient, streamRequest } from '@/lib/api-client';
 *   const health = await apiClient.get<HealthCheckResponse>('/health');
 *   await streamRequest('/chat/stream', body, callbacks);
 */

import axios, {
  type AxiosInstance,
  type AxiosError,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';

import type {
  RootResponse,
  HealthCheckResponse,
  GetConfigResponse,
  ChatRequest,
  ChatResponse,
  ChatStreamRequest,
  SSEEventType,
  SSESourcesEvent,
  SSETokenEvent,
  SSEDoneEvent,
  SSEErrorEvent,
  SSEPartialCompleteEvent,
  ErrorResponse,
  APIError,
} from '@/types';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Base URL for API requests. Reads VITE_API_BASE_URL at build-time or defaults to /api. */
const API_BASE_URL: string =
  (import.meta.env as Record<string, string | undefined>).VITE_API_BASE_URL ?? '/api';

/** Timeout for regular (non-streaming) requests in milliseconds. */
const DEFAULT_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Custom error types
// ---------------------------------------------------------------------------

/**
 * Application-level API error thrown when the backend returns a non-2xx
 * response or when the response body matches the backend error schema.
 */
export class APIClientError extends Error {
  /** HTTP status code (0 when the request never reached the server). */
  public readonly status: number;
  /** Structured error payload from the backend (when available). */
  public readonly detail: string;
  /** Machine-readable error code. */
  public readonly code: string;

  constructor(status: number, detail: string, code: string = 'UNKNOWN') {
    super(detail);
    this.name = 'APIClientError';
    this.status = status;
    this.detail = detail;
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// API key management
// ---------------------------------------------------------------------------

let _apiKey: string | null = null;

/**
 * Set the API key to be automatically injected into every request header.
 *
 * @param key - The API key string, or `null` to clear.
 */
export function setApiKey(key: string | null): void {
  _apiKey = key;
}

/**
 * Retrieve the currently configured API key.
 */
export function getApiKey(): string | null {
  return _apiKey;
}

// ---------------------------------------------------------------------------
// Axios instance & interceptors
// ---------------------------------------------------------------------------

/**
 * Pre-configured axios instance with base URL, default headers, and interceptors.
 */
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: DEFAULT_TIMEOUT_MS,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

/**
 * Request interceptor:
 *  - Injects the API key as `X-API-Key` header when one is configured.
 *  - Logs outgoing request metadata in development.
 */
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Automatic API key injection
    if (_apiKey) {
      config.headers = config.headers ?? {};
      config.headers['X-API-Key'] = _apiKey;
    }

    // Development logging
    if (import.meta.env.DEV) {
      console.debug(
        `[API] ${config.method?.toUpperCase() ?? 'GET'} ${config.baseURL}${config.url}`,
        config.params ? { params: config.params } : '',
      );
    }

    return config;
  },
  (error: unknown) => {
    return Promise.reject(error);
  },
);

/**
 * Build a user-friendly error message from an axios error.
 */
function formatAxiosError(error: AxiosError<ErrorResponse | { detail?: string }>): string {
  if (error.response) {
    const { status, data } = error.response;

    // Structured error from our backend
    if (data && typeof data === 'object') {
      if ('error' in data && data.error) {
        const apiError = data.error as APIError;
        return apiError.detail || apiError.title || `Request failed with status ${status}`;
      }
      if ('detail' in data && typeof data.detail === 'string') {
        return data.detail;
      }
    }

    // Generic HTTP status messages
    switch (status) {
      case 400:
        return 'Bad request. Please check your input and try again.';
      case 401:
        return 'Authentication required. Please check your API key.';
      case 403:
        return 'Access denied. You do not have permission for this action.';
      case 404:
        return 'The requested resource was not found.';
      case 422:
        return 'Validation error. Please check your input data.';
      case 429:
        return 'Too many requests. Please wait and try again.';
      case 500:
        return 'An internal server error occurred. Please try again later.';
      case 502:
        return 'Bad gateway. The upstream service is unavailable.';
      case 503:
        return 'Service unavailable. The server is temporarily overloaded.';
      default:
        return `Request failed with status ${status}`;
    }
  }

  if (error.request) {
    // Request was made but no response was received
    if (error.code === 'ECONNABORTED' || error.code === 'ERR_CANCELED') {
      return 'Request timed out. Please try again.';
    }
    return 'Network error. Please check your connection and try again.';
  }

  // Something went wrong setting up the request
  return error.message || 'An unexpected error occurred.';
}

/**
 * Response interceptor:
 *  - Transforms axios errors into APIClientError instances with user-friendly messages.
 *  - Passes successful responses through unchanged.
 */
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError<ErrorResponse | { detail?: string }>) => {
    const message = formatAxiosError(error);
    const status = error.response?.status ?? 0;
    const code =
      (error.response?.data as { error?: APIError })?.error?.type ??
      error.code ??
      'UNKNOWN';

    return Promise.reject(new APIClientError(status, message, code));
  },
);

// ---------------------------------------------------------------------------
// Convenience request helpers (typed wrappers around apiClient)
// ---------------------------------------------------------------------------

/**
 * Perform a GET request.
 *
 * @example
 * const data = await get<HealthCheckResponse>('/health');
 */
export async function get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response = await apiClient.get<T>(url, config);
  return response.data;
}

/**
 * Perform a POST request.
 *
 * @example
 * const result = await post<ChatResponse, ChatRequest>('/chat', { message: 'Hi' });
 */
export async function post<T, B = unknown>(
  url: string,
  body?: B,
  config?: AxiosRequestConfig,
): Promise<T> {
  const response = await apiClient.post<T>(url, body, config);
  return response.data;
}

/**
 * Perform a PUT request.
 */
export async function put<T, B = unknown>(
  url: string,
  body?: B,
  config?: AxiosRequestConfig,
): Promise<T> {
  const response = await apiClient.put<T>(url, body, config);
  return response.data;
}

/**
 * Perform a PATCH request.
 */
export async function patch<T, B = unknown>(
  url: string,
  body?: B,
  config?: AxiosRequestConfig,
): Promise<T> {
  const response = await apiClient.patch<T>(url, body, config);
  return response.data;
}

/**
 * Perform a DELETE request.
 */
export async function del<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response = await apiClient.delete<T>(url, config);
  return response.data;
}

// ---------------------------------------------------------------------------
// Streaming (SSE) support
// ---------------------------------------------------------------------------

/** Callbacks for handling SSE events during a streaming request. */
export interface StreamCallbacks {
  /** Called for each token event. */
  onToken?: (event: SSETokenEvent) => void;
  /** Called when sources are retrieved (usually the first event). */
  onSources?: (event: SSESourcesEvent) => void;
  /** Called when the stream completes successfully. */
  onDone?: (event: SSEDoneEvent) => void;
  /** Called when an error event is received from the server. */
  onError?: (event: SSEErrorEvent) => void;
  /** Called when the stream is interrupted with partial content. */
  onPartialComplete?: (event: SSEPartialCompleteEvent) => void;
}

/**
 * Parse a single SSE data payload from raw text.
 */
function parseSSEData<T = unknown>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    console.warn('[SSE] Failed to parse event data:', raw);
    return null;
  }
}

/**
 * Send a POST request and process the response as an SSE stream.
 *
 * Uses the native Fetch API + ReadableStream rather than axios because
 * axios does not natively support streaming response bodies.
 *
 * @param path   - API path (appended to API_BASE_URL).
 * @param body   - JSON-serialisable request body.
 * @param callbacks - Handlers for each SSE event type.
 * @param signal - Optional AbortSignal for cancellation.
 *
 * @example
 * await streamRequest(
 *   '/chat/stream',
 *   { message: 'What are the best witch builds?' },
 *   {
 *     onSources:  (e) => setSources(e.sources),
 *     onToken:    (e) => appendToken(e.token),
 *     onDone:     (e) => setConversationId(e.conversation_id),
 *     onError:    (e) => showError(e.error),
 *   },
 * );
 */
export async function streamRequest(
  path: string,
  body: ChatStreamRequest | Record<string, unknown>,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const url = `${API_BASE_URL}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };

  // Inject API key into streaming requests as well
  if (_apiKey) {
    headers['X-API-Key'] = _apiKey;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    let detail = `Request failed with status ${response.status}`;
    try {
      const errorBody = (await response.json()) as ErrorResponse | { detail?: string };
      if ('error' in errorBody && errorBody.error) {
        detail = errorBody.error.detail || errorBody.error.title || detail;
      } else if ('detail' in errorBody && typeof errorBody.detail === 'string') {
        detail = errorBody.detail;
      }
    } catch {
      // response body was not JSON
    }
    throw new APIClientError(response.status, detail);
  }

  if (!response.body) {
    throw new APIClientError(0, 'ReadableStream is not supported in this browser.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent: SSEEventType | '' = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // Keep the last (potentially incomplete) line in the buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.startsWith('event:')) {
          currentEvent = trimmed.slice(6).trim() as SSEEventType;
        } else if (trimmed.startsWith('data:')) {
          const rawData = trimmed.slice(5).trim();
          const data = parseSSEData(rawData);
          if (!data) continue;

          switch (currentEvent) {
            case 'token':
              callbacks.onToken?.(data as SSETokenEvent);
              break;
            case 'sources':
              callbacks.onSources?.(data as SSESourcesEvent);
              break;
            case 'done':
              callbacks.onDone?.(data as SSEDoneEvent);
              break;
            case 'error':
              callbacks.onError?.(data as SSEErrorEvent);
              break;
            case 'partial_complete':
              callbacks.onPartialComplete?.(data as SSEPartialCompleteEvent);
              break;
            default:
              // Unknown event type -- ignore or log in dev
              if (import.meta.env.DEV) {
                console.debug(`[SSE] Unknown event type: ${currentEvent}`, data);
              }
          }

          // Reset event after processing data
          currentEvent = '';
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// High-level API methods (domain-specific helpers)
// ---------------------------------------------------------------------------

/** Fetch the API root information. */
export async function fetchRoot(): Promise<RootResponse> {
  return get<RootResponse>('/');
}

/** Perform a health check. */
export async function fetchHealth(): Promise<HealthCheckResponse> {
  return get<HealthCheckResponse>('/health');
}

/** Fetch the current application configuration. */
export async function fetchConfig(): Promise<GetConfigResponse> {
  return get<GetConfigResponse>('/config');
}

/** Send a non-streaming chat message. */
export async function sendChat(request: ChatRequest): Promise<ChatResponse> {
  return post<ChatResponse, ChatRequest>('/chat', request);
}

/** Stream a chat response via SSE. */
export async function streamChat(
  request: ChatStreamRequest,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  return streamRequest('/chat/stream', request, callbacks, signal);
}
