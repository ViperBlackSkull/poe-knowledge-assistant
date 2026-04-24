import { useState, useCallback, useMemo, useRef } from 'react';
import type { LLMProvider } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Validation status for an API key.
 */
export type ApiKeyValidationStatus = 'empty' | 'invalid' | 'valid' | 'unknown';

/**
 * Props for the ApiKeyInput component.
 */
export interface ApiKeyInputProps {
  /** Current API key value */
  value: string;
  /** Callback when the API key value changes */
  onChange: (value: string) => void;
  /** The LLM provider this key is for */
  provider: LLMProvider;
  /** Label displayed above the input (defaults to provider-derived label) */
  label?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Whether this provider requires an API key */
  required?: boolean;
  /** Whether the API key was previously set/saved (from server) */
  previouslySet?: boolean;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Additional CSS class names */
  className?: string;
  /** HTML id for the input element */
  id?: string;
  /** Data-testid for testing */
  testId?: string;
}

/**
 * Props for the ApiKeyManager component that handles multiple provider keys.
 */
export interface ApiKeyManagerProps {
  /** Current provider selection */
  currentProvider: LLMProvider;
  /** API key values for each provider */
  apiKeys: Record<string, string>;
  /** Callback when an API key changes */
  onApiKeyChange: (provider: LLMProvider, key: string) => void;
  /** Which providers have keys previously set on the server */
  previouslySetKeys?: Record<string, boolean>;
  /** Whether the component is disabled */
  disabled?: boolean;
  /** Additional CSS class names */
  className?: string;
}

// ---------------------------------------------------------------------------
// API Key Validation Helpers
// ---------------------------------------------------------------------------

/** Validation rules per provider. */
const API_KEY_PATTERNS: Record<LLMProvider, {
  pattern: RegExp | null;
  minLength: number;
  label: string;
  example: string;
  description: string;
}> = {
  openai: {
    pattern: /^sk-[A-Za-z0-9_-]{20,}$/,
    minLength: 20,
    label: 'OpenAI API Key',
    example: 'sk-...',
    description: 'Starts with "sk-" followed by at least 20 characters',
  },
  anthropic: {
    pattern: /^sk-ant-[A-Za-z0-9_-]{20,}$/,
    minLength: 20,
    label: 'Anthropic API Key',
    example: 'sk-ant-...',
    description: 'Starts with "sk-ant-" followed by at least 20 characters',
  },
  ollama: {
    pattern: null,
    minLength: 0,
    label: 'Ollama API Key',
    example: '',
    description: 'Not required for local Ollama instances',
  },
  lmstudio: {
    pattern: null,
    minLength: 0,
    label: 'LM Studio API Key',
    example: '',
    description: 'Not required for local LM Studio instances',
  },
};

/**
 * Validates an API key against provider-specific patterns.
 */
export function validateApiKey(
  provider: LLMProvider,
  key: string,
): ApiKeyValidationStatus {
  const rules = API_KEY_PATTERNS[provider];

  if (!key || key.trim() === '') {
    return 'empty';
  }

  // Local providers don't need validation
  if (!rules.pattern && rules.minLength === 0) {
    return key.length > 0 ? 'valid' : 'empty';
  }

  // Check against pattern if available
  if (rules.pattern) {
    return rules.pattern.test(key) ? 'valid' : 'invalid';
  }

  // Fallback: check minimum length
  return key.length >= rules.minLength ? 'valid' : 'invalid';
}

/**
 * Gets the validation rules for a provider.
 */
export function getProviderKeyRules(provider: LLMProvider) {
  return API_KEY_PATTERNS[provider];
}

// ---------------------------------------------------------------------------
// LocalStorage helpers for API keys
// ---------------------------------------------------------------------------

const API_KEYS_STORAGE_KEY = 'poe-knowledge-assistant-api-keys';

/**
 * API keys stored in localStorage. Keys are obfuscated -- only first 4 and
 * last 4 chars are stored as a "fingerprint" to allow status display without
 * persisting the actual secret.
 */
interface StoredApiKeyFingerprints {
  [provider: string]: {
    /** First 4 chars of the key */
    prefix: string;
    /** Last 4 chars of the key */
    suffix: string;
    /** Total length of the key */
    length: number;
    /** Timestamp when saved */
    savedAt: string;
  };
}

/**
 * Save an API key fingerprint (not the full key) to localStorage.
 * The actual key is only held in component state and sent to the backend.
 */
export function saveApiKeyFingerprint(provider: LLMProvider, key: string): void {
  try {
    const stored = loadApiKeyFingerprints();
    if (key && key.length > 8) {
      stored[provider] = {
        prefix: key.substring(0, 4),
        suffix: key.substring(key.length - 4),
        length: key.length,
        savedAt: new Date().toISOString(),
      };
    } else {
      delete stored[provider];
    }
    localStorage.setItem(API_KEYS_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Remove an API key fingerprint from localStorage.
 */
export function removeApiKeyFingerprint(provider: LLMProvider): void {
  try {
    const stored = loadApiKeyFingerprints();
    delete stored[provider];
    localStorage.setItem(API_KEYS_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Ignore
  }
}

/**
 * Load all API key fingerprints from localStorage.
 */
export function loadApiKeyFingerprints(): StoredApiKeyFingerprints {
  try {
    const raw = localStorage.getItem(API_KEYS_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as StoredApiKeyFingerprints;
    }
  } catch {
    // Ignore
  }
  return {};
}

/**
 * Check if an API key fingerprint exists for a provider.
 */
export function hasStoredApiKey(provider: LLMProvider): boolean {
  const stored = loadApiKeyFingerprints();
  return !!stored[provider];
}

/**
 * Get a masked display version of a stored key fingerprint.
 */
export function getMaskedKeyDisplay(provider: LLMProvider): string | null {
  const stored = loadApiKeyFingerprints();
  const fp = stored[provider];
  if (!fp) return null;
  const masked = '*'.repeat(Math.max(fp.length - 8, 4));
  return `${fp.prefix}${masked}${fp.suffix}`;
}

// ---------------------------------------------------------------------------
// ApiKeyInput Component
// ---------------------------------------------------------------------------

/**
 * ApiKeyInput provides a PoE-themed secure input for API keys with:
 *  - Password-style masked input with show/hide toggle
 *  - Green/red dot indicator for key status
 *  - Secure letter-spacing for hidden text
 *  - Hint text about local storage
 */
export function ApiKeyInput({
  value,
  onChange,
  provider,
  label,
  placeholder,
  required = true,
  previouslySet = false,
  disabled = false,
  className = '',
  id = 'api-key-input',
  testId = 'api-key-input',
}: ApiKeyInputProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const rules = API_KEY_PATTERNS[provider];
  const displayPlaceholder = placeholder ?? `Enter ${rules.label.replace(' API Key', '')} key...`;

  // Real-time validation
  const validationStatus = useMemo<ApiKeyValidationStatus>(() => {
    if (previouslySet && !value) return 'unknown';
    return validateApiKey(provider, value);
  }, [provider, value, previouslySet]);

  // Determine if key is considered "set"
  const isKeySet = validationStatus === 'valid' || validationStatus === 'unknown';

  // Border color based on validation and focus
  const borderStyle = useMemo(() => {
    if (isFocused && isKeySet) {
      return { borderColor: '#44cc66', boxShadow: '0 0 6px rgba(68, 204, 102, 0.3)' };
    }
    if (isFocused) {
      return { borderColor: '#D4A85A', boxShadow: '0 0 8px rgba(212, 168, 90, 0.3)' };
    }
    if (validationStatus === 'invalid') {
      return { borderColor: '#cc4444', boxShadow: '0 0 6px rgba(204, 68, 68, 0.3)' };
    }
    return { borderColor: '#2A2A30', boxShadow: 'none' };
  }, [validationStatus, isFocused, isKeySet]);

  const handleToggleVisibility = useCallback(() => {
    setIsVisible((prev) => !prev);
  }, []);

  const handleFocus = useCallback(() => setIsFocused(true), []);
  const handleBlur = useCallback(() => setIsFocused(false), []);

  const handleClear = useCallback(() => {
    onChange('');
    setIsVisible(false);
    inputRef.current?.focus();
  }, [onChange]);

  return (
    <div className={`w-full ${className}`}>
      {/* Input container */}
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type={isVisible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={displayPlaceholder}
          disabled={disabled}
          autoComplete="off"
          data-lpignore="true"
          data-form-type="other"
          className={`
            w-full text-sm px-3 py-2 pr-20 rounded transition-all duration-200
            outline-none
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            ${value && !isVisible ? 'tracking-[0.2em]' : ''}
          `}
          style={{
            backgroundColor: '#0C0C0E',
            color: '#C8C8C8',
            fontFamily: "'Inter', system-ui, sans-serif",
            letterSpacing: value && !isVisible ? '0.2em' : 'normal',
            ...borderStyle,
            border: `1px solid ${borderStyle.borderColor}`,
          }}
          data-testid={testId}
          aria-label={`${label ?? rules.label} input`}
        />

        {/* Action buttons inside input */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {/* Clear button */}
          {value && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 transition-colors rounded"
              style={{ color: '#6B6B75' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#cc4444'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#6B6B75'; }}
              aria-label="Clear API key"
              title="Clear"
              tabIndex={-1}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}

          {/* Show/Hide toggle */}
          <button
            type="button"
            onClick={handleToggleVisibility}
            className="p-1 transition-colors rounded"
            style={{ color: '#6B6B75' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#D4A85A'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#6B6B75'; }}
            aria-label={isVisible ? 'Hide API key' : 'Show API key'}
            title={isVisible ? 'Hide' : 'Show'}
            tabIndex={-1}
          >
            {isVisible ? (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Hint text */}
      <p
        className="text-[10px] mt-1 leading-tight"
        style={{ color: '#6B6B75', fontFamily: "'Inter', system-ui, sans-serif" }}
      >
        {value && validationStatus === 'invalid'
          ? rules.description
          : required && rules.minLength > 0
            ? 'Required. Stored locally as a fingerprint only'
            : 'Stored locally as a fingerprint only'}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ApiKeyManager Component
// ---------------------------------------------------------------------------

/** Provider display metadata for the key manager. */
const PROVIDER_KEY_INFO: Record<LLMProvider, {
  label: string;
  icon: React.ReactNode;
  requiresKey: boolean;
}> = {
  openai: {
    label: 'OpenAI',
    requiresKey: true,
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" />
      </svg>
    ),
  },
  anthropic: {
    label: 'Anthropic',
    requiresKey: true,
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
      </svg>
    ),
  },
  ollama: {
    label: 'Ollama',
    requiresKey: false,
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 17.25v-.228a4.5 4.5 0 00-.12-1.03l-2.268-9.64a3.375 3.375 0 00-3.285-2.602H7.923a3.375 3.375 0 00-3.285 2.602l-2.268 9.64a4.5 4.5 0 00-.12 1.03v.228m19.5 0a3 3 0 01-3 3H5.25a3 3 0 01-3-3m19.5 0a3 3 0 00-3-3H5.25a3 3 0 00-3 3m16.5 0h.008v.008h-.008v-.008zm-3 0h.008v.008h-.008v-.008z" />
      </svg>
    ),
  },
  lmstudio: {
    label: 'LM Studio',
    requiresKey: false,
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z" />
      </svg>
    ),
  },
};

/**
 * ApiKeyManager provides a multi-provider API key management interface.
 */
export function ApiKeyManager({
  currentProvider,
  apiKeys,
  onApiKeyChange,
  previouslySetKeys = {},
  disabled = false,
  className = '',
}: ApiKeyManagerProps) {
  const [showAllProviders, setShowAllProviders] = useState(false);

  const handleChange = useCallback(
    (provider: LLMProvider, key: string) => {
      onApiKeyChange(provider, key);
    },
    [onApiKeyChange],
  );

  // Determine which providers to show
  const providersToShow: LLMProvider[] = showAllProviders
    ? ['openai', 'anthropic', 'ollama', 'lmstudio']
    : [currentProvider];

  // Check if any non-current providers have keys
  const hasOtherKeys = Object.keys(apiKeys).some(
    (p) => p !== currentProvider && apiKeys[p] && apiKeys[p].length > 0,
  );

  return (
    <div className={`space-y-3 ${className}`} data-testid="api-key-manager">
      {/* Section header */}
      <div className="flex items-center gap-2.5 pb-3" style={{ borderBottom: '1px solid #2A2A30' }}>
        <div className="text-[#6B5530] shrink-0">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
          </svg>
        </div>
        <h3
          className="text-sm font-semibold tracking-[0.12em] uppercase text-[#D4A85A]"
          style={{ fontFamily: "'Cinzel', 'Fontin', Georgia, serif" }}
        >
          API Keys
        </h3>
      </div>

      {/* Provider key inputs */}
      <div className="space-y-4">
        {providersToShow.map((provider) => {
          const info = PROVIDER_KEY_INFO[provider];
          const key = apiKeys[provider] ?? '';
          const isCurrent = provider === currentProvider;
          const maskedDisplay = getMaskedKeyDisplay(provider);
          const isSet = !!previouslySetKeys[provider] || !!maskedDisplay || (key && key.length > 0);

          return (
            <div
              key={provider}
              className="rounded p-3 transition-all duration-200"
              style={{
                backgroundColor: isCurrent ? 'rgba(18, 18, 21, 0.8)' : 'rgba(12, 12, 14, 0.5)',
                border: `1px solid ${isCurrent ? 'rgba(212, 168, 90, 0.2)' : 'rgba(42, 42, 48, 0.5)'}`,
              }}
            >
              {/* Provider header row */}
              <div className="flex items-center gap-2 mb-2">
                <div className={`shrink-0 ${isCurrent ? 'text-[#D4A85A]' : 'text-[#6B6B75]'}`}>
                  {info.icon}
                </div>
                <span
                  className={`text-xs font-medium ${isCurrent ? 'text-[#E0E0E0]' : 'text-[#9F9FA8]'}`}
                  style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
                >
                  {info.label}
                </span>
                {isCurrent && (
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded leading-none"
                    style={{
                      color: '#D4A85A',
                      backgroundColor: 'rgba(212, 168, 90, 0.1)',
                      border: '1px solid rgba(212, 168, 90, 0.2)',
                      fontFamily: "'Inter', system-ui, sans-serif",
                    }}
                  >
                    Active
                  </span>
                )}

                {/* Key status dot */}
                <div className="ml-auto flex items-center gap-1.5">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor: isSet ? '#44cc66' : '#cc4444',
                      boxShadow: isSet
                        ? '0 0 6px rgba(68, 204, 102, 0.5)'
                        : '0 0 6px rgba(204, 68, 68, 0.5)',
                    }}
                  />
                  <span
                    className="text-[10px]"
                    style={{
                      color: isSet ? '#44cc66' : '#cc4444',
                      fontFamily: "'Inter', system-ui, sans-serif",
                    }}
                  >
                    {isSet ? 'Set' : 'Unset'}
                  </span>
                </div>
              </div>

              {/* API Key Input */}
              <ApiKeyInput
                value={key}
                onChange={(newKey) => handleChange(provider, newKey)}
                provider={provider}
                required={info.requiresKey && isCurrent}
                previouslySet={!!previouslySetKeys[provider] || !!maskedDisplay}
                disabled={disabled}
                id={`api-key-${provider}`}
                testId={`api-key-input-${provider}`}
              />
            </div>
          );
        })}
      </div>

      {/* Toggle to show/hide all providers */}
      <button
        type="button"
        onClick={() => setShowAllProviders((prev) => !prev)}
        className="flex items-center gap-2 w-full px-3 py-2 rounded text-xs transition-all duration-200"
        style={{
          color: '#6B6B75',
          backgroundColor: 'rgba(12, 12, 14, 0.3)',
          border: '1px solid rgba(42, 42, 48, 0.3)',
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
        data-testid="api-key-toggle-all-providers"
      >
        <svg
          className={`w-3.5 h-3.5 transition-transform duration-200 ${showAllProviders ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
        {showAllProviders ? 'Show active provider only' : 'Show all providers'}
        {hasOtherKeys && !showAllProviders && (
          <span className="ml-auto text-[10px] text-[#D4A85A]">
            Keys configured for other providers
          </span>
        )}
      </button>

      {/* Security notice */}
      <div
        className="flex items-start gap-2 px-3 py-2 rounded"
        style={{ backgroundColor: 'rgba(12, 12, 14, 0.3)', border: '1px solid rgba(42, 42, 48, 0.3)' }}
      >
        <svg className="w-3.5 h-3.5 shrink-0 text-[#6B5530] mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
        </svg>
        <p
          className="text-[10px] text-[#6B6B75] leading-tight"
          style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
        >
          API keys are stored securely and never persisted in the browser. Only a fingerprint
          is saved locally to remember your configuration.
        </p>
      </div>
    </div>
  );
}
