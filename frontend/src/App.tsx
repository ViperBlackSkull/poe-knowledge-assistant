import { useState, useCallback, useEffect } from 'react';
import { MainLayout, ChatMessageList, ChatInput, ItemCardDemo, CitationDemo, GameVersionSelector, getGameVersionLabel, ClearConversationButton, SettingsPanel, BuildContextSelector, BuildContextDisplay, DataFreshnessIndicator } from '@/components';
import type { ChatMessage } from '@/types/chat';
import type { SSESource } from '@/types/streaming';
import type { ConfigUpdateRequest } from '@/types/config';
import { updateConfig, setApiKey } from '@/lib/api-client';
import { useBuildContext, useChat } from '@/hooks';
import type { BuildContextValue } from '@/hooks';

/**
 * Root application component.
 *
 * Provides the full chat interface with:
 * - MainLayout wrapping (header, sidebar)
 * - ChatMessageList for displaying conversation messages
 * - ChatInput for composing and sending messages
 * - Streaming response support via SSE
 * - Game version selector for choosing which PoE version to query
 * - Centralized chat state management via useChat hook
 *
 * Navigate to /#/items to see the Item Card demo page.
 */
function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Build context state (persisted to localStorage)
  const { buildContext, setBuildContext } = useBuildContext();

  // Chat state management via centralized hook
  const chat = useChat({
    buildContext: buildContext || undefined,
  });

  // Simple hash-based routing for demo pages
  const [currentHash, setCurrentHash] = useState(window.location.hash);
  useEffect(() => {
    const handleHashChange = () => setCurrentHash(window.location.hash);
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const showItemDemo = currentHash === '#/items';
  const showCitationDemo = currentHash === '#/citations';

  /**
   * Handle game version change.
   * Delegates to the useChat hook which clears conversation on version change.
   */
  const handleGameVersionChange = useCallback((version: Parameters<typeof chat.setGameVersion>[0]) => {
    chat.setGameVersion(version);
  }, [chat.setGameVersion]);

  /**
   * Handle build context change.
   * Updates the selected build context for tailored responses.
   */
  const handleBuildContextChange = useCallback((context: BuildContextValue) => {
    setBuildContext(context);
    chat.setBuildContext(context || undefined);
  }, [setBuildContext, chat.setBuildContext]);

  /**
   * Handle a new user message being sent.
   * Adds the user message and prepares the streaming placeholder via the hook.
   */
  const handleSendMessage = useCallback((message: ChatMessage) => {
    chat.addUserMessage(message.content);
  }, [chat.addUserMessage]);

  /**
   * Handle streaming tokens arriving from the SSE response.
   */
  const handleStreamingToken = useCallback((token: string) => {
    chat.appendStreamingToken(token);
  }, [chat.appendStreamingToken]);

  /**
   * Handle streaming completion.
   */
  const handleStreamingDone = useCallback((convId: string) => {
    chat.completeStreaming(convId);
  }, [chat.completeStreaming]);

  /**
   * Handle sources received from the streaming response.
   */
  const handleSources = useCallback((sources: SSESource[]) => {
    chat.attachSources(sources);
  }, [chat.attachSources]);

  /**
   * Handle errors from the chat API.
   */
  const handleError = useCallback((errorMessage: string) => {
    chat.handleError(errorMessage);
  }, [chat.handleError]);

  /**
   * Handle settings save.
   * Calls the backend PUT /api/config endpoint with the updated settings,
   * then applies the new API key to the api-client if one was provided.
   */
  const handleSaveSettings = useCallback(async (settings: ConfigUpdateRequest) => {
    console.log('[Settings] Saving settings:', settings);

    // Call the backend API to update configuration
    const response = await updateConfig(settings);

    if (!response.success) {
      throw new Error(response.message || 'Failed to save settings');
    }

    console.log('[Settings] Save successful:', response.message);
    console.log('[Settings] Updated fields:', response.updated_fields);

    // Apply the API key to the api-client if one was provided for the current provider
    if (settings.openai_api_key) {
      setApiKey(settings.openai_api_key);
    } else if (settings.anthropic_api_key) {
      setApiKey(settings.anthropic_api_key);
    }

    return response;
  }, []);

  // Header actions with game version selector, build context selector, version display badge, and settings button
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
            d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z"
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

  // Build context display shown in the header center area
  const contextDisplay = (
    <BuildContextDisplay context={buildContext} />
  );

  // Item card demo page
  if (showItemDemo) {
    return (
      <>
        <MainLayout actions={headerActions} contextDisplay={contextDisplay}>
          <ItemCardDemo />
        </MainLayout>
        <SettingsPanel
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          onSave={handleSaveSettings}
        />
      </>
    );
  }

  // Citation component demo page
  if (showCitationDemo) {
    return (
      <>
        <MainLayout actions={headerActions} contextDisplay={contextDisplay}>
          <CitationDemo />
        </MainLayout>
        <SettingsPanel
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          onSave={handleSaveSettings}
        />
      </>
    );
  }

  return (
    <>
      <MainLayout showSidebar actions={headerActions} contextDisplay={contextDisplay}>
        <div className="flex flex-col h-full">
          {/* Chat toolbar */}
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

          {/* Chat message list */}
          <ChatMessageList
            messages={chat.messages}
            conversationId={chat.conversationId}
            isStreaming={chat.isStreaming}
          />

          {/* Chat input */}
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
        </div>
      </MainLayout>
      <SettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSave={handleSaveSettings}
      />
    </>
  );
}

export default App;
