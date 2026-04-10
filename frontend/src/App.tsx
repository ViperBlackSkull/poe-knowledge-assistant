import { useState, useCallback, useRef, useEffect } from 'react';
import { MainLayout, ChatMessageList, ChatInput, ItemCardDemo, CitationDemo, GameVersionSelector, getGameVersionLabel } from '@/components';
import type { ChatMessage } from '@/types/chat';
import type { GameVersion } from '@/types/chat';
import type { SSESource } from '@/types/streaming';

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

  // Header actions with game version selector and version display badge
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
    </div>
  );

  // Item card demo page
  if (showItemDemo) {
    return (
      <MainLayout actions={headerActions}>
        <ItemCardDemo />
      </MainLayout>
    );
  }

  // Citation component demo page
  if (showCitationDemo) {
    return (
      <MainLayout actions={headerActions}>
        <CitationDemo />
      </MainLayout>
    );
  }

  return (
    <MainLayout showSidebar actions={headerActions}>
      <div className="flex flex-col h-full">
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
  );
}

export default App;
