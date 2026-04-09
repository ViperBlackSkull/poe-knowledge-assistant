import { useState } from 'react';
import { MainLayout, ChatMessageList } from '@/components';
import type { ChatMessage } from '@/types/chat';

/**
 * Sample messages to demonstrate the ChatMessageList component.
 * These will be replaced by real API integration in a later task.
 */
const SAMPLE_MESSAGES: ChatMessage[] = [
  {
    role: 'system',
    content: 'Conversation started. PoE Knowledge Assistant is ready.',
    timestamp: new Date(Date.now() - 300000).toISOString(),
  },
  {
    role: 'assistant',
    content:
      'Greetings, Exile! I am the PoE Knowledge Assistant. I can help you with item information, build recommendations, game mechanics, and much more. What would you like to know?',
    timestamp: new Date(Date.now() - 280000).toISOString(),
  },
  {
    role: 'user',
    content: 'What are the best starter builds for Path of Exile 2?',
    timestamp: new Date(Date.now() - 240000).toISOString(),
  },
  {
    role: 'assistant',
    content:
      'Here are some great **starter builds** for Path of Exile 2:\n\n- Warrior - Armor-stacking melee bruiser\n- Ranger - Lightning Arrow bow build\n- Sorceress - Spark chain-cast elementalist\n- Monk - Ice strike dodge-based melee\n\nEach of these builds offers good survivability and damage output, making them excellent choices for learning the game mechanics. Check the [PoE2 Wiki](https://poe2db.net) for detailed build guides.',
    timestamp: new Date(Date.now() - 200000).toISOString(),
    metadata: {
      sources: ['poewiki.net', 'poe2db.net'],
    },
  },
  {
    role: 'user',
    content: 'Tell me more about the Ranger build. What skills should I use?',
    timestamp: new Date(Date.now() - 160000).toISOString(),
  },
  {
    role: 'assistant',
    content:
      '## Ranger Lightning Arrow Build\n\nThe Ranger Lightning Arrow build is one of the most popular starter builds in PoE2. Here are the key skills:\n\n1. **Lightning Arrow** - Your main AoE clearing skill\n2. *Galvanic Arrow* - Single target DPS option\n3. `Wind Dancer` - Defensive buff\n\n### Key Passives\n\n- Attack Speed nodes near the Ranger start\n- Elemental damage clusters\n- Evasion rating bonuses\n\n> This build excels at map clearing and scales well into endgame content.',
    timestamp: new Date(Date.now() - 120000).toISOString(),
    metadata: {
      sources: ['poe2db.net'],
    },
  },
];

const SAMPLE_CONVERSATION_ID = 'conv-abc12345-def6-7890-ghij-klmnopqrstuv';

/**
 * Root application component.
 *
 * Wraps the entire app in the MainLayout which provides:
 * - PoE-themed header with navigation and controls
 * - Main content area for the chat interface
 * - Optional sidebar for configuration
 */
function App() {
  const [messages] = useState<ChatMessage[]>(SAMPLE_MESSAGES);

  return (
    <MainLayout showSidebar>
      <div className="flex flex-col h-full">
        {/* Chat message list */}
        <ChatMessageList
          messages={messages}
          conversationId={SAMPLE_CONVERSATION_ID}
        />

        {/* Chat input area */}
        <div className="border-t border-poe-border bg-poe-bg-secondary px-4 py-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <form
              onSubmit={(e) => e.preventDefault()}
              className="flex gap-3 items-end"
            >
              <div className="flex-1 relative">
                <textarea
                  placeholder="Ask about items, builds, mechanics..."
                  rows={1}
                  className="poe-input w-full resize-none text-sm pr-10"
                  aria-label="Chat message input"
                />
              </div>
              <button
                type="submit"
                className="poe-button shrink-0 flex items-center gap-2"
                aria-label="Send message"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                  />
                </svg>
                <span className="hidden sm:inline">Send</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}

export default App;
