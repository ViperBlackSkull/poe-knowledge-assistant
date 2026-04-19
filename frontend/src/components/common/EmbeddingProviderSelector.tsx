import { useState, useRef, useEffect, useCallback } from 'react';
import type { EmbeddingProvider } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Describes a selectable embedding provider option.
 */
export interface EmbeddingProviderOption {
  /** Machine-readable provider value */
  value: EmbeddingProvider;
  /** Human-readable label */
  label: string;
  /** Short description */
  description: string;
  /** Whether this provider requires an API key */
  requiresApiKey: boolean;
  /** Icon identifier for rendering */
  icon: 'cpu' | 'cloud' | 'server' | 'local';
}

/**
 * Describes a model available for a given embedding provider.
 */
export interface EmbeddingModelOption {
  /** Model identifier */
  value: string;
  /** Display name */
  label: string;
  /** Optional tag (e.g. "Recommended", "Fast") */
  tag?: string;
  /** Embedding dimension */
  dimension?: number;
}

/**
 * Props for the EmbeddingProviderSelector component.
 */
export interface EmbeddingProviderSelectorProps {
  /** Currently selected embedding provider */
  provider: EmbeddingProvider;
  /** Currently selected model */
  model: string;
  /** Callback when the provider changes */
  onProviderChange: (provider: EmbeddingProvider) => void;
  /** Callback when the model changes */
  onModelChange: (model: string) => void;
  /** Optional additional CSS class names */
  className?: string;
  /** Whether the selector is disabled */
  disabled?: boolean;
}

/**
 * Describes a provider-specific configuration field for embedding providers.
 */
export interface EmbeddingProviderConfigField {
  key: string;
  label: string;
  type: 'text' | 'number';
  placeholder: string;
  optional: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Available embedding provider options with metadata. */
export const EMBEDDING_PROVIDER_OPTIONS: EmbeddingProviderOption[] = [
  {
    value: 'local',
    label: 'Local',
    description: 'Built-in sentence-transformers embeddings',
    requiresApiKey: false,
    icon: 'cpu',
  },
  {
    value: 'openai',
    label: 'OpenAI',
    description: 'OpenAI text-embedding models',
    requiresApiKey: true,
    icon: 'cloud',
  },
  {
    value: 'ollama',
    label: 'Ollama',
    description: 'Run embedding models locally with Ollama',
    requiresApiKey: false,
    icon: 'server',
  },
  {
    value: 'lmstudio',
    label: 'LM Studio',
    description: 'Local embeddings via LM Studio server',
    requiresApiKey: false,
    icon: 'local',
  },
];

/** Models available for each embedding provider. */
export const EMBEDDING_MODELS_BY_PROVIDER: Record<EmbeddingProvider, EmbeddingModelOption[]> = {
  local: [
    { value: 'all-MiniLM-L6-v2', label: 'all-MiniLM-L6-v2', tag: 'Recommended', dimension: 384 },
    { value: 'all-mpnet-base-v2', label: 'all-mpnet-base-v2', tag: 'High Quality', dimension: 768 },
  ],
  openai: [
    { value: 'text-embedding-3-small', label: 'Text Embedding 3 Small', tag: 'Recommended', dimension: 1536 },
    { value: 'text-embedding-3-large', label: 'Text Embedding 3 Large', tag: 'High Quality', dimension: 3072 },
    { value: 'text-embedding-ada-002', label: 'Ada 002', tag: 'Legacy', dimension: 1536 },
  ],
  ollama: [
    { value: 'nomic-embed-text', label: 'Nomic Embed Text', tag: 'Popular', dimension: 768 },
    { value: 'mxbai-embed-large', label: 'MXBai Embed Large', tag: 'High Quality', dimension: 1024 },
  ],
  lmstudio: [
    { value: 'text-embedding-model', label: 'Default Embedding Model', tag: 'Default' },
  ],
};

/**
 * Get the default model for a given embedding provider.
 */
export function getDefaultEmbeddingModel(provider: EmbeddingProvider): string {
  const models = EMBEDDING_MODELS_BY_PROVIDER[provider];
  return models.length > 0 ? models[0].value : '';
}

/**
 * Get a display label for a given embedding provider value.
 */
export function getEmbeddingProviderLabel(provider: EmbeddingProvider): string {
  const option = EMBEDDING_PROVIDER_OPTIONS.find((o) => o.value === provider);
  return option?.label ?? provider;
}

/**
 * Get provider-specific configuration fields for embedding providers.
 */
export function getEmbeddingProviderConfigFields(provider: EmbeddingProvider): EmbeddingProviderConfigField[] {
  switch (provider) {
    case 'openai':
      return [
        { key: 'baseUrl', label: 'Base URL', type: 'text', placeholder: 'https://api.openai.com/v1', optional: true },
        { key: 'dimensions', label: 'Dimensions', type: 'number', placeholder: '1536', optional: true },
      ];
    case 'ollama':
      return [
        { key: 'baseUrl', label: 'Ollama URL', type: 'text', placeholder: 'http://localhost:11434', optional: false },
      ];
    case 'lmstudio':
      return [
        { key: 'baseUrl', label: 'LM Studio URL', type: 'text', placeholder: 'http://localhost:1234/v1', optional: false },
      ];
    case 'local':
      return [
        { key: 'cacheDir', label: 'Cache Directory', type: 'text', placeholder: '~/.cache/embeddings', optional: true },
      ];
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Renders an icon for the embedding provider type. */
function EmbeddingProviderIcon({ icon, className = '' }: { icon: EmbeddingProviderOption['icon']; className?: string }) {
  switch (icon) {
    case 'cpu':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z" />
        </svg>
      );
    case 'cloud':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" />
        </svg>
      );
    case 'server':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 17.25v-.228a4.5 4.5 0 00-.12-1.03l-2.268-9.64a3.375 3.375 0 00-3.285-2.602H7.923a3.375 3.375 0 00-3.285 2.602l-2.268 9.64a4.5 4.5 0 00-.12 1.03v.228m19.5 0a3 3 0 01-3 3H5.25a3 3 0 01-3-3m19.5 0a3 3 0 00-3-3H5.25a3 3 0 00-3 3m16.5 0h.008v.008h-.008v-.008zm-3 0h.008v.008h-.008v-.008z" />
        </svg>
      );
    case 'local':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
        </svg>
      );
  }
}

// ---------------------------------------------------------------------------
// PoE-styled select dropdown for embedding providers
// ---------------------------------------------------------------------------

interface PoEEmbeddingSelectProps<T extends string> {
  id: string;
  value: T;
  options: { value: T; label: string; description?: string; icon?: EmbeddingProviderOption['icon']; tag?: string; dimension?: number }[];
  onChange: (value: T) => void;
  headerLabel: string;
  disabled?: boolean;
  showIcon?: boolean;
}

function PoEEmbeddingSelect<T extends string>({
  id,
  value,
  options,
  onChange,
  headerLabel,
  disabled = false,
  showIcon = false,
}: PoEEmbeddingSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(
    options.findIndex((o) => o.value === value),
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const optionsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const selectedOption = options.find((o) => o.value === value);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Reset highlighted index when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setHighlightedIndex(options.findIndex((o) => o.value === value));
    }
  }, [isOpen, value, options]);

  const handleToggle = useCallback(() => {
    if (!disabled) {
      setIsOpen((prev) => !prev);
    }
  }, [disabled]);

  const handleSelect = useCallback(
    (optionValue: T) => {
      onChange(optionValue);
      setIsOpen(false);
    },
    [onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (!isOpen) {
            setIsOpen(true);
          } else {
            const highlighted = options[highlightedIndex];
            if (highlighted) {
              handleSelect(highlighted.value);
            }
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (!isOpen) {
            setIsOpen(true);
          } else {
            setHighlightedIndex((prev) =>
              prev < options.length - 1 ? prev + 1 : 0,
            );
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (isOpen) {
            setHighlightedIndex((prev) =>
              prev > 0 ? prev - 1 : options.length - 1,
            );
          }
          break;
        case 'Escape':
          e.preventDefault();
          setIsOpen(false);
          break;
      }
    },
    [isOpen, highlightedIndex, options, handleSelect],
  );

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && optionsRef.current[highlightedIndex]) {
      optionsRef.current[highlightedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [isOpen, highlightedIndex]);

  return (
    <div ref={containerRef} className="relative w-full" data-testid={`${id}-selector`}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={`
          flex items-center gap-2 w-full px-3 py-2 rounded text-sm
          transition-all duration-200 border
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
        style={{
          backgroundColor: '#0C0C0E',
          fontFamily: "'Inter', system-ui, sans-serif",
          color: isOpen ? '#E0E0E0' : '#9F9FA8',
          borderColor: isOpen ? '#D4A85A' : '#2A2A30',
          boxShadow: isOpen ? '0 0 8px rgba(212, 168, 90, 0.3)' : 'none',
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Select ${headerLabel}, currently ${selectedOption?.label ?? value}`}
        data-testid={`${id}-trigger`}
      >
        {/* Provider icon */}
        {showIcon && selectedOption?.icon && (
          <EmbeddingProviderIcon icon={selectedOption.icon} className="w-4 h-4 text-[#D4A85A] shrink-0" />
        )}

        {/* Selected label */}
        <span className="flex-1 text-left whitespace-nowrap truncate">
          {selectedOption?.label ?? value}
        </span>

        {/* Chevron icon */}
        <svg
          className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          style={{ color: '#6B6B75' }}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          className="absolute left-0 right-0 mt-1 rounded-lg overflow-hidden z-50"
          style={{
            backgroundColor: '#141418',
            border: '1px solid #2A2A30',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
          }}
          role="listbox"
          aria-label={`${headerLabel} options`}
          data-testid={`${id}-dropdown`}
        >
          {/* Dropdown header */}
          <div className="px-3 py-2" style={{ borderBottom: '1px solid #2A2A30', backgroundColor: '#0C0C0E' }}>
            <span
              className="text-[10px] text-[#6B5530] font-semibold uppercase tracking-[0.1em]"
              style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
            >
              {headerLabel}
            </span>
          </div>

          {/* Options list */}
          <div className="py-1 max-h-64 overflow-y-auto">
            {options.map((option, index) => {
              const isSelected = option.value === value;
              const isHighlighted = index === highlightedIndex;

              return (
                <button
                  key={String(option.value)}
                  ref={(el) => {
                    optionsRef.current[index] = el;
                  }}
                  type="button"
                  onClick={() => handleSelect(option.value)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`
                    w-full text-left px-3 py-2.5 flex items-center gap-3
                    transition-colors duration-100
                  `}
                  style={{
                    backgroundColor: isHighlighted ? '#1C1C22' : 'transparent',
                    color: isSelected ? '#D4A85A' : '#9F9FA8',
                  }}
                  role="option"
                  aria-selected={isSelected}
                  data-testid={`${id}-option-${String(option.value)}`}
                >
                  {/* Selection dot */}
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{
                    backgroundColor: isSelected ? '#D4A85A' : 'transparent',
                    boxShadow: isSelected ? '0 0 4px rgba(212, 168, 90, 0.5)' : 'none',
                  }} />

                  {/* Icon */}
                  {showIcon && option.icon && (
                    <EmbeddingProviderIcon
                      icon={option.icon}
                      className={`w-4 h-4 shrink-0 ${isSelected ? 'text-[#D4A85A]' : 'text-[#6B6B75]'}`}
                    />
                  )}

                  {/* Option content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm truncate" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
                        {option.label}
                      </span>
                      {option.tag && (
                        <span
                          className="text-[9px] px-1.5 py-0.5 rounded leading-none shrink-0"
                          style={{
                            color: '#D4A85A',
                            backgroundColor: 'rgba(212, 168, 90, 0.1)',
                            border: '1px solid rgba(212, 168, 90, 0.2)',
                            fontFamily: "'Inter', system-ui, sans-serif",
                          }}
                        >
                          {option.tag}
                        </span>
                      )}
                    </div>
                    {option.description && (
                      <div
                        className="text-[11px] mt-0.5 truncate"
                        style={{ color: '#6B6B75', fontFamily: "'Inter', system-ui, sans-serif" }}
                      >
                        {option.description}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Embedding provider-specific configuration section
// ---------------------------------------------------------------------------

export interface EmbeddingProviderConfigProps {
  provider: EmbeddingProvider;
  config: Record<string, string>;
  onConfigChange: (key: string, value: string) => void;
}

/**
 * Renders provider-specific configuration fields for embedding providers.
 * Shows different options based on the selected provider.
 */
export function EmbeddingProviderConfigSection({ provider, config, onConfigChange }: EmbeddingProviderConfigProps) {
  const fields = getEmbeddingProviderConfigFields(provider);

  if (fields.length === 0) return null;

  return (
    <div className="space-y-2 mt-2" data-testid="embedding-provider-config-section">
      {fields.map((field) => (
        <div key={field.key} className="flex items-center gap-0">
          <label
            htmlFor={`embedding-config-${field.key}`}
            className="w-[100px] shrink-0 text-right text-xs text-[#9F9FA8] self-center leading-tight pr-3"
            style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
          >
            {field.label}
            {field.optional && <span className="text-[#4A3A28] ml-1 text-[10px]">(opt)</span>}
          </label>
          <div className="flex-1">
            <input
              id={`embedding-config-${field.key}`}
              type={field.type}
              value={config[field.key] ?? ''}
              onChange={(e) => onConfigChange(field.key, e.target.value)}
              placeholder={field.placeholder}
              className="w-full text-sm px-3 py-2 rounded transition-all duration-200 border border-[#2A2A30] focus:border-[#D4A85A] focus:shadow-[0_0_8px_rgba(212,168,90,0.3)] focus:outline-none"
              style={{
                backgroundColor: '#0C0C0E',
                color: '#C8C8C8',
                fontFamily: "'Inter', system-ui, sans-serif",
              }}
              data-testid={`embedding-config-${field.key}`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main EmbeddingProviderSelector component
// ---------------------------------------------------------------------------

/**
 * EmbeddingProviderSelector provides a PoE-themed dropdown for selecting
 * the embedding provider and model in the settings panel.
 */
export function EmbeddingProviderSelector({
  provider,
  model,
  onProviderChange,
  onModelChange,
  className = '',
  disabled = false,
}: EmbeddingProviderSelectorProps) {
  const currentModels = EMBEDDING_MODELS_BY_PROVIDER[provider] ?? [];

  const handleProviderChange = useCallback(
    (newProvider: EmbeddingProvider) => {
      onProviderChange(newProvider);
      // Auto-select the first model for the new provider
      const models = EMBEDDING_MODELS_BY_PROVIDER[newProvider];
      if (models.length > 0 && models[0].value !== model) {
        onModelChange(models[0].value);
      }
    },
    [onProviderChange, onModelChange, model],
  );

  return (
    <div className={`space-y-2 ${className}`} data-testid="embedding-provider-selector">
      {/* Provider dropdown */}
      <PoEEmbeddingSelect<EmbeddingProvider>
        id="embedding-provider"
        value={provider}
        options={EMBEDDING_PROVIDER_OPTIONS.map((o) => ({
          value: o.value,
          label: o.label,
          description: o.description,
          icon: o.icon,
          tag: !o.requiresApiKey ? 'Local' : undefined,
        }))}
        onChange={handleProviderChange}
        headerLabel="Embedding Provider"
        disabled={disabled}
        showIcon
      />

      {/* Model dropdown */}
      <PoEEmbeddingSelect<string>
        id="embedding-model"
        value={model}
        options={currentModels.map((m) => ({
          value: m.value,
          label: m.label,
          tag: m.tag,
        }))}
        onChange={onModelChange}
        headerLabel={`${EMBEDDING_PROVIDER_OPTIONS.find((o) => o.value === provider)?.label ?? 'Provider'} Embedding Models`}
        disabled={disabled}
      />
    </div>
  );
}
