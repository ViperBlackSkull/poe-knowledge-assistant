import type { SidebarProps } from '@/types/layout';

/**
 * Sidebar / configuration panel — slides in from the right.
 *
 * Dark panel with subtle border matching the settings panel aesthetic.
 * Overlay on mobile, inline on desktop (when open).
 */
export function Sidebar({
  children,
  isOpen = false,
  onToggle,
}: SidebarProps) {
  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 lg:hidden animate-poe-fade-in"
          onClick={onToggle}
          aria-hidden="true"
        />
      )}

      <aside
        className={`
          fixed top-[52px] right-0 bottom-0 z-40
          w-[85vw] sm:w-80 bg-poe-bg-secondary border-l border-poe-border
          transform transition-transform duration-300 ease-in-out
          lg:relative lg:top-0 lg:z-0 lg:shrink-0
          ${isOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0 lg:hidden'}
          overflow-y-auto overscroll-contain
        `}
        aria-label="Configuration panel"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-poe-border">
          <h2 className="font-[Cinzel,Georgia,serif] text-sm font-semibold text-poe-gold-light tracking-[1.5px] uppercase">
            Configuration
          </h2>
          <button
            type="button"
            onClick={onToggle}
            className="w-7 h-7 flex items-center justify-center border border-poe-border rounded-[3px] text-poe-text-muted hover:text-poe-text-highlight hover:border-poe-border-light transition-colors lg:hidden"
            aria-label="Close configuration panel"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4">
          {children || (
            <div className="space-y-4">
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
