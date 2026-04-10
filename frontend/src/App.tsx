import { useState, useCallback, useRef, useEffect } from 'react';
import { MainLayout, ChatMessageList, ChatInput, ItemCardDemo, CitationDemo, GameVersionSelector, getGameVersionLabel, ClearConversationButton, SettingsPanel } from '@/components';
import type { ChatMessage } from '@/types/chat';
import type { GameVersion } from '@/types/chat';
import type { SSESource } from '@/types/streaming';
import type { ConfigUpdateRequest } from '@/types/config';

/**
 * Root application component.
 *
 * Provides the full chat interface with:
 * - MainLayout wrapping (header, sidebar)
 * - ChatMessageList for displaying conversation messages
 * - ChatInput for composing and sending messages
 * - Streaming response support via SSE
 * - Game version selector for choosing which PoE version to query
 *
 * Navigate to /#/items to see the Item Card demo page.
 */
function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [isStreaming, setIsStreaming] = useState(false);
  const [gameVersion, setGameVersion] = useState<GameVersion>('poe2');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const streamingBufferRef = useRef<string>('');

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
   * Updates the selected version and clears the conversation to start fresh.
   */
  const handleGameVersionChange = useCallback((version: GameVersion) => {
    setGameVersion(version);
    // Clear conversation when changing game version for a fresh context
    setMessages([]);
    setConversationId(undefined);
    streamingBufferRef.current = '';
  }, []);

  /**
   * Handle clearing the conversation.
   * Resets all chat state: messages, conversation ID, and streaming buffer.
   */
  const handleClearConversation = useCallback(() => {
    setMessages([]);
    setConversationId(undefined);
    streamingBufferRef.current = '';
  }, []);

  /**
   * Handle a new user message being sent.
   * Adds the user message to the message list and creates a placeholder
   * assistant message for the streaming response.
   */
  const handleSendMessage = useCallback((message: ChatMessage) => {
    // Add user message and a placeholder assistant message
    const assistantPlaceholder: ChatMessage = {
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, message, assistantPlaceholder]);
    setIsStreaming(true);
    streamingBufferRef.current = '';
  }, []);

  /**
   * Handle streaming tokens arriving from the SSE response.
   * Appends each token to the last assistant message.
   */
  const handleStreamingToken = useCallback((token: string) => {
    streamingBufferRef.current += token;
    const currentContent = streamingBufferRef.current;

    setMessages((prev) => {
      const updated = [...prev];
      // Update the last message (the assistant placeholder)
      if (updated.length > 0 && updated[updated.length - 1].role === 'assistant') {
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          content: currentContent,
        };
      }
      return updated;
    });
  }, []);

  /**
   * Handle streaming completion.
   * Sets the conversation ID from the response.
   */
  const handleStreamingDone = useCallback((convId: string) => {
    setConversationId(convId);
    setIsStreaming(false);
  }, []);

  /**
   * Handle sources received from the streaming response.
   * Stores the sources in the last assistant message's metadata.
   */
  const handleSources = useCallback((sources: SSESource[]) => {
    setMessages((prev) => {
      const updated = [...prev];
      if (updated.length > 0 && updated[updated.length - 1].role === 'assistant') {
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          metadata: { sources },
        };
      }
      return updated;
    });
  }, []);

  /**
   * Handle errors from the chat API.
   * Adds an error system message to the chat.
   */
  const handleError = useCallback((errorMessage: string) => {
    setIsStreaming(false);

    // If there is an empty assistant placeholder, replace it with an error message
    setMessages((prev) => {
      const updated = [...prev];
      if (
        updated.length > 0 &&
        updated[updated.length - 1].role === 'assistant' &&
        updated[updated.length - 1].content === ''
      ) {
        // Remove the empty assistant placeholder
        updated.pop();
      }
      return updated;
    });

    // Add a system message with the error
    const systemMessage: ChatMessage = {
      role: 'system',
      content: `Error: ${errorMessage}`,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, systemMessage]);
  }, []);

  /**
   * Handle settings save.
   * Currently logs the changes; in production this would call the backend API.
   */
  const handleSaveSettings = useCallback(async (_settings: ConfigUpdateRequest) => {
    // In production, this would call the config update endpoint
    // e.g. await patch<GetConfigResponse, ConfigUpdateRequest>('/config', settings);
    console.log('[Settings] Saving settings:', _settings);
  }, []);

  // Header actions with game version selector, version display badge, and settings button
  const headerActions = (
    <div className="flex items-center gap-3">
      {/* Current version badge */}
      <span className="hidden lg:inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs bg-poe-bg-tertiary border border-poe-border text-poe-text-muted">
        <span className="w-1.5 h-1.5 rounded-full bg-poe-gold" />
        {getGameVersionLabel(gameVersion)}
      </span>

      {/* Game version selector dropdown */}
      <GameVersionSelector
        value={gameVersion}
        onChange={handleGameVersionChange}
      />

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

  // Item card demo page
  if (showItemDemo) {
    return (
      <>
        <MainLayout actions={headerActions}>
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
        <MainLayout actions={headerActions}>
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
      <MainLayout showSidebar actions={headerActions}>
        <div className="flex flex-col h-full">
          {/* Chat toolbar */}
          {messages.length > 0 && (
            <div className="flex items-center justify-end px-4 py-2 sm:px-6 lg:px-8 border-b border-[#2A2A32] bg-[#141418]/50">
              <div className="max-w-3xl w-full flex items-center justify-end">
                <ClearConversationButton
                  onClear={handleClearConversation}
                  messageCount={messages.length}
                  disabled={isStreaming}
                />
              </div>
            </div>
          )}

          {/* Chat message list */}
          <ChatMessageList
            messages={messages}
            conversationId={conversationId}
            isStreaming={isStreaming}
          />

          {/* Chat input */}
          <ChatInput
            onSendMessage={handleSendMessage}
            onStreamingToken={handleStreamingToken}
            onStreamingDone={handleStreamingDone}
            onSources={handleSources}
            onError={handleError}
            disabled={isStreaming}
            conversationId={conversationId}
            gameVersion={gameVersion}
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
