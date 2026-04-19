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
        ${compact ? 'px-1.5 py-0.5' : 'px-2 py-0.5'}
        rounded-[3px]
        bg-poe-bg-tertiary
        border border-poe-border
        transition-all duration-300 ease-in-out
        animate-poe-fade-in
        ${className}
      `}
      aria-label={`Build context: ${label}`}
      data-testid="build-context-display"
      data-context={context}
    >
      {/* Indicator dot with gold accent */}
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${compact ? 'bg-poe-gold' : 'bg-poe-gold-light'}`}
        style={{ boxShadow: '0 0 4px rgba(175, 96, 37, 0.5)' }}
      />

      {/* Context label with gold accent */}
      <span
        className={`font-medium whitespace-nowrap text-poe-gold-light ${
          compact ? 'text-[10px]' : 'text-xs'
        }`}
      >
        {label}
      </span>

      {/* Optional tag badge */}
      {showTag && (
        <span className="shrink-0 px-1 py-0 rounded-[2px] text-[8px] font-semibold uppercase tracking-wide bg-poe-bg-secondary text-poe-text-muted border border-poe-border">
          {tag}
        </span>
      )}
    </div>
  );
}
