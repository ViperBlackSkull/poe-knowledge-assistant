import { useState, type ReactNode } from 'react';
import type { MainLayoutProps } from '@/types/layout';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import type { NavItem } from '@/types/layout';

/**
 * MainLayout is the root layout component for the application.
 *
 * Structure:
 * - Fixed/sticky Header at the top with app title, navigation, and controls
 * - Main content area filling the remaining vertical space
 * - Optional sidebar (configuration panel) that can be toggled
 *
 * The layout uses PoE-themed Tailwind styles and is fully responsive.
 */
export function MainLayout({
  children,
  sidebar,
  showSidebar = false,
  className = '',
  actions,
}: MainLayoutProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const navItems: NavItem[] = [
    { label: 'Chat', href: '/', active: true },
    { label: 'Knowledge Base', href: '/knowledge' },
    { label: 'Admin', href: '/admin' },
  ];

  const headerActions: ReactNode = (
    <>
      {/* External actions (e.g. game version selector) */}
      {actions}

      {/* Settings / config toggle button */}
      {showSidebar && (
        <button
          type="button"
          onClick={() => setIsSidebarOpen((prev) => !prev)}
          className="p-2 rounded text-poe-text-secondary hover:text-poe-text-highlight hover:bg-poe-hover transition-colors"
          aria-label="Toggle configuration panel"
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
              d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.204-.107-.397.165-.71.505-.78.929l-.15.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </button>
      )}
    </>
  );

  return (
    <div className="min-h-screen flex flex-col bg-poe-gradient">
      {/* Header */}
      <Header
        title="PoE Knowledge Assistant"
        subtitle="Your intelligent assistant for Path of Exile"
        navItems={navItems}
        actions={headerActions}
        isMobileMenuOpen={isMobileMenuOpen}
        onMobileMenuToggle={() => setIsMobileMenuOpen((prev) => !prev)}
      />

      {/* Main content area with optional sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Content */}
        <main
          className={`flex-1 overflow-y-auto ${className}`}
          id="main-content"
        >
          {children}
        </main>

        {/* Sidebar / configuration panel */}
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
