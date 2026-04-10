import type { SidebarProps } from '@/types/layout';

/**
 * Sidebar / configuration panel component.
 *
 * Slides in from the right on mobile, is always visible on desktop
 * (when isOpen is true). Provides a panel for configuration options,
 * settings, or auxiliary information alongside the chat interface.
 */
export function Sidebar({
  children,
  isOpen = false,
  onToggle,
}: SidebarProps) {
  return (
    <>
      {/* Overlay for mobile when sidebar is open */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden animate-poe-fade-in transition-opacity duration-300"
          onClick={onToggle}
          aria-hidden="true"
        />
      )}

      <aside
        className={`
          fixed top-14 sm:top-16 right-0 bottom-0 z-40
          w-[85vw] sm:w-80 bg-poe-bg-secondary border-l border-poe-border
          transform transition-transform duration-300 ease-in-out
          lg:relative lg:top-0 lg:z-0 lg:shrink-0
          ${isOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0 lg:hidden'}
          overflow-y-auto overscroll-contain
        `}
        aria-label="Configuration panel"
      >
        {/* Sidebar header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-poe-border">
          <h2 className="poe-header text-sm font-semibold tracking-wide">
            Configuration
          </h2>
          <button
            type="button"
            onClick={onToggle}
            className="p-1 rounded text-poe-text-muted hover:text-poe-text-highlight hover:bg-poe-hover transition-colors lg:hidden"
            aria-label="Close configuration panel"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Sidebar content */}
        <div className="p-4">
          {children || (
            <div className="space-y-4">
              {/* Placeholder configuration items */}
              <div className="poe-card">
                <h3 className="text-poe-text-highlight text-sm font-medium mb-2">
                  Game Version
                </h3>
                <select
                  className="poe-input w-full text-sm"
                  aria-label="Game version selector"
                >
                  <option value="poe1">Path of Exile 1</option>
                  <option value="poe2">Path of Exile 2</option>
                </select>
              </div>

              <div className="poe-card">
                <h3 className="text-poe-text-highlight text-sm font-medium mb-2">
                  Build Context
                </h3>
                <input
                  type="text"
                  className="poe-input w-full text-sm"
                  placeholder="e.g. Lightning Arrow Deadeye"
                  aria-label="Build context input"
                />
              </div>

              <div className="poe-card">
                <h3 className="text-poe-text-highlight text-sm font-medium mb-2">
                  Response Settings
                </h3>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="accent-poe-gold"
                    defaultChecked
                  />
                  <span className="text-poe-text-secondary text-sm">
                    Show source citations
                  </span>
                </label>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
