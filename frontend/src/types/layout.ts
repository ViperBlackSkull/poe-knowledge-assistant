/**
 * Layout type definitions for the main application layout.
 * Covers header, navigation, and content area structure.
 */

import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Header types
// ---------------------------------------------------------------------------

/** Navigation item in the header. */
export interface NavItem {
  /** Display label */
  label: string;
  /** Navigation href or route path */
  href: string;
  /** Whether this nav item is currently active */
  active?: boolean;
  /** Optional icon name or identifier */
  icon?: string;
}

// ---------------------------------------------------------------------------
// Layout types
// ---------------------------------------------------------------------------

/** Props for the Header component. */
export interface HeaderProps {
  /** Application title displayed in the header */
  title: string;
  /** Optional subtitle or tagline */
  subtitle?: string;
  /** Navigation items for the header nav */
  navItems?: NavItem[];
  /** Optional actions/controls to render on the right side */
  actions?: ReactNode;
  /** Whether to show the mobile menu (controlled externally or internal state) */
  isMobileMenuOpen?: boolean;
  /** Callback when mobile menu toggle is clicked */
  onMobileMenuToggle?: () => void;
}

/** Props for the MainLayout component. */
export interface MainLayoutProps {
  /** Content rendered in the main content area */
  children: ReactNode;
  /** Optional content for the sidebar / configuration panel */
  sidebar?: ReactNode;
  /** Whether the sidebar is visible */
  showSidebar?: boolean;
  /** Optional class names for the main content area */
  className?: string;
}

/** Props for the content area wrapper. */
export interface ContentAreaProps {
  /** Child nodes to render inside the content area */
  children: ReactNode;
  /** Optional additional CSS class names */
  className?: string;
}

/** Props for the sidebar / configuration panel. */
export interface SidebarProps {
  /** Child nodes to render inside the sidebar */
  children?: ReactNode;
  /** Whether the sidebar is currently visible */
  isOpen?: boolean;
  /** Callback when sidebar visibility should toggle */
  onToggle?: () => void;
}
