import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchConfig, updateConfig } from '@/lib/api-client';
import type {
  LLMProvider,
  EmbeddingProvider,
  ConfigUpdateRequest,
  ConfigUpdateResponse,
  GetConfigResponse,
} from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Loading states for the configuration hook.
 * - 'idle'       -- no request in progress
 * - 'loading'    -- initial configuration fetch in progress
 * - 'updating'   -- configuration update (PUT) in progress
 * - 'refreshing' -- re-fetching configuration after an update
 */
export type ConfigLoadingState = 'idle' | 'loading' | 'updating' | 'refreshing';

/**
 * A single recorded configuration error.
 */
export interface ConfigError {
  /** Unique identifier for this error */
  id: string;
  /** Human-readable error message */
  message: string;
  /** ISO 8601 timestamp when the error occurred */
  timestamp: string;
  /** Machine-readable error category */
  type: 'fetch' | 'update' | 'unknown';
}

/**
 * Configuration state derived from the server response.
 * Provides flattened access to the key configuration fields needed
 * by the settings panel components.
 */
export interface ConfigState {
  /** LLM provider (e.g. 'openai', 'ollama') */
  llmProvider: LLMProvider;
  /** Embedding provider (e.g. 'local', 'openai') */
  embeddingProvider: EmbeddingProvider;
  /** Application name */
  appName: string;
  /** Application version */
  appVersion: string;
  /** Environment mode */
  environment: 'development' | 'production' | 'testing';
  /** RAG top-K setting */
  ragTopK: number;
  /** RAG chunk size */
  ragChunkSize: number;
  /** Server host */
  serverHost: string;
  /** Server port */
  serverPort: number;
  /** ChromaDB collection name */
  chromaCollectionName: string;
  /** Whether the initial config has been loaded from the server at least once */
  isLoaded: boolean;
}

/**
 * Options accepted by the useConfig hook.
 */
export interface UseConfigOptions {
  /** Whether to fetch configuration on mount (default: true) */
  autoFetch?: boolean;
  /** Callback invoked when configuration is successfully fetched from the server */
  onConfigFetched?: (config: ConfigState) => void;
  /** Callback invoked when configuration is successfully updated */
  onConfigUpdated?: (response: ConfigUpdateResponse) => void;
  /** Callback invoked when an error occurs */
  onError?: (error: ConfigError) => void;
}

/**
 * State and actions returned by the useConfig hook.
 */
export interface UseConfigReturn {
  // -- Configuration state --
  /** Current configuration state derived from the server */
  config: ConfigState | null;
  /** Raw server response (full shape) */
  rawConfig: GetConfigResponse | null;
  /** Whether the configuration has been loaded from the server */
  isLoaded: boolean;

  // -- Loading state --
  /** Current loading state */
  loadingState: ConfigLoadingState;
  /** Whether any request is currently in progress */
  isLoading: boolean;

  // -- Error state --
  /** Current error, if any */
  error: ConfigError | null;
  /** All errors that have occurred */
  errors: ConfigError[];

  // -- Actions --
  /** Fetch the current configuration from the server */
  fetch: () => Promise<ConfigState | null>;
  /** Update configuration on the server via PUT /api/config */
  save: (updates: ConfigUpdateRequest) => Promise<ConfigUpdateResponse | null>;
  /** Clear the current error */
  clearError: () => void;
  /** Reset all state to initial values */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a unique error ID. */
function generateErrorId(): string {
  return `cfg_err_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Transform the raw GetConfigResponse from the server into the flattened
 * ConfigState shape used by the settings panel components.
 */
function transformConfig(raw: GetConfigResponse): ConfigState {
  return {
    llmProvider: raw.llm_provider,
    embeddingProvider: raw.embedding_provider,
    appName: raw.app_name,
    appVersion: raw.app_version,
    environment: raw.environment,
    ragTopK: raw.rag.top_k,
    ragChunkSize: raw.rag.chunk_size,
    serverHost: raw.server.host,
    serverPort: raw.server.port,
    chromaCollectionName: raw.chromadb.collection_name,
    isLoaded: true,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Centralized state management hook for application configuration.
 *
 * Connects to the /api/config endpoint and provides:
 *  - Current configuration state (LLM provider, embedding provider, RAG settings)
 *  - Loading states for fetch and update operations
 *  - Error states with error history
 *  - Methods to fetch, save, and reset configuration
 *  - Automatic initial fetch on mount (configurable)
 *  - Transformation from raw server response to flat component-friendly shape
 *
 * @param options - Configuration options for the hook
 * @returns Full configuration state and action callbacks
 *
 * @example
 * ```tsx
 * const { config, loadingState, error, save, fetch } = useConfig({
 *   onConfigUpdated: (response) => {
 *     console.log('Updated fields:', response.updated_fields);
 *   },
 * });
 *
 * // Fetch current config
 * await fetch();
 *
 * // Update config
 * const result = await save({
 *   llm_provider: 'ollama',
 *   llm_model: 'llama3',
 * });
 *
 * // Access config state
 * <LLMProviderSelector
 *   provider={config.llmProvider}
 *   onProviderChange={(p) => save({ llm_provider: p })}
 * />
 * ```
 */
export function useConfig(options: UseConfigOptions = {}): UseConfigReturn {
  const {
    autoFetch = true,
    onConfigFetched,
    onConfigUpdated,
    onError,
  } = options;

  // -- Core state --
  const [config, setConfig] = useState<ConfigState | null>(null);
  const [rawConfig, setRawConfig] = useState<GetConfigResponse | null>(null);
  const [loadingState, setLoadingState] = useState<ConfigLoadingState>('idle');
  const [error, setError] = useState<ConfigError | null>(null);
  const [errors, setErrors] = useState<ConfigError[]>([]);

  // -- Refs for stable callback references --
  const isMounted = useRef(true);
  const onConfigFetchedRef = useRef(onConfigFetched);
  onConfigFetchedRef.current = onConfigFetched;
  const onConfigUpdatedRef = useRef(onConfigUpdated);
  onConfigUpdatedRef.current = onConfigUpdated;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // -- Derived state --
  const isLoaded = config?.isLoaded ?? false;
  const isLoading = loadingState !== 'idle';

  // ---------------------------------------------------------------------------
  // Error helper
  // ---------------------------------------------------------------------------

  const createError = useCallback((
    message: string,
    type: ConfigError['type'],
  ): ConfigError => {
    const configError: ConfigError = {
      id: generateErrorId(),
      message,
      timestamp: new Date().toISOString(),
      type,
    };
    return configError;
  }, []);

  // ---------------------------------------------------------------------------
  // Fetch configuration
  // ---------------------------------------------------------------------------

  const fetchConfigFromServer = useCallback(async (): Promise<ConfigState | null> => {
    setLoadingState('loading');

    try {
      const response = await fetchConfig();

      if (!isMounted.current) return null;

      const transformed = transformConfig(response);
      setConfig(transformed);
      setRawConfig(response);
      setError(null);

      onConfigFetchedRef.current?.(transformed);

      return transformed;
    } catch (err) {
      if (!isMounted.current) return null;

      const message =
        err instanceof Error ? err.message : 'Failed to fetch configuration';
      const configError = createError(message, 'fetch');

      setError(configError);
      setErrors((prev) => [...prev, configError]);
      onErrorRef.current?.(configError);

      return null;
    } finally {
      if (isMounted.current) {
        setLoadingState('idle');
      }
    }
  }, [createError]);

  // ---------------------------------------------------------------------------
  // Update configuration
  // ---------------------------------------------------------------------------

  const saveConfig = useCallback(async (
    updates: ConfigUpdateRequest,
  ): Promise<ConfigUpdateResponse | null> => {
    setLoadingState('updating');

    try {
      const response = await updateConfig(updates);

      if (!isMounted.current) return null;

      // Re-fetch configuration to get the latest state after update
      setLoadingState('refreshing');

      try {
        const freshConfig = await fetchConfig();
        if (isMounted.current && freshConfig) {
          const transformed = transformConfig(freshConfig);
          setConfig(transformed);
          setRawConfig(freshConfig);
        }
      } catch {
        // Refresh failed, but the update itself succeeded.
        // The response may contain the updated config.
        if (isMounted.current && response.config) {
          // Use the config from the update response as a fallback
          setConfig((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              ...(updates.llm_provider != null ? { llmProvider: updates.llm_provider } : {}),
              ...(updates.embedding_provider != null ? { embeddingProvider: updates.embedding_provider } : {}),
              isLoaded: true,
            };
          });
        }
      }

      setError(null);
      onConfigUpdatedRef.current?.(response);

      return response;
    } catch (err) {
      if (!isMounted.current) return null;

      const message =
        err instanceof Error ? err.message : 'Failed to update configuration';
      const configError = createError(message, 'update');

      setError(configError);
      setErrors((prev) => [...prev, configError]);
      onErrorRef.current?.(configError);

      return null;
    } finally {
      if (isMounted.current) {
        setLoadingState('idle');
      }
    }
  }, [createError]);

  // ---------------------------------------------------------------------------
  // Clear error
  // ---------------------------------------------------------------------------

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Reset
  // ---------------------------------------------------------------------------

  const reset = useCallback(() => {
    setConfig(null);
    setRawConfig(null);
    setLoadingState('idle');
    setError(null);
    setErrors([]);
  }, []);

  // ---------------------------------------------------------------------------
  // Auto-fetch on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    isMounted.current = true;

    if (autoFetch) {
      fetchConfigFromServer();
    }

    return () => {
      isMounted.current = false;
    };
  }, [autoFetch, fetchConfigFromServer]);

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    // Configuration state
    config,
    rawConfig,
    isLoaded,

    // Loading state
    loadingState,
    isLoading,

    // Error state
    error,
    errors,

    // Actions
    fetch: fetchConfigFromServer,
    save: saveConfig,
    clearError,
    reset,
  };
}
