import type { HeaderProps } from '@/types/layout';

/**
 * Header component with PoE website-themed styling.
 *
 * Clean 52px top bar with: brand logo, nav tabs with active gold underline,
 * contextual controls on the right. Collapses into hamburger menu on mobile.
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
    <header className="bg-poe-bg-secondary border-b border-poe-border sticky top-0 z-50">
      <div className="flex items-stretch h-[52px]">
        {/* Logo area */}
        <div className="flex items-center gap-3 px-4 sm:px-6 border-r border-poe-border shrink-0">
          <div className="w-7 h-7 border-[1.5px] border-poe-gold flex items-center justify-center font-[Cinzel,Georgia,serif] text-sm text-poe-gold-light">
            P
          </div>
          <div className="hidden sm:block min-w-0">
            <h1 className="font-[Cinzel,Georgia,serif] text-sm font-semibold text-poe-gold-light tracking-[1.5px] leading-tight truncate">
              {title}
            </h1>
            {subtitle && (
              <p className="text-[10px] text-poe-text-muted leading-tight">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {/* Nav tabs — desktop only */}
        <nav className="hidden md:flex items-stretch ml-6" aria-label="Main navigation">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`flex items-center px-5 text-xs font-medium tracking-[0.8px] uppercase transition-colors duration-200 ${
                item.active
                  ? 'text-poe-gold-light border-b-2 border-poe-gold'
                  : 'text-poe-text-muted border-b-2 border-transparent hover:text-poe-text-secondary'
              }`}
              aria-current={item.active ? 'page' : undefined}
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* Center context display */}
        {contextDisplay && (
          <div className="hidden lg:flex items-center ml-auto mr-4">
            {contextDisplay}
          </div>
        )}

        {/* Right controls */}
        <div className="flex items-center gap-3 ml-auto px-4 sm:px-6">
          {/* Desktop actions */}
          {actions && (
            <div className="hidden sm:flex items-center gap-3">
              {actions}
            </div>
          )}

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={onMobileMenuToggle}
            className="sm:hidden p-2 text-poe-text-secondary hover:text-poe-text-highlight transition-colors touch-manipulation"
            aria-label="Toggle navigation menu"
            aria-expanded={isMobileMenuOpen}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              {isMobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile navigation dropdown */}
      {isMobileMenuOpen && (
        <div className="sm:hidden border-t border-poe-border bg-poe-bg-secondary animate-poe-slide-in-top">
          {navItems.length > 0 && (
            <nav className="px-4 py-2 space-y-0.5" aria-label="Mobile navigation">
              {navItems.map((item, index) => (
                <a
                  key={item.href}
                  href={item.href}
                  className={`block px-3 py-2.5 text-sm font-medium transition-colors touch-manipulation animate-poe-fade-in-up ${
                    item.active
                      ? 'text-poe-gold-light bg-poe-bg-tertiary'
                      : 'text-poe-text-secondary hover:text-poe-text-highlight hover:bg-poe-hover'
                  }`}
                  style={{ animationDelay: `${index * 50}ms` }}
                  aria-current={item.active ? 'page' : undefined}
                >
                  {item.label}
                </a>
              ))}
            </nav>
          )}
          {actions && (
            <div className="px-4 py-3 flex flex-wrap items-center gap-2 border-t border-poe-border animate-poe-fade-in-up" style={{ animationDelay: '100ms' }}>
              {actions}
            </div>
          )}
          {contextDisplay && (
            <div className="px-4 py-2 border-t border-poe-border animate-poe-fade-in-up" style={{ animationDelay: '150ms' }}>
              {contextDisplay}
            </div>
          )}
        </div>
      )}
    </header>
  );
}
