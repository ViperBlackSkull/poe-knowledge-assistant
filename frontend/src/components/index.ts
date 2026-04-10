// React components for the POE Knowledge Assistant
// This file contains reusable UI components

export { Header, Sidebar, MainLayout } from './layout';
export { ChatMessageList, ChatMessageBubble, MarkdownRenderer, ChatInput, TypingIndicator, CitationCard, CitationList, CitationDemo, ClearConversationButton } from './chat';
export type { ChatMessageListProps, ChatMessageBubbleProps, ChatInputProps, TypingIndicatorProps, TypingIndicatorVariant, TypingIndicatorSize, ClearConversationButtonProps } from './chat';

// Item display components
export { ItemCard, ItemCardGrid, EnhancedItemCardGrid, ItemCardDemo } from './items';
export type { ItemCardProps, ItemCardGridProps, EnhancedItemCardGridProps } from './items';

// Standalone reusable components
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
