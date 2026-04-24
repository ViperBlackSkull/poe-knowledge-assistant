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
          className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-30 lg:hidden animate-poe-fade-in transition-opacity duration-300"
          onClick={onToggle}
          aria-hidden="true"
        />
      )}

      <aside
        className={`
          fixed top-[52px] right-0 bottom-0 z-40
          w-[85vw] sm:w-80 bg-poe-bg-secondary border-l border-poe-border
          transform transition-transform duration-300 ease-in-out
          lg:relative lg:top-0 lg:z-0 lg:shrink-0 lg:translate-x-0
          ${isOpen ? 'translate-x-0' : 'translate-x-full lg:block'}
          overflow-y-auto overscroll-contain
        `}
        aria-label="Configuration panel"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-poe-border bg-poe-bg-tertiary/50">
          <h2 className="font-[Cinzel,Georgia,serif] text-sm font-semibold text-poe-gold-light tracking-[1.5px] uppercase">
            Configuration
          </h2>
          <button
            type="button"
            onClick={onToggle}
            className="w-9 h-9 flex items-center justify-center border border-poe-border rounded-[3px] text-poe-text-muted hover:text-poe-text-highlight hover:border-poe-gold hover:bg-poe-gold-muted/20 transition-all touch-manipulation lg:hidden"
            aria-label="Close configuration panel"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-4">
          {children || (
            <>
              <div className="bg-poe-bg-tertiary border border-poe-border rounded-[3px] p-3">
                <h3 className="text-poe-text-highlight text-xs font-semibold tracking-[0.6px] uppercase mb-2.5">
                  Game Version
                </h3>
                <select
                  className="w-full bg-poe-bg-primary border border-poe-border rounded-[3px] px-3 py-2 text-sm text-poe-text-primary focus:border-poe-gold focus:outline-none focus:ring-1 focus:ring-poe-gold/50 transition-colors"
                  aria-label="Game version selector"
                >
                  <option value="poe1">Path of Exile 1</option>
                  <option value="poe2">Path of Exile 2</option>
                </select>
              </div>

              <div className="bg-poe-bg-tertiary border border-poe-border rounded-[3px] p-3">
                <h3 className="text-poe-text-highlight text-xs font-semibold tracking-[0.6px] uppercase mb-2.5">
                  Build Context
                </h3>
                <input
                  type="text"
                  className="w-full bg-poe-bg-primary border border-poe-border rounded-[3px] px-3 py-2 text-sm text-poe-text-primary placeholder:text-poe-text-muted focus:border-poe-gold focus:outline-none focus:ring-1 focus:ring-poe-gold/50 transition-colors"
                  placeholder="e.g. Lightning Arrow Deadeye"
                  aria-label="Build context input"
                />
              </div>

              <div className="bg-poe-bg-tertiary border border-poe-border rounded-[3px] p-3">
                <h3 className="text-poe-text-highlight text-xs font-semibold tracking-[0.6px] uppercase mb-2">
                  Response Settings
                </h3>
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-poe-gold cursor-pointer"
                    defaultChecked
                  />
                  <span className="text-poe-text-secondary text-sm group-hover:text-poe-text-primary transition-colors">
                    Show source citations
                  </span>
                </label>
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
