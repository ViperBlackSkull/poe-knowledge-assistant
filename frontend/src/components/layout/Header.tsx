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
  isMobileMenuOpen = false,
  onMobileMenuToggle,
}: HeaderProps) {
  return (
    <header className="bg-poe-header-gradient border-b border-poe-border sticky top-0 z-50 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left: App title and subtitle */}
          <div className="flex items-center gap-4 shrink-0">
            <div className="flex items-center gap-3">
              {/* PoE-style icon/logo */}
              <div className="w-8 h-8 rounded bg-poe-gold flex items-center justify-center text-poe-bg-primary font-bold text-sm">
                P
              </div>
              <div>
                <h1 className="poe-header text-lg leading-tight tracking-wide">
                  {title}
                </h1>
                {subtitle && (
                  <p className="text-poe-text-muted text-xs leading-tight hidden sm:block">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Center: Desktop navigation */}
          {navItems.length > 0 && (
            <nav className="hidden md:flex items-center gap-1" aria-label="Main navigation">
              {navItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-2 rounded text-sm font-medium transition-colors duration-200 ${
                    item.active
                      ? 'text-poe-gold bg-poe-bg-tertiary border border-poe-border'
                      : 'text-poe-text-secondary hover:text-poe-text-highlight hover:bg-poe-hover'
                  }`}
                  aria-current={item.active ? 'page' : undefined}
                >
                  {item.label}
                </a>
              ))}
            </nav>
          )}

          {/* Right: Action controls + mobile menu toggle */}
          <div className="flex items-center gap-3">
            {/* Desktop actions */}
            {actions && (
              <div className="hidden sm:flex items-center gap-2">
                {actions}
              </div>
            )}

            {/* Mobile hamburger button */}
            {navItems.length > 0 && (
              <button
                type="button"
                onClick={onMobileMenuToggle}
                className="md:hidden p-2 rounded text-poe-text-secondary hover:text-poe-text-highlight hover:bg-poe-hover transition-colors"
                aria-label="Toggle navigation menu"
                aria-expanded={isMobileMenuOpen}
              >
                <svg
                  className="w-6 h-6"
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
            )}
          </div>
        </div>
      </div>

      {/* Mobile navigation dropdown */}
      {isMobileMenuOpen && navItems.length > 0 && (
        <div className="md:hidden border-t border-poe-border bg-poe-bg-secondary">
          <nav className="px-4 py-3 space-y-1" aria-label="Mobile navigation">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={`block px-3 py-2 rounded text-sm font-medium transition-colors duration-200 ${
                  item.active
                    ? 'text-poe-gold bg-poe-bg-tertiary'
                    : 'text-poe-text-secondary hover:text-poe-text-highlight hover:bg-poe-hover'
                }`}
                aria-current={item.active ? 'page' : undefined}
              >
                {item.label}
              </a>
            ))}
          </nav>
          {/* Mobile actions */}
          {actions && (
            <div className="px-4 pb-3 flex items-center gap-2 border-t border-poe-border pt-3">
              {actions}
            </div>
          )}
        </div>
      )}
    </header>
  );
}
