import { type CSSProperties } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Variant determines the visual style of the typing indicator.
 *
 * - `'dots'` - Three bouncing dots (default)
 * - `'pulse'` - A pulsing bar indicator
 * - `'wave'` - Three dots with a wave animation
 */
export type TypingIndicatorVariant = 'dots' | 'pulse' | 'wave';

/**
 * Size preset for the typing indicator.
 */
export type TypingIndicatorSize = 'sm' | 'md' | 'lg';

/**
 * Props for the TypingIndicator component.
 */
export interface TypingIndicatorProps {
  /** Whether the typing indicator is visible */
  isVisible: boolean;
  /** Custom label text displayed next to the indicator (default: "Assistant is thinking...") */
  label?: string;
  /** Visual variant of the animation (default: "dots") */
  variant?: TypingIndicatorVariant;
  /** Size preset for dot/bar sizing (default: "md") */
  size?: TypingIndicatorSize;
  /** Whether to show the label text alongside the animation (default: true) */
  showLabel?: boolean;
  /** Whether to display as an inline element or as a chat bubble (default: "inline") */
  display?: 'inline' | 'bubble';
  /** Optional additional CSS class names */
  className?: string;
  /** Optional inline styles */
  style?: CSSProperties;
  /** Accessibility label for the indicator container (default: "AI is typing") */
  ariaLabel?: string;
  /** Custom dot/bar color - accepts any Tailwind-compatible color class (default: "bg-poe-gold") */
  dotColor?: string;
  /** Animation speed in milliseconds between dot delays (default: 150) */
  animationSpeed?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_LABEL = 'Assistant is thinking...';
const DEFAULT_ARIA_LABEL = 'AI is typing';

const SIZE_MAP: Record<TypingIndicatorSize, { dot: string; gap: string; text: string }> = {
  sm: { dot: 'w-1.5 h-1.5', gap: 'gap-0.5', text: 'text-xs' },
  md: { dot: 'w-2 h-2', gap: 'gap-1', text: 'text-sm' },
  lg: { dot: 'w-2.5 h-2.5', gap: 'gap-1.5', text: 'text-base' },
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Bouncing dots animation (default variant).
 * Three dots that bounce in sequence with staggered delays.
 */
function BouncingDots({
  size,
  dotColor,
  animationSpeed,
}: {
  size: TypingIndicatorSize;
  dotColor: string;
  animationSpeed: number;
}) {
  const s = SIZE_MAP[size];
  return (
    <div className={`flex items-center ${s.gap}`} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`${s.dot} ${dotColor} rounded-full animate-bounce`}
          style={{ animationDelay: `${i * animationSpeed}ms` }}
        />
      ))}
    </div>
  );
}

/**
 * Pulsing bar animation.
 * A single bar that smoothly pulses in opacity and scale.
 */
function PulsingBar({
  size,
  dotColor,
}: {
  size: TypingIndicatorSize;
  dotColor: string;
  animationSpeed: number;
}) {
  const heightClass = size === 'sm' ? 'h-1' : size === 'lg' ? 'h-2.5' : 'h-1.5';
  const widthClass = size === 'sm' ? 'w-12' : size === 'lg' ? 'w-20' : 'w-16';

  return (
    <div className="flex items-center gap-1" aria-hidden="true">
      <div
        className={`${widthClass} ${heightClass} ${dotColor} rounded-full animate-pulse`}
      />
    </div>
  );
}

/**
 * Wave animation.
 * Three dots that scale up and down in a wave pattern using CSS keyframes.
 */
function WaveDots({
  size,
  dotColor,
  animationSpeed,
}: {
  size: TypingIndicatorSize;
  dotColor: string;
  animationSpeed: number;
}) {
  const s = SIZE_MAP[size];
  return (
    <div className={`flex items-center ${s.gap}`} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`${s.dot} ${dotColor} rounded-full`}
          style={{
            animation: `typing-wave ${animationSpeed * 4}ms ease-in-out infinite`,
            animationDelay: `${i * animationSpeed}ms`,
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * TypingIndicator shows an animated visual cue when the AI assistant is
 * generating a response. It is designed to be a reusable component that
 * can be placed in the chat message list or alongside the chat input.
 *
 * Features:
 *  - Three animation variants: bouncing dots, pulsing bar, wave
 *  - Size presets: sm, md, lg
 *  - Optional label text ("Assistant is thinking...")
 *  - Inline or bubble display mode
 *  - Customizable color and animation speed
 *  - Full accessibility support with ARIA attributes
 */
export function TypingIndicator({
  isVisible,
  label = DEFAULT_LABEL,
  variant = 'dots',
  size = 'md',
  showLabel = true,
  display = 'inline',
  className = '',
  style,
  ariaLabel = DEFAULT_ARIA_LABEL,
  dotColor = 'bg-poe-gold',
  animationSpeed = 150,
}: TypingIndicatorProps) {
  if (!isVisible) return null;

  const sizeConfig = SIZE_MAP[size];

  // Select the animation sub-component based on variant
  const AnimationComponent = {
    dots: BouncingDots,
    pulse: PulsingBar,
    wave: WaveDots,
  }[variant];

  const animationElement = (
    <AnimationComponent
      size={size}
      dotColor={dotColor}
      animationSpeed={animationSpeed}
    />
  );

  // Bubble display: renders as a chat message bubble with avatar
  if (display === 'bubble') {
    return (
      <div
        className={`flex gap-3 mb-4 justify-start ${className}`}
        data-testid="typing-indicator"
        role="status"
        aria-label={ariaLabel}
        style={style}
      >
        {/* Assistant avatar */}
        <div
          className="shrink-0 w-8 h-8 rounded border flex items-center justify-center bg-poe-gold/20 border-poe-gold/30"
          aria-hidden="true"
        >
          <span className="text-xs font-bold text-poe-gold">A</span>
        </div>

        {/* Typing bubble */}
        <div className="poe-card max-w-[80%]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-poe-gold">Assistant</span>
          </div>
          <div className="flex items-center gap-2 py-1">
            {animationElement}
            {showLabel && (
              <span className={`text-poe-text-secondary ${sizeConfig.text}`}>
                {label}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Inline display: simple row with animation and label
  return (
    <div
      className={`flex items-center gap-2 text-poe-text-secondary ${sizeConfig.text} ${className}`}
      data-testid="typing-indicator"
      role="status"
      aria-label={ariaLabel}
      style={style}
    >
      {animationElement}
      {showLabel && <span>{label}</span>}
    </div>
  );
}
