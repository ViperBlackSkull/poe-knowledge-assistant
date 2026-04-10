import { useState, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Build context option values.
 * Represents different Path of Exile build archetypes/contexts.
 */
export type BuildContextValue =
  | 'standard'
  | 'budget'
  | 'hc'
  | 'ssf'
  | 'ruthless'
  | 'pvp'
  | '';

/**
 * State and callbacks returned by the useBuildContext hook.
 */
export interface UseBuildContextReturn {
  /** Currently selected build context value (empty string = none selected) */
  buildContext: BuildContextValue;
  /** Human-readable label for the currently selected context */
  buildContextLabel: string;
  /** Callback to update the build context */
  setBuildContext: (context: BuildContextValue) => void;
  /** Whether a build context is currently selected */
  hasContext: boolean;
}

// ---------------------------------------------------------------------------
// Label helper
// ---------------------------------------------------------------------------

const BUILD_CONTEXT_LABELS: Record<BuildContextValue, string> = {
  standard: 'Standard',
  budget: 'Budget',
  hc: 'Hardcore',
  ssf: 'SSF',
  ruthless: 'Ruthless',
  pvp: 'PvP',
  '': 'No Context',
};

/**
 * Get a human-readable label for a build context value.
 */
export function getBuildContextLabel(context: BuildContextValue): string {
  return BUILD_CONTEXT_LABELS[context] ?? context;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Custom hook for managing the build context selection state.
 *
 * Persists the selected context to localStorage so it survives page reloads.
 * Provides the current value, label, and a setter.
 */
export function useBuildContext(): UseBuildContextReturn {
  const STORAGE_KEY = 'poe-knowledge-assistant-build-context';

  const [buildContext, setBuildContextState] = useState<BuildContextValue>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && stored in BUILD_CONTEXT_LABELS) {
        return stored as BuildContextValue;
      }
    } catch {
      // Ignore localStorage errors
    }
    return '';
  });

  const setBuildContext = useCallback((context: BuildContextValue) => {
    setBuildContextState(context);
    try {
      if (context === '') {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, context);
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  return {
    buildContext,
    buildContextLabel: getBuildContextLabel(buildContext),
    setBuildContext,
    hasContext: buildContext !== '',
  };
}
