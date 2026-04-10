import { useState, useEffect, useCallback, useRef } from 'react';
import type { LLMProvider, EmbeddingProvider, ConfigUpdateRequest } from '@/types';
import {
  LLMProviderSelector,
  ProviderConfigSection,
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
  onSave?: (settings: ConfigUpdateRequest) => void | Promise<void>;
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

function SectionHeader({ icon, title, description }: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 mb-3">
      <div className="shrink-0 w-8 h-8 rounded bg-poe-bg-primary border border-poe-border flex items-center justify-center text-poe-gold">
        {icon}
      </div>
      <div>
        <h3 className="poe-header text-sm font-semibold tracking-wide">{title}</h3>
        <p className="text-[11px] text-poe-text-muted mt-0.5 leading-tight">{description}</p>
      </div>
    </div>
  );
}

function FormLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs text-poe-text-secondary font-medium mb-1.5">
      {children}
    </label>
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
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <FormLabel htmlFor={id}>{label}</FormLabel>
        <span className="text-xs text-poe-gold font-mono">
          {typeof value === 'number' ? value.toFixed(step < 1 ? 1 : 0) : value}
          {unit ?? ''}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer
          bg-poe-bg-primary border border-poe-border
          [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:w-4
          [&::-webkit-slider-thumb]:h-4
          [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:bg-poe-gold
          [&::-webkit-slider-thumb]:border-2
          [&::-webkit-slider-thumb]:border-poe-gold-dark
          [&::-webkit-slider-thumb]:cursor-pointer
          [&::-webkit-slider-thumb]:shadow-poe-glow
          [&::-moz-range-thumb]:w-4
          [&::-moz-range-thumb]:h-4
          [&::-moz-range-thumb]:rounded-full
          [&::-moz-range-thumb]:bg-poe-gold
          [&::-moz-range-thumb]:border-2
          [&::-moz-range-thumb]:border-poe-gold-dark
          [&::-moz-range-thumb]:cursor-pointer"
      />
      <div className="flex justify-between text-[10px] text-poe-text-muted mt-0.5">
        <span>{min}{unit ?? ''}</span>
        <span>{max}{unit ?? ''}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main SettingsPanel component
// ---------------------------------------------------------------------------

/**
 * SettingsPanel is a slide-in panel that provides configuration options
 * for the PoE Knowledge Assistant chat interface.
 *
 * Features:
 *  - Slide-in animation from the right side of the screen
 *  - LLM provider selection with PoE-styled custom dropdown
 *  - Dynamic model selection based on provider
 *  - Provider-specific configuration options
 *  - Save/restore provider selection via localStorage
 *  - API key input with show/hide toggle
 *  - Embedding provider configuration
 *  - RAG configuration (top-K results, score threshold)
 *  - Save/Cancel buttons with proper dirty-state management
 *  - PoE-themed styling consistent with the application theme
 *  - Keyboard accessible (Escape to close, focus trapping)
 *  - Responsive overlay backdrop
 */
export function SettingsPanel({
  isOpen,
  onClose,
  onSave,
  initialConfig,
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

    try {
      if (onSave) {
        await onSave(updates);
      }

      // Save API key fingerprints for all providers that have keys
      const allApiKeys: Record<string, string> = {
        ...formState.providerApiKeys,
        ...(formState.llmApiKey ? { [formState.llmProvider]: formState.llmApiKey } : {}),
      };
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
    } catch {
      setSaveMessage({ type: 'error', text: 'Failed to save settings' });
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

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className={`
          fixed inset-0 bg-black/60 backdrop-blur-sm z-40
          transition-opacity duration-300 ease-in-out
          ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
        `}
        onClick={handleCancel}
        aria-hidden="true"
      />

      {/* Slide-in panel */}
      <div
        ref={panelRef}
        onKeyDown={handleKeyDown}
        className={`
          fixed top-0 right-0 bottom-0 z-50
          w-full sm:w-[28rem] max-w-full
          bg-poe-bg-secondary border-l border-poe-border
          transform transition-transform duration-300 ease-in-out
          flex flex-col
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
          ${className}
        `}
        role="dialog"
        aria-modal="true"
        aria-label="Settings panel"
        data-testid="settings-panel"
      >
        {/* Decorative top accent line */}
        <div className="h-0.5 w-full bg-gradient-to-r from-poe-gold/80 via-poe-gold-light to-poe-gold/80 shrink-0" />

        {/* Panel header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-poe-border shrink-0">
          <div className="flex items-center gap-2">
            {/* Settings icon */}
            <svg
              className="w-5 h-5 text-poe-gold"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            <h2 className="poe-header text-sm font-semibold tracking-wide">Settings</h2>
          </div>

          {/* Close button */}
          <button
            ref={firstFocusRef}
            type="button"
            onClick={handleCancel}
            className="p-1.5 rounded text-poe-text-muted hover:text-poe-text-highlight hover:bg-poe-hover transition-colors"
            aria-label="Close settings panel"
            data-testid="settings-panel-close"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
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
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

          {/* Save status message */}
          {saveMessage && (
            <div
              className={`flex items-center gap-2 px-3 py-2 rounded text-xs border ${
                saveMessage.type === 'success'
                  ? 'bg-green-900/20 border-green-700/30 text-green-400'
                  : 'bg-red-900/20 border-red-700/30 text-red-400'
              }`}
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
              {saveMessage.text}
            </div>
          )}

          {/* ---------------------------------------------------------------
              LLM Provider Section (with PoE-styled custom dropdown)
              --------------------------------------------------------------- */}
          <div className="poe-card space-y-3">
            <SectionHeader
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                </svg>
              }
              title="LLM Provider"
              description="Configure the language model for generating responses"
            />

            {/* PoE-styled LLM Provider and Model selector */}
            <LLMProviderSelector
              provider={formState.llmProvider}
              model={formState.llmModel}
              onProviderChange={handleLlmProviderChange}
              onModelChange={handleLlmModelChange}
            />

            {/* Provider-specific configuration */}
            <ProviderConfigSection
              provider={formState.llmProvider}
              config={currentProviderConfig}
              onConfigChange={handleProviderConfigChange}
            />

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

          {/* ---------------------------------------------------------------
              API Key Section (with new ApiKeyInput component)
              --------------------------------------------------------------- */}
          <div className="poe-card space-y-3">
            <SectionHeader
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                </svg>
              }
              title="API Key"
              description="Configure your API key for the selected provider"
            />

            {/* API Key status indicator */}
            {initialConfig?.llmApiKeySet && formState.llmApiKey === '' && !formState.providerApiKeys[formState.llmProvider] && (
              <div className="flex items-center gap-2 text-xs text-green-400 bg-green-900/20 border border-green-700/30 rounded px-3 py-2">
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
                API key is configured
              </div>
            )}

            {/* Primary API Key Input for the current provider */}
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

            {/* Masked display of stored key if available */}
            {!formState.llmApiKey && !formState.providerApiKeys[formState.llmProvider] && getMaskedKeyDisplay(formState.llmProvider) && (
              <div className="flex items-center gap-2 px-3 py-2 rounded bg-poe-bg-primary/50 border border-poe-border/50">
                <svg className="w-3.5 h-3.5 text-poe-gold shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
                <span className="text-[11px] text-poe-text-muted font-mono">
                  Stored: {getMaskedKeyDisplay(formState.llmProvider)}
                </span>
              </div>
            )}

            {/* Other provider API keys section */}
            {(() => {
              const otherProviders = LLM_PROVIDER_OPTIONS.filter(
                (opt) => opt.value !== formState.llmProvider && opt.requiresApiKey,
              );
              if (otherProviders.length === 0) return null;
              return (
                <div className="mt-3 pt-3 border-t border-poe-border/50">
                  <div className="text-[11px] text-poe-text-muted mb-2">
                    Other provider keys
                  </div>
                  <div className="space-y-3">
                    {otherProviders.map((opt) => (
                      <ApiKeyInput
                        key={opt.value}
                        value={formState.providerApiKeys[opt.value] ?? ''}
                        onChange={(key) => handleProviderApiKeyChange(opt.value, key)}
                        provider={opt.value}
                        required={false}
                        previouslySet={hasStoredApiKey(opt.value)}
                        id={`settings-api-key-${opt.value}`}
                        testId={`settings-api-key-input-${opt.value}`}
                      />
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Security notice */}
            <div className="flex items-start gap-2 px-3 py-2 rounded bg-poe-bg-primary/30 border border-poe-border/30">
              <svg className="w-3.5 h-3.5 shrink-0 text-poe-gold mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              <p className="text-[10px] text-poe-text-muted leading-tight">
                API keys are stored securely. Only a fingerprint is saved locally to remember your configuration.
              </p>
            </div>
          </div>

          {/* ---------------------------------------------------------------
              Embedding Provider Section (with PoE-styled custom dropdown)
              --------------------------------------------------------------- */}
          <div className="poe-card space-y-3">
            <SectionHeader
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
                </svg>
              }
              title="Embedding Provider"
              description="Configure how text embeddings are generated"
            />

            {/* PoE-styled Embedding Provider and Model selector */}
            <EmbeddingProviderSelector
              provider={formState.embeddingProvider}
              model={formState.embeddingModel}
              onProviderChange={handleEmbeddingProviderChange}
              onModelChange={(model) => updateField('embeddingModel', model)}
            />

            {/* Embedding provider-specific configuration */}
            <EmbeddingProviderConfigSection
              provider={formState.embeddingProvider}
              config={formState.embeddingProviderConfig[formState.embeddingProvider] ?? {}}
              onConfigChange={handleEmbeddingProviderConfigChange}
            />
          </div>

          {/* ---------------------------------------------------------------
              RAG Configuration Section
              --------------------------------------------------------------- */}
          <div className="poe-card space-y-3">
            <SectionHeader
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                </svg>
              }
              title="RAG Configuration"
              description="Fine-tune retrieval-augmented generation parameters"
            />

            {/* Top K results slider */}
            <FormSlider
              id="rag-top-k"
              label="Top K Results"
              value={formState.ragTopK}
              min={1}
              max={20}
              step={1}
              onChange={(v) => updateField('ragTopK', v)}
            />

            {/* Score threshold slider */}
            <FormSlider
              id="rag-score-threshold"
              label="Score Threshold"
              value={formState.ragScoreThreshold}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => updateField('ragScoreThreshold', v)}
            />
          </div>
        </div>

        {/* Footer with action buttons */}
        <div className="shrink-0 border-t border-poe-border px-4 py-3 bg-poe-bg-tertiary/50">
          {/* Dirty indicator */}
          {isDirty && (
            <p className="text-[11px] text-poe-gold mb-2 text-center">
              Unsaved changes detected
            </p>
          )}

          <div className="flex items-center gap-3">
            {/* Cancel button */}
            <button
              type="button"
              onClick={handleCancel}
              className="poe-button-secondary flex-1 px-4 py-2 text-sm rounded transition-all"
              data-testid="settings-cancel-button"
            >
              Cancel
            </button>

            {/* Save button */}
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !isDirty}
              className={`
                flex-1 px-4 py-2 text-sm rounded border transition-all
                ${
                  isSaving || !isDirty
                    ? 'opacity-50 cursor-not-allowed bg-poe-bg-tertiary border-poe-border text-poe-text-muted'
                    : 'bg-poe-gold hover:bg-poe-gold-light border-poe-gold-dark text-white hover:shadow-poe-glow'
                }
              `}
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
