import { useState, useEffect, useCallback, useRef } from 'react';
import type { LLMProvider, EmbeddingProvider, ConfigUpdateRequest, ConfigUpdateResponse } from '@/types';
import {
  LLMProviderSelector,
  getDefaultModel,
  LLM_PROVIDER_OPTIONS,
} from './LLMProviderSelector';
import {
  EmbeddingProviderSelector,
  EmbeddingProviderConfigSection,
  EMBEDDING_MODELS_BY_PROVIDER,
} from './EmbeddingProviderSelector';
import {
  ApiKeyInput,
  saveApiKeyFingerprint,
  hasStoredApiKey,
  getMaskedKeyDisplay,
} from './ApiKeyInput';

// ---------------------------------------------------------------------------
// LocalStorage helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'poe-knowledge-assistant-settings';

interface PersistedSettings {
  llmProvider: LLMProvider;
  llmModel: string;
  llmTemperature: number;
  llmMaxTokens: number;
  embeddingProvider: EmbeddingProvider;
  embeddingModel: string;
  ragTopK: number;
  ragScoreThreshold: number;
  providerConfig: Record<string, Record<string, string>>;
  embeddingProviderConfig: Record<string, Record<string, string>>;
}

function loadPersistedSettings(): PersistedSettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as PersistedSettings;
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

function persistSettings(settings: PersistedSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SettingsPanelProps {
  /** Whether the settings panel is currently open */
  isOpen: boolean;
  /** Callback to close the panel */
  onClose: () => void;
  /** Optional callback when settings are saved successfully */
  onSave?: (settings: ConfigUpdateRequest) => void | Promise<void | ConfigUpdateResponse>;
  /** Optional initial/fetched config values to pre-populate */
  initialConfig?: {
    llmProvider?: LLMProvider;
    llmModel?: string;
    llmTemperature?: number;
    llmMaxTokens?: number;
    llmApiKeySet?: boolean;
    embeddingProvider?: EmbeddingProvider;
    embeddingModel?: string;
    ragTopK?: number;
    ragScoreThreshold?: number;
  };
  /** Whether the configuration is currently being loaded from the server */
  isConfigLoading?: boolean;
  /** Optional additional CSS class names */
  className?: string;
}

/** Internal form state for the settings panel. */
interface SettingsFormState {
  llmProvider: LLMProvider;
  llmApiKey: string;
  /** Per-provider API keys for the API key manager */
  providerApiKeys: Record<string, string>;
  llmModel: string;
  llmTemperature: number;
  llmMaxTokens: number;
  embeddingProvider: EmbeddingProvider;
  embeddingModel: string;
  ragTopK: number;
  ragScoreThreshold: number;
  providerConfig: Record<string, Record<string, string>>;
  embeddingProviderConfig: Record<string, Record<string, string>>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_FORM_STATE: SettingsFormState = {
  llmProvider: 'openai',
  llmApiKey: '',
  providerApiKeys: {},
  llmModel: 'gpt-4o',
  llmTemperature: 0.7,
  llmMaxTokens: 2048,
  embeddingProvider: 'local',
  embeddingModel: 'all-MiniLM-L6-v2',
  ragTopK: 5,
  ragScoreThreshold: 0.7,
  providerConfig: {},
  embeddingProviderConfig: {},
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeader({ icon, title }: {
  icon: React.ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-[#2A2A30]">
      <div className="text-[#6B5530] shrink-0">
        {icon}
      </div>
      <h3
        className="text-sm font-semibold tracking-[0.12em] uppercase text-[#D4A85A]"
        style={{ fontFamily: "'Cinzel', 'Fontin', Georgia, serif" }}
      >
        {title}
      </h3>
    </div>
  );
}

function FormLabel({ children, htmlFor, className = '' }: { children: React.ReactNode; htmlFor?: string; className?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className={`w-[100px] shrink-0 text-right text-xs text-[#9F9FA8] self-center leading-tight pr-3 ${className}`}
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      {children}
    </label>
  );
}

function FormRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-0">
      {children}
    </div>
  );
}

function FormSlider({
  id,
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  return (
    <FormRow>
      <FormLabel htmlFor={id}>{label}</FormLabel>
      <div className="flex-1">
        <div className="flex items-center gap-3">
          <input
            id={id}
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="flex-1 h-[3px] rounded-full appearance-none cursor-pointer
              bg-[#2A2A30]
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:w-[14px]
              [&::-webkit-slider-thumb]:h-[14px]
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:bg-[#D4A85A]
              [&::-webkit-slider-thumb]:border-2
              [&::-webkit-slider-thumb]:border-[#6B5530]
              [&::-webkit-slider-thumb]:cursor-pointer
              [&::-webkit-slider-thumb]:shadow-[0_0_6px_rgba(212,168,90,0.4)]
              [&::-moz-range-thumb]:w-[14px]
              [&::-moz-range-thumb]:h-[14px]
              [&::-moz-range-thumb]:rounded-full
              [&::-moz-range-thumb]:bg-[#D4A85A]
              [&::-moz-range-thumb]:border-2
              [&::-moz-range-thumb]:border-[#6B5530]
              [&::-moz-range-thumb]:cursor-pointer
              [&::-moz-range-track]:bg-[#2A2A30]
              [&::-moz-range-track]:h-[3px]
              [&::-moz-range-track]:rounded-full"
          />
          <span
            className="text-xs text-[#D4A85A] font-mono w-12 text-right tabular-nums"
            style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
          >
            {typeof value === 'number' ? value.toFixed(step < 1 ? 1 : 0) : value}
            {unit ?? ''}
          </span>
        </div>
      </div>
    </FormRow>
  );
}

// ---------------------------------------------------------------------------
// Icon components for section headers
// ---------------------------------------------------------------------------

function StarIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
    </svg>
  );
}

function YinYangIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 11-2.36 3.73l-7.5-4.615A2.25 2.25 0 013 7.493V6.75" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Main SettingsPanel component
// ---------------------------------------------------------------------------

/**
 * SettingsPanel is a slide-over panel from the right that provides configuration
 * options for the PoE Knowledge Assistant chat interface.
 *
 * Redesigned to match pathofexile.com visual aesthetic with:
 *  - Slide-over from right, 440px wide
 *  - Dark overlay backdrop
 *  - Cinzel section headers with icons
 *  - Label + control field rows (right-aligned labels)
 *  - Refined select/input styling
 *  - Gradient gold save button with Cinzel font
 */
export function SettingsPanel({
  isOpen,
  onClose,
  onSave,
  initialConfig,
  isConfigLoading = false,
  className = '',
}: SettingsPanelProps) {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const [formState, setFormState] = useState<SettingsFormState>(() => {
    // Initialize from localStorage first, then fall back to defaults
    const persisted = loadPersistedSettings();
    if (persisted) {
      return {
        ...DEFAULT_FORM_STATE,
        llmProvider: persisted.llmProvider,
        llmModel: persisted.llmModel,
        llmTemperature: persisted.llmTemperature,
        llmMaxTokens: persisted.llmMaxTokens,
        embeddingProvider: persisted.embeddingProvider,
        embeddingModel: persisted.embeddingModel,
        ragTopK: persisted.ragTopK,
        ragScoreThreshold: persisted.ragScoreThreshold,
        providerConfig: persisted.providerConfig ?? {},
        embeddingProviderConfig: persisted.embeddingProviderConfig ?? {},
      };
    }
    return DEFAULT_FORM_STATE;
  });
  const [savedState, setSavedState] = useState<SettingsFormState>(formState);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const firstFocusRef = useRef<HTMLButtonElement>(null);

  // ---------------------------------------------------------------------------
  // Sync with initial config
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (initialConfig) {
      const newState: SettingsFormState = {
        llmProvider: initialConfig.llmProvider ?? formState.llmProvider,
        llmApiKey: '',
        providerApiKeys: {},
        llmModel: initialConfig.llmModel ?? formState.llmModel,
        llmTemperature: initialConfig.llmTemperature ?? formState.llmTemperature,
        llmMaxTokens: initialConfig.llmMaxTokens ?? formState.llmMaxTokens,
        embeddingProvider: initialConfig.embeddingProvider ?? formState.embeddingProvider,
        embeddingModel: initialConfig.embeddingModel ?? formState.embeddingModel,
        ragTopK: initialConfig.ragTopK ?? formState.ragTopK,
        ragScoreThreshold: initialConfig.ragScoreThreshold ?? formState.ragScoreThreshold,
        providerConfig: formState.providerConfig,
        embeddingProviderConfig: formState.embeddingProviderConfig,
      };
      setFormState(newState);
      setSavedState(newState);
    }
    // Only run when initialConfig changes, not on every formState change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialConfig]);

  // ---------------------------------------------------------------------------
  // Focus management
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (isOpen) {
      // Focus the close button when panel opens
      setTimeout(() => firstFocusRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // ---------------------------------------------------------------------------
  // Dirty state detection
  // ---------------------------------------------------------------------------

  const isDirty =
    formState.llmProvider !== savedState.llmProvider ||
    formState.llmApiKey !== '' ||
    Object.values(formState.providerApiKeys).some((k) => k && k.length > 0) ||
    formState.llmModel !== savedState.llmModel ||
    formState.llmTemperature !== savedState.llmTemperature ||
    formState.llmMaxTokens !== savedState.llmMaxTokens ||
    formState.embeddingProvider !== savedState.embeddingProvider ||
    formState.embeddingModel !== savedState.embeddingModel ||
    formState.ragTopK !== savedState.ragTopK ||
    formState.ragScoreThreshold !== savedState.ragScoreThreshold ||
    JSON.stringify(formState.embeddingProviderConfig) !== JSON.stringify(savedState.embeddingProviderConfig);

  // ---------------------------------------------------------------------------
  // Keyboard handling
  // ---------------------------------------------------------------------------

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }

      // Trap focus inside the panel
      if (e.key === 'Tab' && panelRef.current) {
        const focusableElements = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        const firstEl = focusableElements[0];
        const lastEl = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl?.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl?.focus();
        }
      }
    },
    [onClose],
  );

  // ---------------------------------------------------------------------------
  // State updaters
  // ---------------------------------------------------------------------------

  const updateField = useCallback(<K extends keyof SettingsFormState>(
    field: K,
    value: SettingsFormState[K],
  ) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
    setSaveMessage(null);
  }, []);

  const handleLlmProviderChange = useCallback((provider: LLMProvider) => {
    const defaultModel = getDefaultModel(provider);
    setFormState((prev) => ({
      ...prev,
      llmProvider: provider,
      llmModel: defaultModel,
    }));
    setSaveMessage(null);
  }, []);

  const handleLlmModelChange = useCallback((model: string) => {
    setFormState((prev) => ({
      ...prev,
      llmModel: model,
    }));
    setSaveMessage(null);
  }, []);

  const handleEmbeddingProviderChange = useCallback((provider: EmbeddingProvider) => {
    setFormState((prev) => ({
      ...prev,
      embeddingProvider: provider,
      embeddingModel: EMBEDDING_MODELS_BY_PROVIDER[provider]?.[0]?.value ?? '',
    }));
    setSaveMessage(null);
  }, []);

  const handleProviderConfigChange = useCallback((key: string, value: string) => {
    setFormState((prev) => ({
      ...prev,
      providerConfig: {
        ...prev.providerConfig,
        [prev.llmProvider]: {
          ...(prev.providerConfig[prev.llmProvider] ?? {}),
          [key]: value,
        },
      },
    }));
    setSaveMessage(null);
  }, []);

  const handleEmbeddingProviderConfigChange = useCallback((key: string, value: string) => {
    setFormState((prev) => ({
      ...prev,
      embeddingProviderConfig: {
        ...prev.embeddingProviderConfig,
        [prev.embeddingProvider]: {
          ...(prev.embeddingProviderConfig[prev.embeddingProvider] ?? {}),
          [key]: value,
        },
      },
    }));
    setSaveMessage(null);
  }, []);

  const handleProviderApiKeyChange = useCallback((provider: LLMProvider, key: string) => {
    setFormState((prev) => ({
      ...prev,
      providerApiKeys: {
        ...prev.providerApiKeys,
        [provider]: key,
      },
      // Also sync the legacy llmApiKey for the active provider
      ...(provider === prev.llmProvider ? { llmApiKey: key } : {}),
    }));
    setSaveMessage(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Save / Cancel
  // ---------------------------------------------------------------------------

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setSaveMessage(null);

    const updates: ConfigUpdateRequest = {};

    if (formState.llmProvider !== savedState.llmProvider) {
      updates.llm_provider = formState.llmProvider;
    }
    if (formState.llmModel !== savedState.llmModel) {
      updates.llm_model = formState.llmModel;
    }
    if (formState.llmTemperature !== savedState.llmTemperature) {
      updates.llm_temperature = formState.llmTemperature;
    }
    if (formState.llmMaxTokens !== savedState.llmMaxTokens) {
      updates.llm_max_tokens = formState.llmMaxTokens;
    }
    if (formState.embeddingProvider !== savedState.embeddingProvider) {
      updates.embedding_provider = formState.embeddingProvider;
    }
    if (formState.embeddingModel !== savedState.embeddingModel) {
      updates.embedding_model = formState.embeddingModel;
    }
    if (formState.ragTopK !== savedState.ragTopK) {
      updates.rag_top_k = formState.ragTopK;
    }
    if (formState.ragScoreThreshold !== savedState.ragScoreThreshold) {
      updates.rag_score_threshold = formState.ragScoreThreshold;
    }

    // Include API keys for providers that have new keys entered
    const allApiKeys: Record<string, string> = {
      ...formState.providerApiKeys,
      ...(formState.llmApiKey ? { [formState.llmProvider]: formState.llmApiKey } : {}),
    };
    if (allApiKeys['openai']) {
      updates.openai_api_key = allApiKeys['openai'];
    }
    if (allApiKeys['anthropic']) {
      updates.anthropic_api_key = allApiKeys['anthropic'];
    }

    // Include provider-specific base URL configurations
    const currentLlmConfig = formState.providerConfig[formState.llmProvider] ?? {};
    if (formState.llmProvider === 'ollama' && currentLlmConfig['baseUrl']) {
      updates.ollama_base_url = currentLlmConfig['baseUrl'];
    }
    if (formState.llmProvider === 'lmstudio' && currentLlmConfig['baseUrl']) {
      updates.lmstudio_base_url = currentLlmConfig['baseUrl'];
    }

    try {
      if (onSave) {
        await onSave(updates);
      }

      // Save API key fingerprints for all providers that have keys
      for (const [provider, key] of Object.entries(allApiKeys)) {
        if (key && key.length > 0) {
          saveApiKeyFingerprint(provider as LLMProvider, key);
        }
      }

      // Persist to localStorage
      const newSavedState = { ...formState, llmApiKey: '', providerApiKeys: {} };
      persistSettings({
        llmProvider: newSavedState.llmProvider,
        llmModel: newSavedState.llmModel,
        llmTemperature: newSavedState.llmTemperature,
        llmMaxTokens: newSavedState.llmMaxTokens,
        embeddingProvider: newSavedState.embeddingProvider,
        embeddingModel: newSavedState.embeddingModel,
        ragTopK: newSavedState.ragTopK,
        ragScoreThreshold: newSavedState.ragScoreThreshold,
        providerConfig: newSavedState.providerConfig,
        embeddingProviderConfig: newSavedState.embeddingProviderConfig,
      });

      setSavedState(newSavedState);
      setFormState((prev) => ({ ...prev, llmApiKey: '', providerApiKeys: {} }));
      setSaveMessage({ type: 'success', text: 'Settings saved successfully' });

      // Auto-clear success message
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      // Classify the error for a better message
      let errorMessage = err instanceof Error ? err.message : 'Failed to save settings';

      // Provide more specific messages for common error types
      if (err instanceof Error) {
        const msg = err.message.toLowerCase();
        if (msg.includes('network') || msg.includes('fetch') || msg.includes('connection')) {
          errorMessage = 'Unable to reach the server. Please check your connection and try again.';
        } else if (msg.includes('401') || msg.includes('403') || msg.includes('auth')) {
          errorMessage = 'Authentication failed. Please verify your API key.';
        } else if (msg.includes('422') || msg.includes('validation')) {
          errorMessage = 'Invalid settings values. Please review your configuration.';
        } else if (msg.includes('500') || msg.includes('internal')) {
          errorMessage = 'A server error occurred. Please try again later.';
        } else if (msg.includes('timeout')) {
          errorMessage = 'The request timed out. Please try again.';
        }
      }

      setSaveMessage({ type: 'error', text: errorMessage });
    } finally {
      setIsSaving(false);
    }
  }, [formState, savedState, onSave]);

  const handleCancel = useCallback(() => {
    setFormState({ ...savedState, llmApiKey: '', providerApiKeys: {} });
    setSaveMessage(null);
    onClose();
  }, [savedState, onClose]);

  // ---------------------------------------------------------------------------
  // Get model options for current embedding provider
  // ---------------------------------------------------------------------------

  const currentProviderOption = LLM_PROVIDER_OPTIONS.find((o) => o.value === formState.llmProvider);
  const currentProviderConfig = formState.providerConfig[formState.llmProvider] ?? {};

  // Determine if API key is set for the current provider
  const isApiKeySet = !!(
    initialConfig?.llmApiKeySet ||
    hasStoredApiKey(formState.llmProvider) ||
    formState.providerApiKeys[formState.llmProvider] ||
    formState.llmApiKey
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className={`
          fixed inset-0 z-40
          transition-opacity duration-300 ease-in-out
          ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
        `}
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
        onClick={handleCancel}
        aria-hidden="true"
      />

      {/* Slide-over panel */}
      <div
        ref={panelRef}
        onKeyDown={handleKeyDown}
        className={`
          fixed top-0 right-0 bottom-0 z-50
          w-[440px] max-w-full
          transform transition-transform duration-300 ease-in-out
          flex flex-col
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
          ${className}
        `}
        style={{
          backgroundColor: '#121215',
          borderLeft: '1px solid #2A2A30',
          pointerEvents: isOpen ? 'auto' : 'none',
        }}
        role="dialog"
        aria-modal={isOpen ? "true" : undefined}
        aria-hidden={isOpen ? undefined : "true"}
        aria-label="Settings panel"
        data-testid="settings-panel"
      >
        {/* Panel header */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid #2A2A30' }}
        >
          <h2
            className="text-base font-semibold tracking-[0.15em] uppercase text-[#D4A85A]"
            style={{ fontFamily: "'Cinzel', 'Fontin', Georgia, serif" }}
          >
            Settings
          </h2>

          {/* Close button */}
          <button
            ref={firstFocusRef}
            type="button"
            onClick={handleCancel}
            className="p-1.5 rounded transition-colors text-[#6B6B75] hover:text-[#E0E0E0] hover:bg-[#2A2A32]"
            aria-label="Close settings panel"
            data-testid="settings-panel-close"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 space-y-6 relative">
          {/* Config loading overlay */}
          {isConfigLoading && !formState.llmProvider && (
            <div
              className="absolute inset-0 z-10 flex flex-col items-center justify-center"
              style={{ backgroundColor: 'rgba(18, 18, 21, 0.8)', backdropFilter: 'blur(4px)' }}
              data-testid="settings-loading-overlay"
            >
              <svg
                className="w-8 h-8 animate-spin text-[#D4A85A] mb-3"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span
                className="text-sm text-[#9F9FA8]"
                style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
              >
                Loading configuration...
              </span>
            </div>
          )}

          {/* Saving overlay - dim content while saving */}
          {isSaving && (
            <div
              className="absolute inset-0 z-10 pointer-events-none"
              style={{ backgroundColor: 'rgba(18, 18, 21, 0.4)' }}
              data-testid="settings-saving-overlay"
            />
          )}

          {/* Save status message */}
          {saveMessage && (
            <div
              className={`flex items-center gap-2 px-3 py-2 rounded text-xs border ${
                saveMessage.type === 'success'
                  ? 'border-[#2a5a3a] text-[#44cc66]'
                  : 'border-[#5a2a2a] text-[#cc4444]'
              }`}
              style={{
                backgroundColor: saveMessage.type === 'success'
                  ? 'rgba(68, 204, 102, 0.08)'
                  : 'rgba(204, 68, 68, 0.08)',
              }}
              role="alert"
              data-testid="settings-save-message"
            >
              <svg
                className="w-4 h-4 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                {saveMessage.type === 'success' ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                  />
                )}
              </svg>
              <span className="flex-1">{saveMessage.text}</span>
              {saveMessage.type === 'error' && (
                <button
                  type="button"
                  onClick={() => handleSave()}
                  disabled={isSaving}
                  className="text-xs text-[#cc4444] hover:text-[#ff6666] underline transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="settings-error-retry"
                >
                  Retry
                </button>
              )}
              <button
                type="button"
                onClick={() => setSaveMessage(null)}
                className="text-[#6B6B75] hover:text-[#E0E0E0] transition-colors"
                aria-label="Dismiss message"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* ---------------------------------------------------------------
              Section 1: LLM Provider
              --------------------------------------------------------------- */}
          <div
            className="pb-6"
            style={{ borderBottom: '1px solid #2A2A30' }}
          >
            <SectionHeader
              icon={<StarIcon />}
              title="LLM Provider"
              description="Configure the language model for generating responses"
            />

            <div className="space-y-3">
              {/* Provider row */}
              <FormRow>
                <FormLabel>Provider</FormLabel>
                <div className="flex-1">
                  <LLMProviderSelector
                    provider={formState.llmProvider}
                    model={formState.llmModel}
                    onProviderChange={handleLlmProviderChange}
                    onModelChange={handleLlmModelChange}
                  />
                </div>
              </FormRow>

              {/* Provider-specific configuration */}
              {(() => {
                const fields = (() => {
                  switch (formState.llmProvider) {
                    case 'openai':
                      return [{ key: 'baseUrl', label: 'Base URL', type: 'text' as const, placeholder: 'https://api.openai.com/v1', optional: true }];
                    case 'anthropic':
                      return [{ key: 'baseUrl', label: 'Base URL', type: 'text' as const, placeholder: 'https://api.anthropic.com', optional: true }];
                    case 'ollama':
                      return [{ key: 'baseUrl', label: 'Ollama URL', type: 'text' as const, placeholder: 'http://localhost:11434', optional: false }];
                    case 'lmstudio':
                      return [{ key: 'baseUrl', label: 'LM Studio URL', type: 'text' as const, placeholder: 'http://localhost:1234/v1', optional: false }];
                    default:
                      return [];
                  }
                })();
                if (fields.length === 0) return null;
                return fields.map((field) => (
                  <FormRow key={field.key}>
                    <FormLabel htmlFor={`provider-config-${field.key}`}>
                      {field.label}
                      {field.optional && (
                        <span className="text-[#4A3A28] ml-1 text-[10px]">(opt)</span>
                      )}
                    </FormLabel>
                    <div className="flex-1">
                      <input
                        id={`provider-config-${field.key}`}
                        type={field.type}
                        value={currentProviderConfig[field.key] ?? ''}
                        onChange={(e) => handleProviderConfigChange(field.key, e.target.value)}
                        placeholder={field.placeholder}
                        className="w-full text-sm px-3 py-2 rounded transition-all duration-200 border border-[#2A2A30] focus:border-[#D4A85A] focus:shadow-[0_0_8px_rgba(212,168,90,0.3)] focus:outline-none"
                        style={{
                          backgroundColor: '#0C0C0E',
                          color: '#C8C8C8',
                          fontFamily: "'Inter', system-ui, sans-serif",
                        }}
                        data-testid={`provider-config-${field.key}`}
                      />
                    </div>
                  </FormRow>
                ));
              })()}

              {/* Temperature slider */}
              <FormSlider
                id="llm-temperature"
                label="Temperature"
                value={formState.llmTemperature}
                min={0}
                max={2}
                step={0.1}
                onChange={(v) => updateField('llmTemperature', v)}
              />

              {/* Max Tokens slider */}
              <FormSlider
                id="llm-max-tokens"
                label="Max Tokens"
                value={formState.llmMaxTokens}
                min={256}
                max={32000}
                step={256}
                onChange={(v) => updateField('llmMaxTokens', v)}
              />
            </div>
          </div>

          {/* ---------------------------------------------------------------
              Section 2: API Keys
              --------------------------------------------------------------- */}
          <div
            className="pb-6"
            style={{ borderBottom: '1px solid #2A2A30' }}
          >
            <SectionHeader
              icon={<KeyIcon />}
              title="API Keys"
              description="Configure your API key for the selected provider"
            />

            <div className="space-y-3">
              {/* API Key status dot */}
              <FormRow>
                <FormLabel>Key Status</FormLabel>
                <div className="flex-1 flex items-center gap-2">
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${
                      isApiKeySet
                        ? 'bg-[#44cc66] shadow-[0_0_6px_rgba(68,204,102,0.5)]'
                        : 'bg-[#cc4444] shadow-[0_0_6px_rgba(204,68,68,0.5)]'
                    }`}
                  />
                  <span
                    className={`text-xs ${
                      isApiKeySet ? 'text-[#44cc66]' : 'text-[#cc4444]'
                    }`}
                    style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
                  >
                    {isApiKeySet ? 'Set' : 'Unset'}
                  </span>
                </div>
              </FormRow>

              {/* Primary API Key Input for the current provider */}
              <FormRow>
                <FormLabel htmlFor="settings-api-key">
                  {currentProviderOption?.label ?? 'Provider'} Key
                  {currentProviderOption?.requiresApiKey && (
                    <span className="text-[#cc4444] ml-0.5">*</span>
                  )}
                </FormLabel>
                <div className="flex-1">
                  <ApiKeyInput
                    value={formState.providerApiKeys[formState.llmProvider] ?? formState.llmApiKey}
                    onChange={(key) => handleProviderApiKeyChange(formState.llmProvider, key)}
                    provider={formState.llmProvider}
                    required={currentProviderOption?.requiresApiKey ?? false}
                    previouslySet={
                      !!(initialConfig?.llmApiKeySet) ||
                      hasStoredApiKey(formState.llmProvider)
                    }
                    id="settings-api-key"
                    testId="settings-api-key-input"
                  />
                </div>
              </FormRow>

              {/* Masked display of stored key if available */}
              {!formState.llmApiKey && !formState.providerApiKeys[formState.llmProvider] && getMaskedKeyDisplay(formState.llmProvider) && (
                <FormRow>
                  <FormLabel>Stored</FormLabel>
                  <div className="flex-1">
                    <span
                      className="text-[11px] text-[#6B6B75] font-mono"
                    >
                      {getMaskedKeyDisplay(formState.llmProvider)}
                    </span>
                  </div>
                </FormRow>
              )}

              {/* Other provider API keys section */}
              {(() => {
                const otherProviders = LLM_PROVIDER_OPTIONS.filter(
                  (opt) => opt.value !== formState.llmProvider && opt.requiresApiKey,
                );
                if (otherProviders.length === 0) return null;
                return (
                  <div className="pt-3 mt-1" style={{ borderTop: '1px solid #2A2A30' }}>
                    <div
                      className="text-[11px] text-[#6B6B75] mb-2 uppercase tracking-wider"
                      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
                    >
                      Other Keys
                    </div>
                    <div className="space-y-3">
                      {otherProviders.map((opt) => (
                        <FormRow key={opt.value}>
                          <FormLabel htmlFor={`settings-api-key-${opt.value}`}>
                            {opt.label}
                          </FormLabel>
                          <div className="flex-1">
                            <ApiKeyInput
                              value={formState.providerApiKeys[opt.value] ?? ''}
                              onChange={(key) => handleProviderApiKeyChange(opt.value, key)}
                              provider={opt.value}
                              required={false}
                              previouslySet={hasStoredApiKey(opt.value)}
                              id={`settings-api-key-${opt.value}`}
                              testId={`settings-api-key-input-${opt.value}`}
                            />
                          </div>
                        </FormRow>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Security notice */}
              <div
                className="flex items-start gap-2 px-3 py-2 rounded"
                style={{ backgroundColor: 'rgba(12, 12, 14, 0.5)', border: '1px solid #2A2A30' }}
              >
                <svg className="w-3.5 h-3.5 shrink-0 text-[#6B5530] mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
                <p
                  className="text-[10px] text-[#6B6B75] leading-tight"
                  style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
                >
                  Keys are stored locally in your browser. Only a fingerprint is saved to remember your configuration.
                </p>
              </div>
            </div>
          </div>

          {/* ---------------------------------------------------------------
              Section 3: Embedding Provider
              --------------------------------------------------------------- */}
          <div
            className="pb-6"
            style={{ borderBottom: '1px solid #2A2A30' }}
          >
            <SectionHeader
              icon={<YinYangIcon />}
              title="Embedding Provider"
              description="Configure how text embeddings are generated"
            />

            <div className="space-y-3">
              {/* Embedding Provider row */}
              <FormRow>
                <FormLabel>Provider</FormLabel>
                <div className="flex-1">
                  <EmbeddingProviderSelector
                    provider={formState.embeddingProvider}
                    model={formState.embeddingModel}
                    onProviderChange={handleEmbeddingProviderChange}
                    onModelChange={(model) => updateField('embeddingModel', model)}
                  />
                </div>
              </FormRow>

              {/* Embedding provider-specific configuration */}
              <EmbeddingProviderConfigSection
                provider={formState.embeddingProvider}
                config={formState.embeddingProviderConfig[formState.embeddingProvider] ?? {}}
                onConfigChange={handleEmbeddingProviderConfigChange}
              />
            </div>
          </div>

          {/* ---------------------------------------------------------------
              Section 4: RAG Configuration
              --------------------------------------------------------------- */}
          <div className="pb-2">
            <SectionHeader
              icon={<GearIcon />}
              title="RAG Configuration"
              description="Fine-tune retrieval-augmented generation parameters"
            />

            <div className="space-y-3">
              {/* Top K results slider */}
              <FormSlider
                id="rag-top-k"
                label="Top K"
                value={formState.ragTopK}
                min={1}
                max={20}
                step={1}
                onChange={(v) => updateField('ragTopK', v)}
              />

              {/* Score threshold slider */}
              <FormSlider
                id="rag-score-threshold"
                label="Threshold"
                value={formState.ragScoreThreshold}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => updateField('ragScoreThreshold', v)}
              />
            </div>
          </div>
        </div>

        {/* Footer with action buttons */}
        <div
          className="shrink-0 px-5 py-4"
          style={{ borderTop: '1px solid #2A2A30' }}
        >
          {/* Dirty indicator */}
          {isDirty && (
            <p
              className="text-[11px] text-[#D4A85A] mb-2 text-center"
              style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
            >
              Unsaved changes detected
            </p>
          )}

          <div className="flex items-center gap-3">
            {/* Cancel button — ghost style */}
            <button
              type="button"
              onClick={handleCancel}
              className="flex-1 px-4 py-2.5 text-sm rounded transition-all border border-[#2A2A30] text-[#9F9FA8] hover:text-[#C8C8C8] hover:border-[#3A3A42] hover:bg-[#1C1C22]"
              style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
              data-testid="settings-cancel-button"
            >
              Cancel
            </button>

            {/* Save button — gradient gold with Cinzel font */}
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !isDirty}
              className={`
                flex-1 px-4 py-2.5 text-sm rounded transition-all duration-200 uppercase tracking-[0.08em]
                ${
                  isSaving || !isDirty
                    ? 'opacity-40 cursor-not-allowed border border-[#2A2A30] text-[#6B6B75]'
                    : 'text-white hover:scale-[1.02] active:scale-[0.98]'
                }
              `}
              style={isSaving || !isDirty ? {
                backgroundColor: '#1C1C22',
                fontFamily: "'Cinzel', 'Fontin', Georgia, serif",
              } : {
                background: 'linear-gradient(135deg, #AF6025 0%, #D4A85A 50%, #AF6025 100%)',
                border: '1px solid #7D4A1C',
                boxShadow: '0 0 12px rgba(175, 96, 37, 0.4), 0 2px 8px rgba(0, 0, 0, 0.3)',
                fontFamily: "'Cinzel', 'Fontin', Georgia, serif",
              }}
              data-testid="settings-save-button"
            >
              {isSaving ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Saving...
                </span>
              ) : (
                'Save Settings'
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
