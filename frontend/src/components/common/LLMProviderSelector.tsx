import { useState, useRef, useEffect, useCallback } from 'react';
import type { LLMProvider } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Describes a selectable LLM provider option.
 */
export interface LLMProviderOption {
  /** Machine-readable provider value */
  value: LLMProvider;
  /** Human-readable label */
  label: string;
  /** Short description */
  description: string;
  /** Whether this provider requires an API key */
  requiresApiKey: boolean;
  /** Icon identifier for rendering */
  icon: 'cloud' | 'brain' | 'server' | 'local';
}

/**
 * Describes a model available for a given provider.
 */
export interface LLMModelOption {
  /** Model identifier */
  value: string;
  /** Display name */
  label: string;
  /** Optional tag (e.g. "Recommended", "Fast") */
  tag?: string;
}

/**
 * Props for the LLMProviderSelector component.
 */
export interface LLMProviderSelectorProps {
  /** Currently selected LLM provider */
  provider: LLMProvider;
  /** Currently selected model */
  model: string;
  /** Callback when the provider changes */
  onProviderChange: (provider: LLMProvider) => void;
  /** Callback when the model changes */
  onModelChange: (model: string) => void;
  /** Optional additional CSS class names */
  className?: string;
  /** Whether the selector is disabled */
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Available LLM provider options with metadata. */
export const LLM_PROVIDER_OPTIONS: LLMProviderOption[] = [
  {
    value: 'openai',
    label: 'OpenAI',
    description: 'GPT-4, GPT-3.5 Turbo, GPT-4o',
    requiresApiKey: true,
    icon: 'cloud',
  },
  {
    value: 'anthropic',
    label: 'Anthropic',
    description: 'Claude 3.5 Sonnet, Opus, Haiku',
    requiresApiKey: true,
    icon: 'brain',
  },
  {
    value: 'ollama',
    label: 'Ollama',
    description: 'Run models locally with Ollama',
    requiresApiKey: false,
    icon: 'server',
  },
  {
    value: 'lmstudio',
    label: 'LM Studio',
    description: 'Local LLM server',
    requiresApiKey: false,
    icon: 'local',
  },
];

/** Models available for each provider. */
export const LLM_MODELS_BY_PROVIDER: Record<LLMProvider, LLMModelOption[]> = {
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o', tag: 'Recommended' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini', tag: 'Fast' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    { value: 'gpt-4', label: 'GPT-4' },
    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', tag: 'Economy' },
  ],
  anthropic: [
    { value: 'claude-3.5-sonnet-20241022', label: 'Claude 3.5 Sonnet', tag: 'Recommended' },
    { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
    { value: 'claude-3-sonnet-20240229', label: 'Claude 3 Sonnet' },
    { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku', tag: 'Fast' },
  ],
  ollama: [
    { value: 'llama3', label: 'Llama 3', tag: 'Popular' },
    { value: 'mistral', label: 'Mistral' },
    { value: 'codellama', label: 'Code Llama' },
    { value: 'phi3', label: 'Phi 3', tag: 'Compact' },
    { value: 'gemma2', label: 'Gemma 2' },
  ],
  lmstudio: [
    { value: 'TheBloke/Mistral-7B-Instruct', label: 'Mistral 7B Instruct', tag: 'Popular' },
    { value: 'local-model', label: 'Custom Local Model' },
  ],
};

/**
 * Get the default model for a given provider.
 */
export function getDefaultModel(provider: LLMProvider): string {
  const models = LLM_MODELS_BY_PROVIDER[provider];
  return models.length > 0 ? models[0].value : '';
}

/**
 * Get a display label for a given LLM provider value.
 */
export function getLLMProviderLabel(provider: LLMProvider): string {
  const option = LLM_PROVIDER_OPTIONS.find((o) => o.value === provider);
  return option?.label ?? provider;
}

/**
 * Get provider-specific configuration fields.
 */
export function getProviderConfigFields(provider: LLMProvider): ProviderConfigField[] {
  switch (provider) {
    case 'openai':
      return [
        { key: 'baseUrl', label: 'Base URL', type: 'text', placeholder: 'https://api.openai.com/v1', optional: true },
      ];
    case 'anthropic':
      return [
        { key: 'baseUrl', label: 'Base URL', type: 'text', placeholder: 'https://api.anthropic.com', optional: true },
      ];
    case 'ollama':
      return [
        { key: 'baseUrl', label: 'Ollama URL', type: 'text', placeholder: 'http://localhost:11434', optional: false },
      ];
    case 'lmstudio':
      return [
        { key: 'baseUrl', label: 'LM Studio URL', type: 'text', placeholder: 'http://localhost:1234/v1', optional: false },
      ];
    default:
      return [];
  }
}

export interface ProviderConfigField {
  key: string;
  label: string;
  type: 'text' | 'number';
  placeholder: string;
  optional: boolean;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Renders an icon for the provider type. */
function ProviderIcon({ icon, className = '' }: { icon: LLMProviderOption['icon']; className?: string }) {
  switch (icon) {
    case 'cloud':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" />
        </svg>
      );
    case 'brain':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
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
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z" />
        </svg>
      );
  }
}

// ---------------------------------------------------------------------------
// PoE-styled select dropdown
// ---------------------------------------------------------------------------

interface PoESelectProps<T extends string> {
  id: string;
  value: T;
  options: { value: T; label: string; description?: string; icon?: LLMProviderOption['icon']; tag?: string }[];
  onChange: (value: T) => void;
  headerLabel: string;
  disabled?: boolean;
  showIcon?: boolean;
}

function PoESelect<T extends string>({
  id,
  value,
  options,
  onChange,
  headerLabel,
  disabled = false,
  showIcon = false,
}: PoESelectProps<T>) {
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
          <ProviderIcon icon={selectedOption.icon} className="w-4 h-4 text-[#D4A85A] shrink-0" />
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
                    <ProviderIcon
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
// Provider-specific configuration section
// ---------------------------------------------------------------------------

export interface ProviderConfigProps {
  provider: LLMProvider;
  config: Record<string, string>;
  onConfigChange: (key: string, value: string) => void;
}

/**
 * Renders provider-specific configuration fields.
 * Shows different options based on the selected provider.
 */
export function ProviderConfigSection({ provider, config, onConfigChange }: ProviderConfigProps) {
  const fields = getProviderConfigFields(provider);

  if (fields.length === 0) return null;

  return (
    <div className="space-y-2 mt-2" data-testid="provider-config-section">
      <div
        className="text-xs text-[#9F9FA8] font-medium mb-1.5"
        style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
      >
        Provider Settings
      </div>
      {fields.map((field) => (
        <div key={field.key}>
          <label
            htmlFor={`provider-config-${field.key}`}
            className="block text-[11px] text-[#6B6B75] mb-1"
            style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
          >
            {field.label}
            {field.optional && <span className="text-[#4A3A28] ml-1">(optional)</span>}
          </label>
          <input
            id={`provider-config-${field.key}`}
            type={field.type}
            value={config[field.key] ?? ''}
            onChange={(e) => onConfigChange(field.key, e.target.value)}
            placeholder={field.placeholder}
            className="poe-input w-full text-xs"
            data-testid={`provider-config-${field.key}`}
          />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main LLMProviderSelector component
// ---------------------------------------------------------------------------

/**
 * LLMProviderSelector provides a PoE-themed dropdown for selecting
 * the LLM provider and model in the settings panel.
 */
export function LLMProviderSelector({
  provider,
  model,
  onProviderChange,
  onModelChange,
  className = '',
  disabled = false,
}: LLMProviderSelectorProps) {
  const currentModels = LLM_MODELS_BY_PROVIDER[provider] ?? [];

  const handleProviderChange = useCallback(
    (newProvider: LLMProvider) => {
      onProviderChange(newProvider);
      // Auto-select the first model for the new provider
      const models = LLM_MODELS_BY_PROVIDER[newProvider];
      if (models.length > 0 && models[0].value !== model) {
        onModelChange(models[0].value);
      }
    },
    [onProviderChange, onModelChange, model],
  );

  return (
    <div className={`space-y-2 ${className}`} data-testid="llm-provider-selector">
      {/* Provider dropdown */}
      <PoESelect<LLMProvider>
        id="llm-provider"
        value={provider}
        options={LLM_PROVIDER_OPTIONS.map((o) => ({
          value: o.value,
          label: o.label,
          description: o.description,
          icon: o.icon,
          tag: !o.requiresApiKey ? 'Local' : undefined,
        }))}
        onChange={handleProviderChange}
        headerLabel="LLM Provider"
        disabled={disabled}
        showIcon
      />

      {/* Model dropdown */}
      <PoESelect<string>
        id="llm-model"
        value={model}
        options={currentModels.map((m) => ({
          value: m.value,
          label: m.label,
          tag: m.tag,
        }))}
        onChange={onModelChange}
        headerLabel={`${LLM_PROVIDER_OPTIONS.find((o) => o.value === provider)?.label ?? 'Provider'} Models`}
        disabled={disabled}
      />
    </div>
  );
}
