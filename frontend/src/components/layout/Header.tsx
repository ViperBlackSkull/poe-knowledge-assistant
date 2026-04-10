import type { HeaderProps } from '@/types/layout';

/**
 * Header component with PoE-themed styling.
 *
 * Contains the app title/logo, navigation links, and control buttons.
 * Responsive: collapses navigation into a hamburger menu on mobile.
 */
export function Header({
  title,
  subtitle,
  navItems = [],
  actions,
  contextDisplay,
  isMobileMenuOpen = false,
  onMobileMenuToggle,
}: HeaderProps) {
  return (
    <header className="bg-poe-header-gradient border-b border-poe-border sticky top-0 z-50 shadow-lg">
      {/* Animated accent line at the top of the header */}
      <div className="h-0.5 w-full animate-poe-accent-shimmer" />

      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16">
          {/* Left: App title and subtitle */}
          <div className="flex items-center gap-2 sm:gap-4 shrink-0 min-w-0">
            <div className="flex items-center gap-2 sm:gap-3">
              {/* PoE-style icon/logo with glow effect */}
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded bg-poe-gold flex items-center justify-center text-poe-bg-primary font-bold text-xs sm:text-sm shrink-0 transition-shadow duration-300 hover:shadow-[0_0_12px_rgba(175,96,37,0.6)] animate-poe-ambient-pulse">
                P
              </div>
              <div className="min-w-0">
                <h1 className="poe-header text-base sm:text-lg leading-tight tracking-wide truncate">
                  {title}
                </h1>
                {subtitle && (
                  <p className="text-poe-text-muted text-[10px] sm:text-xs leading-tight hidden sm:block">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Center: Desktop navigation + Context display */}
          <div className="hidden md:flex items-center gap-3">
            {navItems.length > 0 && (
              <nav className="flex items-center gap-1" aria-label="Main navigation">
                {navItems.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className={`px-3 py-2 rounded text-sm font-medium transition-all duration-200 ${
                      item.active
                        ? 'text-poe-gold bg-poe-bg-tertiary border border-poe-border shadow-sm'
                        : 'text-poe-text-secondary hover:text-poe-text-highlight hover:bg-poe-hover poe-hover-lift'
                    }`}
                    aria-current={item.active ? 'page' : undefined}
                  >
                    {item.label}
                  </a>
                ))}
              </nav>
            )}

            {/* Context display area (e.g. build context badge) */}
            {contextDisplay && (
              <div className="flex items-center">
                {/* Separator line */}
                <div className="w-px h-5 bg-poe-border mx-2" />
                {contextDisplay}
              </div>
            )}
          </div>

          {/* Right: Action controls + mobile menu toggle */}
          <div className="flex items-center gap-1 sm:gap-3">
            {/* Desktop actions */}
            {actions && (
              <div className="hidden sm:flex items-center gap-2">
                {actions}
              </div>
            )}

            {/* Mobile hamburger button - always show on mobile since it opens menu with actions */}
            <button
              type="button"
              onClick={onMobileMenuToggle}
              className="sm:hidden p-2 rounded text-poe-text-secondary hover:text-poe-text-highlight hover:bg-poe-hover transition-all duration-200 touch-manipulation hover:scale-105 active:scale-95"
              aria-label="Toggle navigation menu"
              aria-expanded={isMobileMenuOpen}
            >
              <svg
                className="w-6 h-6 transition-transform duration-200"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                {isMobileMenuOpen ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                  />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile navigation dropdown with animation */}
      {isMobileMenuOpen && (
        <div className="sm:hidden border-t border-poe-border bg-poe-bg-secondary animate-poe-slide-in-top">
          {navItems.length > 0 && (
            <nav className="px-3 py-2 space-y-0.5" aria-label="Mobile navigation">
              {navItems.map((item, index) => (
                <a
                  key={item.href}
                  href={item.href}
                  className={`block px-3 py-2.5 rounded text-sm font-medium transition-all duration-200 touch-manipulation animate-poe-fade-in-up ${
                    item.active
                      ? 'text-poe-gold bg-poe-bg-tertiary'
                      : 'text-poe-text-secondary hover:text-poe-text-highlight hover:bg-poe-hover active:bg-poe-active'
                  }`}
                  style={{ animationDelay: `${index * 50}ms` }}
                  aria-current={item.active ? 'page' : undefined}
                >
                  {item.label}
                </a>
              ))}
            </nav>
          )}
          {/* Mobile actions - always show when menu is open */}
          {actions && (
            <div className="px-3 py-3 flex flex-wrap items-center gap-2 border-t border-poe-border animate-poe-fade-in-up" style={{ animationDelay: '100ms' }}>
              {actions}
            </div>
          )}
          {/* Context display for mobile */}
          {contextDisplay && (
            <div className="px-3 py-2 border-t border-poe-border animate-poe-fade-in-up" style={{ animationDelay: '150ms' }}>
              {contextDisplay}
            </div>
          )}
        </div>
      )}
    </header>
  );
}
