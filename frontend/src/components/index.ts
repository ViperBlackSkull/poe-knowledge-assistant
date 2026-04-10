// React components for the POE Knowledge Assistant
// This file contains reusable UI components

export { Header, Sidebar, MainLayout } from './layout';
export { ChatMessageList, ChatMessageBubble, MarkdownRenderer, ChatInput, TypingIndicator, CitationCard, CitationList, CitationDemo, ClearConversationButton } from './chat';
export type { ChatMessageListProps, ChatMessageBubbleProps, ChatInputProps, TypingIndicatorProps, TypingIndicatorVariant, TypingIndicatorSize, ClearConversationButtonProps } from './chat';

// Item display components
export { ItemCard, ItemCardGrid, EnhancedItemCardGrid, ItemCardDemo } from './items';
export type { ItemCardProps, ItemCardGridProps, EnhancedItemCardGridProps } from './items';

// Standalone reusable components
export { LoadingSpinner } from './common/LoadingSpinner';
export type { LoadingSpinnerProps, LoadingSpinnerSize } from './common/LoadingSpinner';
export { MarkdownRenderer as EnhancedMarkdownRenderer } from './common/MarkdownRenderer';
export { GameVersionSelector } from './common/GameVersionSelector';
export { GAME_VERSION_OPTIONS, getGameVersionLabel } from './common/GameVersionSelector';
export type { GameVersionSelectorProps, GameVersionOption } from './common/GameVersionSelector';
export { SettingsPanel } from './common/SettingsPanel';
export type { SettingsPanelProps } from './common/SettingsPanel';
export { LLMProviderSelector, ProviderConfigSection } from './common/LLMProviderSelector';
export type {
  LLMProviderSelectorProps,
  LLMProviderOption,
  LLMModelOption,
  ProviderConfigProps,
} from './common/LLMProviderSelector';
export {
  LLM_PROVIDER_OPTIONS,
  LLM_MODELS_BY_PROVIDER,
  getDefaultModel,
  getLLMProviderLabel,
} from './common/LLMProviderSelector';
export {
  ApiKeyInput,
  ApiKeyManager,
  validateApiKey,
  getProviderKeyRules,
  saveApiKeyFingerprint,
  removeApiKeyFingerprint,
  loadApiKeyFingerprints,
  hasStoredApiKey,
  getMaskedKeyDisplay,
} from './common/ApiKeyInput';
export type {
  ApiKeyInputProps,
  ApiKeyManagerProps,
  ApiKeyValidationStatus,
} from './common/ApiKeyInput';
export { BuildContextSelector } from './common/BuildContextSelector';
export { BUILD_CONTEXT_OPTIONS, getBuildContextOptionLabel } from './common/BuildContextSelector';
export type { BuildContextSelectorProps, BuildContextOption } from './common/BuildContextSelector';
export { BuildContextDisplay } from './common/BuildContextDisplay';
export type { BuildContextDisplayProps } from './common/BuildContextDisplay';
export { DataFreshnessIndicator } from './common/DataFreshnessIndicator';
export type { DataFreshnessIndicatorProps } from './common/DataFreshnessIndicator';
