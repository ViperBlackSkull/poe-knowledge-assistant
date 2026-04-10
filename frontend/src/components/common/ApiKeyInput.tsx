import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
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
// Status indicator sub-component
// ---------------------------------------------------------------------------

function ValidationIndicator({ status, description }: {
  status: ApiKeyValidationStatus;
  description: string;
}) {
  const config: Record<
    ApiKeyValidationStatus,
    { color: string; icon: React.ReactNode; label: string }
  > = {
    empty: {
      color: 'text-poe-text-muted',
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      ),
      label: 'Not set',
    },
    invalid: {
      color: 'text-red-400',
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      ),
      label: 'Invalid format',
    },
    valid: {
      color: 'text-green-400',
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      label: 'Valid',
    },
    unknown: {
      color: 'text-yellow-400',
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
        </svg>
      ),
      label: 'Key configured',
    },
  };

  const { color, icon, label } = config[status];

  return (
    <div className={`flex items-center gap-1.5 text-[11px] ${color}`} title={description}>
      {icon}
      <span>{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ApiKeyInput Component
// ---------------------------------------------------------------------------

/**
 * ApiKeyInput provides a PoE-themed secure input for API keys with:
 *  - Password-style masked input with show/hide toggle
 *  - Provider-specific validation (OpenAI starts with sk-, Anthropic with sk-ant-)
 *  - Real-time validation status indicators
 *  - Visual feedback for valid/invalid/empty states
 *  - Copy and clear actions
 *  - PoE-styled input matching the application theme
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
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const rules = API_KEY_PATTERNS[provider];
  const displayLabel = label ?? rules.label;
  const displayPlaceholder = placeholder ?? `Enter your ${rules.label}`;

  // Real-time validation
  const validationStatus = useMemo<ApiKeyValidationStatus>(() => {
    if (previouslySet && !value) return 'unknown';
    return validateApiKey(provider, value);
  }, [provider, value, previouslySet]);

  // Border color based on validation
  const borderClasses = useMemo(() => {
    if (!isFocused && !value) return 'border-poe-border';
    switch (validationStatus) {
      case 'valid':
        return 'border-green-600 shadow-[0_0_8px_rgba(22,163,74,0.3)]';
      case 'invalid':
        return 'border-red-600 shadow-[0_0_8px_rgba(220,38,38,0.3)]';
      case 'unknown':
        return 'border-yellow-600 shadow-[0_0_8px_rgba(202,138,4,0.3)]';
      default:
        return isFocused ? 'border-poe-gold shadow-poe-glow' : 'border-poe-border';
    }
  }, [validationStatus, isFocused, value]);

  const handleToggleVisibility = useCallback(() => {
    setIsVisible((prev) => !prev);
  }, []);

  const handleFocus = useCallback(() => setIsFocused(true), []);
  const handleBlur = useCallback(() => setIsFocused(false), []);

  const handleCopy = useCallback(async () => {
    if (value && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(value);
        setCopyFeedback('Copied!');
        setTimeout(() => setCopyFeedback(null), 2000);
      } catch {
        setCopyFeedback('Failed');
        setTimeout(() => setCopyFeedback(null), 2000);
      }
    }
  }, [value]);

  const handleClear = useCallback(() => {
    onChange('');
    setIsVisible(false);
    inputRef.current?.focus();
  }, [onChange]);

  // Clear copy feedback on unmount
  useEffect(() => {
    return () => setCopyFeedback(null);
  }, []);

  return (
    <div className={`space-y-1.5 ${className}`}>
      {/* Label row */}
      <div className="flex items-center justify-between">
        <label
          htmlFor={id}
          className="block text-xs text-poe-text-secondary font-medium"
        >
          {displayLabel}
          {required && rules.minLength > 0 && (
            <span className="text-red-400 ml-0.5">*</span>
          )}
          {!required && rules.minLength === 0 && (
            <span className="text-poe-text-muted/60 ml-1 text-[10px]">(optional)</span>
          )}
        </label>
        <ValidationIndicator status={validationStatus} description={rules.description} />
      </div>

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
            poe-input w-full text-sm pr-24
            transition-all duration-200
            ${borderClasses}
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            ${value && !isVisible ? 'font-mono tracking-widest' : ''}
          `}
          data-testid={testId}
          aria-label={`${displayLabel} input`}
          aria-describedby={`${id}-description`}
        />

        {/* Action buttons inside input */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
          {/* Copy feedback toast */}
          {copyFeedback && (
            <span className="text-[10px] text-poe-gold mr-1 animate-pulse">
              {copyFeedback}
            </span>
          )}

          {/* Copy button */}
          {value && (
            <button
              type="button"
              onClick={handleCopy}
              className="p-1 text-poe-text-muted hover:text-poe-text-highlight transition-colors rounded"
              aria-label="Copy API key"
              title="Copy"
              tabIndex={-1}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
              </svg>
            </button>
          )}

          {/* Clear button */}
          {value && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 text-poe-text-muted hover:text-red-400 transition-colors rounded"
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
            className="p-1 text-poe-text-muted hover:text-poe-text-highlight transition-colors rounded"
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

      {/* Helper text */}
      <p id={`${id}-description`} className="text-[10px] text-poe-text-muted leading-tight">
        {rules.description}
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
 * ApiKeyManager provides a multi-provider API key management interface with:
 *  - Provider-specific key input fields that appear based on the selected provider
 *  - Quick access to all provider keys via expandable sections
 *  - Validation status indicators for each key
 *  - Save/restore via localStorage fingerprints
 *  - PoE-styled components matching the application theme
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
      <div className="flex items-start gap-3 mb-3">
        <div className="shrink-0 w-8 h-8 rounded bg-poe-bg-primary border border-poe-border flex items-center justify-center text-poe-gold">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
          </svg>
        </div>
        <div>
          <h3 className="poe-header text-sm font-semibold tracking-wide">API Keys</h3>
          <p className="text-[11px] text-poe-text-muted mt-0.5 leading-tight">
            Configure API keys for your LLM providers
          </p>
        </div>
      </div>

      {/* Provider key inputs */}
      <div className="space-y-4">
        {providersToShow.map((provider) => {
          const info = PROVIDER_KEY_INFO[provider];
          const key = apiKeys[provider] ?? '';
          const isCurrent = provider === currentProvider;
          const maskedDisplay = getMaskedKeyDisplay(provider);

          return (
            <div
              key={provider}
              className={`
                rounded-lg border p-3 transition-all duration-200
                ${isCurrent
                  ? 'bg-poe-bg-card border-poe-gold/30 shadow-[inset_0_0_10px_rgba(0,0,0,0.3)]'
                  : 'bg-poe-bg-primary/50 border-poe-border/50'
                }
              `}
            >
              {/* Provider header */}
              <div className="flex items-center gap-2 mb-2">
                <div className={`shrink-0 ${isCurrent ? 'text-poe-gold' : 'text-poe-text-muted'}`}>
                  {info.icon}
                </div>
                <span className={`text-xs font-medium ${isCurrent ? 'text-poe-text-highlight' : 'text-poe-text-secondary'}`}>
                  {info.label}
                </span>
                {isCurrent && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded border bg-poe-gold/10 text-poe-gold border-poe-gold/30 leading-none">
                    Active
                  </span>
                )}
                {maskedDisplay && !key && (
                  <span className="text-[10px] text-poe-text-muted font-mono ml-auto">
                    {maskedDisplay}
                  </span>
                )}
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
        className="
          flex items-center gap-2 w-full px-3 py-2 rounded text-xs
          text-poe-text-muted hover:text-poe-text-secondary
          bg-poe-bg-primary/30 border border-poe-border/30 hover:border-poe-border
          transition-all duration-200
        "
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
          <span className="ml-auto text-[10px] text-poe-gold">
            Keys configured for other providers
          </span>
        )}
      </button>

      {/* Security notice */}
      <div className="flex items-start gap-2 px-3 py-2 rounded bg-poe-bg-primary/30 border border-poe-border/30">
        <svg className="w-3.5 h-3.5 shrink-0 text-poe-gold mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
        </svg>
        <p className="text-[10px] text-poe-text-muted leading-tight">
          API keys are stored securely and never persisted in the browser. Only a fingerprint
          is saved locally to remember your configuration.
        </p>
      </div>
    </div>
  );
}
