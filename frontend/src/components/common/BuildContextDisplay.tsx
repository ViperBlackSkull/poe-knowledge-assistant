import type { BuildContextValue } from '@/hooks/useBuildContext';
import { getBuildContextLabel } from '@/hooks/useBuildContext';
import { BUILD_CONTEXT_OPTIONS } from './BuildContextSelector';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Props for the BuildContextDisplay component.
 */
export interface BuildContextDisplayProps {
  /** Currently selected build context value (empty string = none selected) */
  context: BuildContextValue;
  /** Optional additional CSS class names */
  className?: string;
  /** Whether to show the display in a compact mode (no icon, smaller text) */
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the tag/abbreviation for a given build context value.
 */
function getContextTag(context: BuildContextValue): string | undefined {
  const option = BUILD_CONTEXT_OPTIONS.find((o) => o.value === context);
  return option?.tag;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * BuildContextDisplay shows the currently selected build context as a
 * prominent badge in the header area.
 *
 * Features:
 *  - Only renders when a build context is actually selected (empty = hidden)
 *  - PoE-themed badge with gold accent and glow effect
 *  - Displays context label prominently with an optional tag badge
 *  - Supports compact mode for smaller screens
 *  - Smooth fade-in/fade-out transition when context changes
 *  - Accessible with aria-label describing the current context
 */
export function BuildContextDisplay({
  context,
  className = '',
  compact = false,
}: BuildContextDisplayProps) {
  // Don't render anything when no context is selected
  if (!context) {
    return null;
  }

  const label = getBuildContextLabel(context);
  const tag = getContextTag(context);

  // Determine if we should show the tag (skip in compact mode or if tag
  // duplicates the label)
  const showTag = tag && !compact && tag !== label;

  return (
    <div
      className={`
        inline-flex items-center gap-1.5
        ${compact ? 'px-2 py-0.5' : 'px-2.5 py-1'}
        rounded
        bg-poe-bg-tertiary
        border border-poe-gold/30
        text-poe-gold
        transition-all duration-300 ease-in-out
        ${className}
      `}
      aria-label={`Build context: ${label}`}
      data-testid="build-context-display"
      data-context={context}
    >
      {/* Sparkle/star icon indicating active context */}
      {!compact && (
        <svg
          className="w-3.5 h-3.5 shrink-0 text-poe-gold"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
          />
        </svg>
      )}

      {/* Indicator dot (always shown) */}
      <span className="w-1.5 h-1.5 rounded-full bg-poe-gold shrink-0" />

      {/* Context label */}
      <span
        className={`font-medium whitespace-nowrap ${
          compact ? 'text-xs' : 'text-sm'
        }`}
      >
        {label}
      </span>

      {/* Optional tag badge */}
      {showTag && (
        <span className="shrink-0 px-1 py-0 rounded text-[10px] font-semibold uppercase tracking-wide bg-poe-gold/15 text-poe-gold border border-poe-gold/20">
          {tag}
        </span>
      )}
    </div>
  );
}
