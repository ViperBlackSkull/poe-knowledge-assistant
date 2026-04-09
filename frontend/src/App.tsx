import { MainLayout } from '@/components';

/**
 * Root application component.
 *
 * Wraps the entire app in the MainLayout which provides:
 * - PoE-themed header with navigation and controls
 * - Main content area for the chat interface
 * - Optional sidebar for configuration
 */
function App() {
  return (
    <MainLayout showSidebar>
      {/* Chat Interface Placeholder */}
      <div className="flex flex-col h-full">
        {/* Chat messages area */}
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
          {/* Welcome message */}
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-poe-bg-tertiary border border-poe-border mb-4">
                <span className="text-2xl text-poe-gold">?</span>
              </div>
              <h2 className="poe-header text-xl mb-2">
                Welcome, Exile
              </h2>
              <p className="text-poe-text-secondary text-sm">
                Ask me anything about Path of Exile - items, builds, mechanics, and more.
              </p>
            </div>

            {/* Placeholder chat message - assistant */}
            <div className="flex gap-3 mb-4">
              <div className="shrink-0 w-8 h-8 rounded bg-poe-gold/20 border border-poe-gold/30 flex items-center justify-center">
                <span className="text-poe-gold text-xs font-bold">A</span>
              </div>
              <div className="poe-card flex-1 max-w-[80%]">
                <p className="text-poe-text-primary text-sm">
                  Greetings, Exile! I am the PoE Knowledge Assistant. I can help you with
                  item information, build recommendations, game mechanics, and much more.
                  What would you like to know?
                </p>
              </div>
            </div>

            {/* Placeholder chat message - user */}
            <div className="flex gap-3 mb-4 justify-end">
              <div className="poe-card flex-1 max-w-[80%] bg-poe-bg-tertiary border-poe-gold/30">
                <p className="text-poe-text-highlight text-sm">
                  What are the best starter builds for Path of Exile 2?
                </p>
              </div>
              <div className="shrink-0 w-8 h-8 rounded bg-poe-bg-tertiary border border-poe-border flex items-center justify-center">
                <span className="text-poe-text-secondary text-xs font-bold">U</span>
              </div>
            </div>

            {/* Placeholder chat message - assistant */}
            <div className="flex gap-3 mb-4">
              <div className="shrink-0 w-8 h-8 rounded bg-poe-gold/20 border border-poe-gold/30 flex items-center justify-center">
                <span className="text-poe-gold text-xs font-bold">A</span>
              </div>
              <div className="poe-card flex-1 max-w-[80%]">
                <p className="text-poe-text-primary text-sm">
                  Here are some great starter builds for Path of Exile 2:
                </p>
                <ul className="text-poe-text-secondary text-sm mt-2 space-y-1 list-disc list-inside">
                  <li>Warrior - Armor-stacking melee bruiser</li>
                  <li>Ranger - Lightning Arrow bow build</li>
                  <li>Sorceress - Spark chain-cast elementalist</li>
                  <li>Monk - Ice strike dodge-based melee</li>
                </ul>
                <div className="mt-3 pt-3 border-t border-poe-border">
                  <p className="text-poe-text-muted text-xs">
                    Sources: poewiki.net, poe2db.net
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

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
