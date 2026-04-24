/**
 * Unit tests for the useChat hook.
 *
 * Covers:
 *   - Initial state defaults
 *   - Adding user messages and assistant placeholders
 *   - Streaming token accumulation
 *   - Completing streaming with conversation ID
 *   - Attaching sources to assistant messages
 *   - Error handling (removes placeholder, adds system message)
 *   - Clearing conversation
 *   - Removing and updating messages
 *   - Game version switching (resets conversation)
 *   - Build context management
 *   - History export/import
 *   - maxHistoryLength trimming
 *   - Callbacks (onConversationStart, onConversationClear)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChat } from '../useChat';
import type { ConversationHistory } from '@/types/chat';

describe('useChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  describe('initial state', () => {
    it('returns default values', () => {
      const { result } = renderHook(() => useChat());

      expect(result.current.messages).toEqual([]);
      expect(result.current.messageCount).toBe(0);
      expect(result.current.conversationId).toBeUndefined();
      expect(result.current.hasConversation).toBe(false);
      expect(result.current.loadingState).toBe('idle');
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isStreaming).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.errors).toEqual([]);
      expect(result.current.gameVersion).toBe('poe2');
      expect(result.current.buildContext).toBeUndefined();
    });

    it('accepts initial gameVersion option', () => {
      const { result } = renderHook(() => useChat({ gameVersion: 'poe1' }));
      expect(result.current.gameVersion).toBe('poe1');
    });

    it('accepts initial buildContext option', () => {
      const { result } = renderHook(() => useChat({ buildContext: 'standard' }));
      expect(result.current.buildContext).toBe('standard');
    });
  });

  // -------------------------------------------------------------------------
  // addUserMessage
  // -------------------------------------------------------------------------

  describe('addUserMessage', () => {
    it('adds a user message and an assistant placeholder', () => {
      const { result } = renderHook(() => useChat());

      act(() => {
        result.current.addUserMessage('Hello!');
      });

      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[0].role).toBe('user');
      expect(result.current.messages[0].content).toBe('Hello!');
      expect(result.current.messages[1].role).toBe('assistant');
      expect(result.current.messages[1].content).toBe('');
      expect(result.current.messageCount).toBe(2);
      expect(result.current.loadingState).toBe('sending');
      expect(result.current.isLoading).toBe(true);
    });

    it('returns the created user message', () => {
      const { result } = renderHook(() => useChat());

      let userMsg: ReturnType<typeof result.current.addUserMessage>;
      act(() => {
        userMsg = result.current.addUserMessage('Test');
      });

      expect(userMsg!.role).toBe('user');
      expect(userMsg!.content).toBe('Test');
      expect(userMsg!.timestamp).toBeTruthy();
    });

    it('trims history when maxHistoryLength is exceeded', () => {
      const { result } = renderHook(() => useChat({ maxHistoryLength: 4 }));

      act(() => { result.current.addUserMessage('msg1'); });
      // [user, assistant] = 2 messages
      act(() => { result.current.addUserMessage('msg2'); });
      // [user, assistant, user, assistant] = 4 messages (at limit)
      expect(result.current.messages).toHaveLength(4);

      act(() => { result.current.addUserMessage('msg3'); });
      // Would be 6, trimmed to 4
      expect(result.current.messages).toHaveLength(4);
      expect(result.current.messages[2].content).toBe('msg3');
    });
  });

  // -------------------------------------------------------------------------
  // appendStreamingToken
  // -------------------------------------------------------------------------

  describe('appendStreamingToken', () => {
    it('appends tokens to the last assistant message', () => {
      const { result } = renderHook(() => useChat());

      act(() => { result.current.addUserMessage('Hi'); });
      act(() => { result.current.appendStreamingToken('Hello'); });

      expect(result.current.messages[1].content).toBe('Hello');
      expect(result.current.loadingState).toBe('receiving');
      expect(result.current.isStreaming).toBe(true);

      act(() => { result.current.appendStreamingToken(' world'); });
      expect(result.current.messages[1].content).toBe('Hello world');
    });
  });

  // -------------------------------------------------------------------------
  // completeStreaming
  // -------------------------------------------------------------------------

  describe('completeStreaming', () => {
    it('sets the conversation ID and resets loading state', () => {
      const { result } = renderHook(() => useChat());

      act(() => {
        result.current.addUserMessage('Hi');
        result.current.appendStreamingToken('Hello');
      });
      act(() => {
        result.current.completeStreaming('conv-123');
      });

      expect(result.current.conversationId).toBe('conv-123');
      expect(result.current.hasConversation).toBe(true);
      expect(result.current.loadingState).toBe('idle');
      expect(result.current.isLoading).toBe(false);
    });

    it('does not overwrite an existing conversation ID', () => {
      const { result } = renderHook(() => useChat());

      act(() => {
        result.current.addUserMessage('Hi');
        result.current.completeStreaming('conv-1');
      });
      act(() => {
        result.current.addUserMessage('Follow-up');
        result.current.completeStreaming('conv-2');
      });

      expect(result.current.conversationId).toBe('conv-1');
    });

    it('calls onConversationStart callback for new conversations', () => {
      const onConversationStart = vi.fn();
      const { result } = renderHook(() => useChat({ onConversationStart }));

      act(() => {
        result.current.addUserMessage('Hi');
        result.current.completeStreaming('conv-new');
      });

      expect(onConversationStart).toHaveBeenCalledWith('conv-new');
    });

    it('does not call onConversationStart again for subsequent completions', () => {
      const onConversationStart = vi.fn();
      const { result } = renderHook(() => useChat({ onConversationStart }));

      act(() => { result.current.completeStreaming('conv-1'); });
      act(() => { result.current.completeStreaming('conv-2'); });

      expect(onConversationStart).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // attachSources
  // -------------------------------------------------------------------------

  describe('attachSources', () => {
    it('attaches sources to the last assistant message', () => {
      const { result } = renderHook(() => useChat());
      const sources = [
        { content: 'text', source: 'url', relevance_score: 0.9 },
      ];

      act(() => {
        result.current.addUserMessage('Hi');
        result.current.appendStreamingToken('Response');
        result.current.attachSources(sources);
      });

      expect(result.current.messages[1].metadata).toEqual({ sources });
    });
  });

  // -------------------------------------------------------------------------
  // handleError
  // -------------------------------------------------------------------------

  describe('handleError', () => {
    it('removes empty assistant placeholder and adds system error message', () => {
      const { result } = renderHook(() => useChat());

      act(() => { result.current.addUserMessage('Hi'); });
      // Now we have [user, assistant('')]
      expect(result.current.messages).toHaveLength(2);

      act(() => { result.current.handleError('Something went wrong', 'api'); });

      // The empty assistant placeholder is removed, system error message added
      expect(result.current.loadingState).toBe('idle');
      expect(result.current.error).not.toBeNull();
      expect(result.current.error!.message).toBe('Something went wrong');
      expect(result.current.error!.type).toBe('api');
      expect(result.current.errors).toHaveLength(1);

      // Last message should be the system error
      const lastMsg = result.current.messages[result.current.messages.length - 1];
      expect(lastMsg.role).toBe('system');
      expect(lastMsg.content).toContain('Something went wrong');
    });
  });

  // -------------------------------------------------------------------------
  // clearConversation
  // -------------------------------------------------------------------------

  describe('clearConversation', () => {
    it('resets all conversation state', () => {
      const { result } = renderHook(() => useChat());

      act(() => { result.current.addUserMessage('Hi'); });
      act(() => { result.current.completeStreaming('conv-1'); });

      act(() => { result.current.clearConversation(); });

      expect(result.current.messages).toEqual([]);
      expect(result.current.conversationId).toBeUndefined();
      expect(result.current.hasConversation).toBe(false);
      expect(result.current.loadingState).toBe('idle');
      expect(result.current.error).toBeNull();
    });

    it('calls onConversationClear callback', () => {
      const onConversationClear = vi.fn();
      const { result } = renderHook(() => useChat({ onConversationClear }));

      act(() => { result.current.clearConversation(); });
      expect(onConversationClear).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // setGameVersion
  // -------------------------------------------------------------------------

  describe('setGameVersion', () => {
    it('changes game version and clears conversation', () => {
      const { result } = renderHook(() => useChat());

      act(() => { result.current.addUserMessage('Hi'); });

      act(() => { result.current.setGameVersion('poe1'); });

      expect(result.current.gameVersion).toBe('poe1');
      expect(result.current.messages).toEqual([]);
      expect(result.current.conversationId).toBeUndefined();
      expect(result.current.loadingState).toBe('idle');
      expect(result.current.error).toBeNull();
    });

    it('calls onConversationClear callback', () => {
      const onConversationClear = vi.fn();
      const { result } = renderHook(() => useChat({ onConversationClear }));

      act(() => { result.current.setGameVersion('poe1'); });
      expect(onConversationClear).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // setBuildContext
  // -------------------------------------------------------------------------

  describe('setBuildContext', () => {
    it('updates build context', () => {
      const { result } = renderHook(() => useChat());

      act(() => { result.current.setBuildContext('warrior'); });
      expect(result.current.buildContext).toBe('warrior');
    });

    it('clears build context with undefined', () => {
      const { result } = renderHook(() => useChat({ buildContext: 'witch' }));

      act(() => { result.current.setBuildContext(undefined); });
      expect(result.current.buildContext).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // removeMessage
  // -------------------------------------------------------------------------

  describe('removeMessage', () => {
    it('removes a message by index', () => {
      const { result } = renderHook(() => useChat());

      act(() => { result.current.addUserMessage('Hello'); });
      // [user, assistant]
      act(() => { result.current.removeMessage(0); });

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].role).toBe('assistant');
    });

    it('ignores invalid indices', () => {
      const { result } = renderHook(() => useChat());

      act(() => { result.current.addUserMessage('Hello'); });
      act(() => { result.current.removeMessage(-1); });
      act(() => { result.current.removeMessage(99); });

      expect(result.current.messages).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // updateMessage
  // -------------------------------------------------------------------------

  describe('updateMessage', () => {
    it('updates a message by index', () => {
      const { result } = renderHook(() => useChat());

      act(() => { result.current.addUserMessage('Hello'); });
      act(() => {
        result.current.updateMessage(0, (msg) => ({
          ...msg,
          content: 'Updated',
        }));
      });

      expect(result.current.messages[0].content).toBe('Updated');
    });

    it('ignores invalid indices', () => {
      const { result } = renderHook(() => useChat());

      act(() => { result.current.addUserMessage('Hello'); });
      const originalMessages = [...result.current.messages];

      act(() => {
        result.current.updateMessage(99, (msg) => ({ ...msg, content: 'Nope' }));
      });

      expect(result.current.messages).toEqual(originalMessages);
    });
  });

  // -------------------------------------------------------------------------
  // getConversationHistory
  // -------------------------------------------------------------------------

  describe('getConversationHistory', () => {
    it('returns history with empty values when no messages', () => {
      const { result } = renderHook(() => useChat());

      const history = result.current.getConversationHistory();

      expect(history.conversation_id).toBe('');
      expect(history.messages).toEqual([]);
      expect(history.game_version).toBe('poe2');
    });

    it('returns history with messages and timestamps', () => {
      const { result } = renderHook(() => useChat());

      act(() => { result.current.addUserMessage('Hello'); });
      act(() => { result.current.completeStreaming('conv-1'); });

      const history = result.current.getConversationHistory();

      expect(history.conversation_id).toBe('conv-1');
      expect(history.messages).toHaveLength(2);
      expect(history.game_version).toBe('poe2');
      expect(history.created_at).toBe(result.current.messages[0].timestamp);
    });
  });

  // -------------------------------------------------------------------------
  // loadConversation
  // -------------------------------------------------------------------------

  describe('loadConversation', () => {
    it('loads a conversation from history', () => {
      const { result } = renderHook(() => useChat());

      const history: ConversationHistory = {
        conversation_id: 'conv-old',
        messages: [
          { role: 'user', content: 'Old message', timestamp: '2025-01-01T00:00:00Z', metadata: null },
          { role: 'assistant', content: 'Old reply', timestamp: '2025-01-01T00:00:01Z', metadata: null },
        ],
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:01Z',
        game_version: 'poe1',
        build_context: 'witch',
      };

      act(() => { result.current.loadConversation(history); });

      expect(result.current.messages).toHaveLength(2);
      expect(result.current.conversationId).toBe('conv-old');
      expect(result.current.gameVersion).toBe('poe1');
      expect(result.current.buildContext).toBe('witch');
      expect(result.current.loadingState).toBe('idle');
      expect(result.current.error).toBeNull();
    });
  });
});
