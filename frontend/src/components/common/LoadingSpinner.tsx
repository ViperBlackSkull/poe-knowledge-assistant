import { type CSSProperties } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Size preset for the loading spinner.
 */
export type LoadingSpinnerSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/**
 * Props for the LoadingSpinner component.
 */
export interface LoadingSpinnerProps {
  /** Size preset (default: 'md') */
  size?: LoadingSpinnerSize;
  /** Optional CSS class for the spinner track color */
  color?: string;
  /** Optional label text displayed below or beside the spinner */
  label?: string;
  /** Whether to center the spinner in its container (default: false) */
  centered?: boolean;
  /** Whether to render as an inline element (default: false) */
  inline?: boolean;
  /** Additional CSS class names */
  className?: string;
  /** Accessible label for screen readers */
  ariaLabel?: string;
  /** Optional inline styles */
  style?: CSSProperties;
  /** Data testid for testing */
  testId?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SIZE_MAP: Record<LoadingSpinnerSize, { dimension: string; strokeWidth: string; label: string }> = {
  xs: { dimension: 'w-3 h-3', strokeWidth: 'stroke-width="3"', label: 'text-[10px]' },
  sm: { dimension: 'w-4 h-4', strokeWidth: 'stroke-width="3"', label: 'text-xs' },
  md: { dimension: 'w-6 h-6', strokeWidth: 'stroke-width="4"', label: 'text-sm' },
  lg: { dimension: 'w-8 h-8', strokeWidth: 'stroke-width="3"', label: 'text-sm' },
  xl: { dimension: 'w-12 h-12', strokeWidth: 'stroke-width="2.5"', label: 'text-base' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * LoadingSpinner provides a PoE-themed spinning indicator for async operations.
 *
 * Features:
 *  - Multiple size presets (xs, sm, md, lg, xl)
 *  - Customizable color via Tailwind classes
 *  - Optional label text
 *  - Centered or inline layout modes
 *  - Full ARIA accessibility support
 *  - Consistent with the PoE dark theme
 *
 * @example
 * ```tsx
 * <LoadingSpinner size="sm" label="Loading..." />
 * <LoadingSpinner size="lg" centered color="text-poe-gold" />
 * <LoadingSpinner size="xs" inline />
 * ```
 */
export function LoadingSpinner({
  size = 'md',
  color = 'text-poe-gold',
  label,
  centered = false,
  inline = false,
  className = '',
  ariaLabel,
  style,
  testId,
}: LoadingSpinnerProps) {
  const sizeConfig = SIZE_MAP[size];

  const spinnerSvg = (
    <svg
      className={`animate-spin ${sizeConfig.dimension} ${color} shrink-0`}
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
      {/* PoE-themed inner glow dot */}
      <circle
        className="animate-poe-ambient-pulse"
        cx="12"
        cy="12"
        r="2"
        fill="currentColor"
        opacity="0.5"
      />
    </svg>
  );

  const labelElement = label && (
    <span className={`${sizeConfig.label} text-poe-text-secondary mt-0`}>
      {label}
    </span>
  );

  // Inline mode: spinner + label in a row
  if (inline) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 ${className}`}
        role="status"
        aria-label={ariaLabel ?? label ?? 'Loading'}
        data-testid={testId ?? 'loading-spinner'}
        style={style}
      >
        {spinnerSvg}
        {labelElement}
      </span>
    );
  }

  // Centered mode: flex column with centered content
  if (centered) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-2 py-4 ${className}`}
        role="status"
        aria-label={ariaLabel ?? label ?? 'Loading'}
        data-testid={testId ?? 'loading-spinner'}
        style={style}
      >
        {spinnerSvg}
        {labelElement}
      </div>
    );
  }

  // Default: flex row
  return (
    <div
      className={`flex items-center gap-2 ${className}`}
      role="status"
      aria-label={ariaLabel ?? label ?? 'Loading'}
      data-testid={testId ?? 'loading-spinner'}
      style={style}
    >
      {spinnerSvg}
      {labelElement}
    </div>
  );
}
