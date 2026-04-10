// Custom React hooks for the POE Knowledge Assistant

export {
  useBuildContext,
  getBuildContextLabel,
} from './useBuildContext';
export type {
  BuildContextValue,
  UseBuildContextReturn,
} from './useBuildContext';

export {
  useDataFreshness,
  deriveFreshnessStatus,
  getWorstStatus,
  getLatestEntry,
} from './useDataFreshness';
export type {
  UseDataFreshnessReturn,
} from './useDataFreshness';

export {
  useChat,
} from './useChat';
export type {
  ChatLoadingState,
  ChatError,
  UseChatOptions,
  UseChatReturn,
} from './useChat';

export {
  useConfig,
} from './useConfig';
export type {
  ConfigLoadingState,
  ConfigError,
  ConfigState,
  UseConfigOptions,
  UseConfigReturn,
} from './useConfig';
