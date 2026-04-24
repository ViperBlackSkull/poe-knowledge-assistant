/**
 * Unit tests for the useChat hook.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChat } from '../useChat';
import type { ConversationHistory } from '@/types/chat';

describe('useChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
  });

  describe('appendStreamingToken', () => {
    it('appends tokens to the last assistant message', () => {
      const { result } = renderHook(() => useChat());

      act(() => {
        result.current.addUserMessage('Hi');
      });
      act(() => {
        result.current.appendStreamingToken('Hello');
      });

      expect(result.current.messages[1].content).toBe('Hello');
      expect(result.current.loadingState).toBe('receiving');
      expect(result.current.isStreaming).toBe(true);

      act(() => {
        result.current.appendStreamingToken(' world');
      });

      expect(result.current.messages[1].content).toBe('Hello world');
    });
  });

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
  });

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

  describe('handleError', () => {
    it('removes empty assistant placeholder and adds system error message', () => {
      const { result } = renderHook(() => useChat());

      act(() => {
        result.current.addUserMessage('Hi');
      });

      expect(result.current.messages).toHaveLength(2);

      act(() => {
        result.current.handleError('Something went wrong', 'api');
      });

      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[0].role).toBe('user');
      expect(result.current.messages[1].role).toBe('system');
      expect(result.current.messages[1].content).toBe('Error: Something went wrong');
    });

    it('keeps non-empty assistant message on error', () => {
      const { result } = renderHook(() => useChat());

      act(() => {
        result.current.addUserMessage('Hi');
        result.current.appendStreamingToken('Partial');
      });

      act(() => {
        result.current.handleError('Stream interrupted');
      });

      const roles = result.current.messages.map((m) => m.role);
      expect(roles).toContain('user');
      expect(roles).toContain('assistant');
      expect(roles).toContain('system');
    });

    it('sets error state', () => {
      const { result } = renderHook(() => useChat());

      act(() => {
        result.current.handleError('Test error', 'network');
      });

      expect(result.current.error).not.toBeNull();
      expect(result.current.error!.message).toBe('Test error');
      expect(result.current.error!.type).toBe('network');
      expect(result.current.errors).toHaveLength(1);
      expect(result.current.loadingState).toBe('idle');
    });
  });

  describe('clearConversation', () => {
    it('resets all conversation state', () => {
      const { result } = renderHook(() => useChat());

      act(() => {
        result.current.addUserMessage('Hi');
        result.current.appendStreamingToken('Hello');
        result.current.completeStreaming('conv-1');
      });

      expect(result.current.hasConversation).toBe(true);

      act(() => {
        result.current.clearConversation();
      });

      expect(result.current.messages).toEqual([]);
      expect(result.current.conversationId).toBeUndefined();
      expect(result.current.hasConversation).toBe(false);
      expect(result.current.loadingState).toBe('idle');
      expect(result.current.error).toBeNull();
    });

    it('calls onConversationClear callback', () => {
      const onConversationClear = vi.fn();
      const { result } = renderHook(() => useChat({ onConversationClear }));

      act(() => {
        result.current.addUserMessage('Hi');
        result.current.clearConversation();
      });

      expect(onConversationClear).toHaveBeenCalledTimes(1);
    });
  });

  describe('removeMessage', () => {
    it('removes a message at the given index', () => {
      const { result } = renderHook(() => useChat());

      act(() => {
        result.current.addUserMessage('First');
      });

      expect(result.current.messages).toHaveLength(2);

      act(() => {
        result.current.removeMessage(0);
      });

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].role).toBe('assistant');
    });

    it('ignores out-of-bounds indices', () => {
      const { result } = renderHook(() => useChat());

      act(() => {
        result.current.addUserMessage('Hi');
      });

      const before = result.current.messages.length;

      act(() => {
        result.current.removeMessage(-1);
        result.current.removeMessage(99);
      });

      expect(result.current.messages).toHaveLength(before);
    });
  });

  describe('updateMessage', () => {
    it('updates a message at the given index', () => {
      const { result } = renderHook(() => useChat());

      act(() => {
        result.current.addUserMessage('Hi');
      });

      act(() => {
        result.current.updateMessage(0, (msg) => ({
          ...msg,
          content: 'Updated content',
        }));
      });

      expect(result.current.messages[0].content).toBe('Updated content');
    });

    it('ignores out-of-bounds indices', () => {
      const { result } = renderHook(() => useChat());

      act(() => {
        result.current.addUserMessage('Hi');
      });

      const contentBefore = result.current.messages[0].content;

      act(() => {
        result.current.updateMessage(-1, (msg) => ({
          ...msg,
          content: 'Changed',
        }));
        result.current.updateMessage(99, (msg) => ({
          ...msg,
          content: 'Changed',
        }));
      });

      expect(result.current.messages[0].content).toBe(contentBefore);
    });
  });

  describe('setGameVersion', () => {
    it('changes game version and clears conversation', () => {
      const onConversationClear = vi.fn();
      const { result } = renderHook(() =>
        useChat({ onConversationClear }),
      );

      act(() => {
        result.current.addUserMessage('Hi');
        result.current.completeStreaming('conv-1');
      });

      expect(result.current.hasConversation).toBe(true);

      act(() => {
        result.current.setGameVersion('poe1');
      });

      expect(result.current.gameVersion).toBe('poe1');
      expect(result.current.messages).toEqual([]);
      expect(result.current.conversationId).toBeUndefined();
      expect(result.current.loadingState).toBe('idle');
      expect(onConversationClear).toHaveBeenCalled();
    });
  });

  describe('setBuildContext', () => {
    it('updates the build context', () => {
      const { result } = renderHook(() => useChat());

      act(() => {
        result.current.setBuildContext('standard');
      });

      expect(result.current.buildContext).toBe('standard');
    });

    it('clears build context with undefined', () => {
      const { result } = renderHook(() =>
        useChat({ buildContext: 'budget' }),
      );

      expect(result.current.buildContext).toBe('budget');

      act(() => {
        result.current.setBuildContext(undefined);
      });

      expect(result.current.buildContext).toBeUndefined();
    });
  });

  describe('getConversationHistory', () => {
    it('exports current conversation as ConversationHistory', () => {
      const { result } = renderHook(() =>
        useChat({ gameVersion: 'poe1' }),
      );

      act(() => {
        result.current.addUserMessage('Hi');
        result.current.completeStreaming('conv-export');
      });

      const history = result.current.getConversationHistory();

      expect(history.conversation_id).toBe('conv-export');
      expect(history.messages).toHaveLength(2);
      expect(history.game_version).toBe('poe1');
      expect(history.created_at).toBeTruthy();
      expect(history.updated_at).toBeTruthy();
    });

    it('returns empty conversation_id when no conversation started', () => {
      const { result } = renderHook(() => useChat());
      const history = result.current.getConversationHistory();

      expect(history.conversation_id).toBe('');
      expect(history.messages).toEqual([]);
    });
  });

  describe('loadConversation', () => {
    it('loads a conversation from history', () => {
      const { result } = renderHook(() => useChat());

      const history: ConversationHistory = {
        conversation_id: 'conv-loaded',
        messages: [
          { role: 'user', content: 'Loaded msg', timestamp: '2025-01-01T00:00:00Z' },
          { role: 'assistant', content: 'Reply', timestamp: '2025-01-01T00:00:01Z' },
        ],
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:01Z',
        game_version: 'poe1',
        build_context: 'standard',
      };

      act(() => {
        result.current.loadConversation(history);
      });

      expect(result.current.messages).toHaveLength(2);
      expect(result.current.conversationId).toBe('conv-loaded');
      expect(result.current.gameVersion).toBe('poe1');
      expect(result.current.buildContext).toBe('standard');
      expect(result.current.loadingState).toBe('idle');
      expect(result.current.error).toBeNull();
    });
  });

  describe('maxHistoryLength', () => {
    it('trims messages when maxHistoryLength is exceeded', () => {
      const { result } = renderHook(() =>
        useChat({ maxHistoryLength: 3 }),
      );

      act(() => {
        result.current.addUserMessage('First');
      });

      act(() => {
        result.current.addUserMessage('Second');
      });

      expect(result.current.messages).toHaveLength(3);
      expect(result.current.messages[0].role).toBe('assistant');
      expect(result.current.messages[1].role).toBe('user');
      expect(result.current.messages[1].content).toBe('Second');
    });
  });
});
