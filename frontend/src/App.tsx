import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  MainLayout,
  ChatMessageList,
  ChatInput,
  ItemCardDemo,
  CitationDemo,
  GameVersionSelector,
  getGameVersionLabel,
  ClearConversationButton,
  SettingsPanel,
  BuildContextSelector,
  BuildContextDisplay,
  DataFreshnessIndicator,
  ErrorBoundary,
  useToast,
} from '@/components';
import type { ChatMessage } from '@/types/chat';
import type { SSESource } from '@/types/streaming';
import type { ConfigUpdateRequest } from '@/types/config';
import { setApiKey, APIClientError } from '@/lib/api-client';
import { useBuildContext, useChat, useConfig, useErrorHandling } from '@/hooks';
import type { BuildContextValue } from '@/hooks';

/**
 * Inner application component (wrapped by ErrorBoundary and ToastProvider in main.tsx).
 *
 * Provides the full chat interface integrating all components via
 * centralized state management hooks:
 *
 *   - useChat:           Chat messages, loading/error states, streaming, game version
 *   - useConfig:         Server-side configuration (LLM/embedding providers, RAG settings)
 *   - useBuildContext:   Build context selection persisted to localStorage
 *   - useErrorHandling:  Error classification, retry logic, and toast integration
 *   - useToast:          Global toast notifications for user feedback
 *
 * Component hierarchy:
 *   MainLayout
 *     Header (title, nav, game version, build context, freshness, settings)
 *     ChatMessageList (messages + typing indicator)
 *     ChatInput (textarea + send/cancel + streaming SSE)
 *   SettingsPanel (slide-over with LLM, API key, embedding, RAG config)
 */
function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const toast = useToast();
  const errorHandling = useErrorHandling();

  // -- Build context state (persisted to localStorage) -----------------------
  const { buildContext, setBuildContext } = useBuildContext();

  // -- Configuration state management via centralized hook -------------------
  const config = useConfig({
    onConfigUpdated: (response) => {
      console.log('[Config] Updated fields:', response.updated_fields);
      toast.addSuccess('Settings saved successfully');
    },
    onError: (configError) => {
      console.error('[Config] Error:', configError.message);
      toast.addError(configError.message, {
        title: 'Configuration Error',
        retryable: true,
      });
    },
  });

  // -- Chat state management via centralized hook ----------------------------
  const chat = useChat({
    buildContext: buildContext || undefined,
  });

  // -- Hash-based routing for demo pages ------------------------------------
  const [currentHash, setCurrentHash] = useState(window.location.hash);
  useEffect(() => {
    const handleHashChange = () => setCurrentHash(window.location.hash);
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const showItemDemo = currentHash === '#/items';
  const showCitationDemo = currentHash === '#/citations';

  // -- Game version handler -------------------------------------------------
  const handleGameVersionChange = useCallback(
    (version: Parameters<typeof chat.setGameVersion>[0]) => {
      chat.setGameVersion(version);
    },
    [chat.setGameVersion],
  );

  // -- Build context handler ------------------------------------------------
  const handleBuildContextChange = useCallback(
    (context: BuildContextValue) => {
      setBuildContext(context);
      chat.setBuildContext(context || undefined);
    },
    [setBuildContext, chat.setBuildContext],
  );

  // -- Chat message handlers ------------------------------------------------
  const handleSendMessage = useCallback(
    (message: ChatMessage) => {
      chat.addUserMessage(message.content);
    },
    [chat.addUserMessage],
  );

  const handleStreamingToken = useCallback(
    (token: string) => {
      chat.appendStreamingToken(token);
    },
    [chat.appendStreamingToken],
  );

  const handleStreamingDone = useCallback(
    (convId: string) => {
      chat.completeStreaming(convId);
    },
    [chat.completeStreaming],
  );

  const handleSources = useCallback(
    (sources: SSESource[]) => {
      chat.attachSources(sources);
    },
    [chat.attachSources],
  );

  // -- Error handler with toast integration and classification ---------------
  const handleError = useCallback(
    (errorMessage: string) => {
      chat.handleError(errorMessage);

      // Classify and show toast for the error
      const classified = errorHandling.classifyError(
        new Error(errorMessage),
      );

      toast.addError(errorMessage, {
        title: classified.category === 'network'
          ? 'Connection Error'
          : classified.category === 'authentication'
            ? 'Authentication Error'
            : 'Chat Error',
        retryable: classified.retryable,
        duration: classified.category === 'network' ? 8000 : 5000,
      });
    },
    [chat.handleError, errorHandling.classifyError, toast],
  );

  // -- Settings save handler with error handling -----------------------------
  const handleSaveSettings = useCallback(
    async (settings: ConfigUpdateRequest) => {
      console.log('[Settings] Saving settings:', settings);

      try {
        // Use withRetry for network resilience
        const response = await errorHandling.withRetry(
          async () => {
            const resp = await config.save(settings);

            if (!resp) {
              throw new APIClientError(0, 'Failed to save settings. No response received from server.');
            }

            if (!resp.success) {
              throw new APIClientError(400, resp.message || 'Failed to save settings.');
            }

            return resp;
          },
          {
            maxRetries: 2,
            baseDelay: 500,
            exponentialBackoff: true,
          },
        );

        console.log('[Settings] Save successful:', response.message);
        console.log('[Settings] Updated fields:', response.updated_fields);

        // Apply the API key to the api-client for subsequent requests
        if (settings.openai_api_key) {
          setApiKey(settings.openai_api_key);
        } else if (settings.anthropic_api_key) {
          setApiKey(settings.anthropic_api_key);
        }

        return response;
      } catch (err) {
        // Let SettingsPanel handle its own save message display,
        // but also show a toast for network/auth errors
        const classified = errorHandling.classifyError(err);

        if (classified.category === 'network') {
          toast.addError('Unable to reach the server. Your settings were not saved.', {
            title: 'Network Error',
            retryable: true,
          });
        } else if (classified.category === 'authentication') {
          toast.addError(classified.message, {
            title: 'Authentication Error',
          });
        }

        throw err;
      }
    },
    [config, errorHandling, toast],
  );

  // -- Header actions -------------------------------------------------------
  const headerActions = (
    <div className="flex items-center gap-3">
      {/* Current version badge */}
      <span className="hidden lg:inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs bg-poe-bg-tertiary border border-poe-border text-poe-text-muted">
        <span className="w-1.5 h-1.5 rounded-full bg-poe-gold" />
        {getGameVersionLabel(chat.gameVersion)}
      </span>

      {/* Game version selector dropdown */}
      <GameVersionSelector
        value={chat.gameVersion}
        onChange={handleGameVersionChange}
      />

      {/* Build context selector dropdown */}
      <BuildContextSelector
        value={buildContext}
        onChange={handleBuildContextChange}
      />

      {/* Data freshness indicator */}
      <DataFreshnessIndicator compact />

      {/* Settings button */}
      <button
        type="button"
        onClick={() => setIsSettingsOpen(true)}
        className="p-2 rounded text-poe-text-secondary hover:text-poe-text-highlight hover:bg-poe-hover transition-colors"
        aria-label="Open settings"
        data-testid="settings-open-button"
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
            d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355.133-.75.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      </button>
    </div>
  );

  // -- Build context display shown in the header center area -----------------
  const contextDisplay = (
    <BuildContextDisplay context={buildContext} />
  );

  // -- Derive initialConfig for the SettingsPanel from the config hook -------
  //
  // Maps the flattened ConfigState from useConfig into the shape expected by
  // SettingsPanel's initialConfig prop.  The SettingsPanel uses this to
  // pre-populate its form when the server configuration is loaded.
  const initialConfig = useMemo(() => {
    if (!config.config) return undefined;
    return {
      llmProvider: config.config.llmProvider,
      embeddingProvider: config.config.embeddingProvider,
      ragTopK: config.config.ragTopK,
      ragScoreThreshold: 0.7, // default; server GET /config does not expose this
      llmApiKeySet: false,     // will be true when server confirms a key is set
    };
  }, [config.config]);

  // -- Shared SettingsPanel (rendered once, reused across all routes) --------
  const settingsPanel = (
    <SettingsPanel
      isOpen={isSettingsOpen}
      onClose={() => setIsSettingsOpen(false)}
      onSave={handleSaveSettings}
      initialConfig={initialConfig}
      isConfigLoading={config.isLoading}
    />
  );

  // -- Route: Item card demo page -------------------------------------------
  if (showItemDemo) {
    return (
      <>
        <MainLayout actions={headerActions} contextDisplay={contextDisplay}>
          <ErrorBoundary name="ItemCardDemo">
            <ItemCardDemo />
          </ErrorBoundary>
        </MainLayout>
        {settingsPanel}
      </>
    );
  }

  // -- Route: Citation component demo page ----------------------------------
  if (showCitationDemo) {
    return (
      <>
        <MainLayout actions={headerActions} contextDisplay={contextDisplay}>
          <ErrorBoundary name="CitationDemo">
            <CitationDemo />
          </ErrorBoundary>
        </MainLayout>
        {settingsPanel}
      </>
    );
  }

  // -- Route: Main chat interface -------------------------------------------
  return (
    <>
      <MainLayout showSidebar actions={headerActions} contextDisplay={contextDisplay}>
        <div className="flex flex-col h-full">
          {/* Chat toolbar (clear button, shown when messages exist) */}
          {chat.messageCount > 0 && (
            <div className="flex items-center justify-end px-4 py-2 sm:px-6 lg:px-8 border-b border-[#2A2A32] bg-[#141418]/50">
              <div className="max-w-3xl w-full flex items-center justify-end">
                <ClearConversationButton
                  onClear={chat.clearConversation}
                  messageCount={chat.messageCount}
                  disabled={chat.isLoading}
                />
              </div>
            </div>
          )}

          {/* Chat message list connected to useChat state */}
          <ErrorBoundary name="ChatMessageList">
            <ChatMessageList
              messages={chat.messages}
              conversationId={chat.conversationId}
              isStreaming={chat.isStreaming}
              isLoading={chat.isLoading}
            />
          </ErrorBoundary>

          {/* Chat input connected to useChat actions */}
          <ErrorBoundary name="ChatInput">
            <ChatInput
              onSendMessage={handleSendMessage}
              onStreamingToken={handleStreamingToken}
              onStreamingDone={handleStreamingDone}
              onSources={handleSources}
              onError={handleError}
              disabled={chat.isLoading}
              conversationId={chat.conversationId}
              gameVersion={chat.gameVersion}
              buildContext={chat.buildContext}
              useStreaming={true}
            />
          </ErrorBoundary>
        </div>
      </MainLayout>
      {settingsPanel}
    </>
  );
}

export default App;
