import { useState, type ReactNode } from 'react';
import type { MainLayoutProps } from '@/types/layout';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import type { NavItem } from '@/types/layout';

/**
 * MainLayout — root layout with PoE website-styled header.
 *
 * Structure:
 * - Sticky Header with nav tabs, logo, controls
 * - Main content area filling remaining space
 * - Optional sidebar (configuration panel)
 */
export function MainLayout({
  children,
  sidebar,
  showSidebar = false,
  className = '',
  actions,
  contextDisplay,
  currentRoute = '/',
  onNavigate,
}: MainLayoutProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const navItems: NavItem[] = [
    { label: 'Chat', href: '/', active: currentRoute === '/' },
    { label: 'Knowledge Base', href: '/knowledge', active: currentRoute === '/knowledge' },
    { label: 'Admin', href: '/admin', active: currentRoute === '/admin' },
  ];

  const headerActions: ReactNode = (
    <>
      {actions}
      {showSidebar && (
        <button
          type="button"
          onClick={() => setIsSidebarOpen((prev) => !prev)}
          className="w-8 h-8 min-h-[36px] min-w-[36px] flex items-center justify-center border border-poe-border rounded-[3px] text-poe-text-muted hover:border-poe-border-light hover:text-poe-text-highlight transition-colors touch-manipulation"
          aria-label="Toggle configuration panel"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355.133-.75.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.094c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      )}
    </>
  );

  return (
    <div className="min-h-screen flex flex-col bg-poe-bg-primary">
      <Header
        title="PoE KNOWLEDGE ASSISTANT"
        subtitle="Your intelligent companion"
        navItems={navItems}
        actions={headerActions}
        contextDisplay={contextDisplay}
        isMobileMenuOpen={isMobileMenuOpen}
        onMobileMenuToggle={() => setIsMobileMenuOpen((prev) => !prev)}
        onNavigate={(route) => {
          onNavigate?.(route);
          setIsMobileMenuOpen(false);
        }}
      />

      <div
        className="flex flex-1 overflow-hidden"
        onClick={() => {
          if (isMobileMenuOpen) setIsMobileMenuOpen(false);
        }}
      >
        <main
          className={`flex-1 overflow-y-auto ${className}`}
          id="main-content"
        >
          {children}
        </main>

        {showSidebar && (
          <Sidebar
            isOpen={isSidebarOpen}
            onToggle={() => setIsSidebarOpen((prev) => !prev)}
          >
            {sidebar}
          </Sidebar>
        )}
      </div>
    </div>
  );
}
