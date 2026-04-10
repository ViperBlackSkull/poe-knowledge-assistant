import { useState, useRef, useEffect, useCallback } from 'react';
import type { BuildContextValue } from '@/hooks/useBuildContext';
import { getBuildContextLabel } from '@/hooks/useBuildContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Describes a selectable build context option.
 */
export interface BuildContextOption {
  /** Machine-readable value sent to the API */
  value: BuildContextValue;
  /** Human-readable label shown in the dropdown */
  label: string;
  /** Short description shown below the label */
  description?: string;
  /** Optional tag/badge shown in the option */
  tag?: string;
}

/**
 * Props for the BuildContextSelector component.
 */
export interface BuildContextSelectorProps {
  /** Currently selected build context */
  value: BuildContextValue;
  /** Callback when the user selects a different context */
  onChange: (context: BuildContextValue) => void;
  /** Optional additional CSS class names */
  className?: string;
  /** Whether the selector is disabled */
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Available build context options. */
export const BUILD_CONTEXT_OPTIONS: BuildContextOption[] = [
  {
    value: 'standard',
    label: 'Standard',
    description: 'Standard league / softcore economy',
    tag: 'SC',
  },
  {
    value: 'budget',
    label: 'Budget',
    description: 'Low-cost / starter-friendly builds',
    tag: 'Budget',
  },
  {
    value: 'hc',
    label: 'Hardcore',
    description: 'Hardcore league - death is permanent',
    tag: 'HC',
  },
  {
    value: 'ssf',
    label: 'Solo Self-Found',
    description: 'No trading, self-found gear only',
    tag: 'SSF',
  },
  {
    value: 'ruthless',
    label: 'Ruthless',
    description: 'Extreme scarcity mode',
    tag: 'Ruth',
  },
  {
    value: 'pvp',
    label: 'PvP',
    description: 'Player versus player combat builds',
    tag: 'PvP',
  },
];

/**
 * Get a display label for a given BuildContextValue.
 */
export function getBuildContextOptionLabel(context: BuildContextValue): string {
  if (context === '') return 'Build Context';
  const option = BUILD_CONTEXT_OPTIONS.find((o) => o.value === context);
  return option?.label ?? context;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * BuildContextSelector provides a PoE-themed dropdown for selecting
 * the build context to use when querying the knowledge base.
 *
 * Features:
 *  - Custom styled dropdown matching the PoE dark theme
 *  - Keyboard accessible (Enter/Space to open, Arrow keys to navigate)
 *  - Click-outside to close
 *  - Clear button to deselect context
 *  - Tags for quick visual identification
 */
export function BuildContextSelector({
  value,
  onChange,
  className = '',
  disabled = false,
}: BuildContextSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(
    BUILD_CONTEXT_OPTIONS.findIndex((o) => o.value === value),
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const optionsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const selectedOption = BUILD_CONTEXT_OPTIONS.find((o) => o.value === value);
  const hasSelection = value !== '';

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Reset highlighted index when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setHighlightedIndex(
        BUILD_CONTEXT_OPTIONS.findIndex((o) => o.value === value),
      );
    }
  }, [isOpen, value]);

  const handleToggle = useCallback(() => {
    if (!disabled) {
      setIsOpen((prev) => !prev);
    }
  }, [disabled]);

  const handleSelect = useCallback(
    (option: BuildContextOption) => {
      // Toggle: if already selected, deselect
      if (option.value === value) {
        onChange('');
      } else {
        onChange(option.value);
      }
      setIsOpen(false);
    },
    [onChange, value],
  );

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange('');
      setIsOpen(false);
    },
    [onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (!isOpen) {
            setIsOpen(true);
          } else {
            const highlighted = BUILD_CONTEXT_OPTIONS[highlightedIndex];
            if (highlighted) {
              handleSelect(highlighted);
            }
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (!isOpen) {
            setIsOpen(true);
          } else {
            setHighlightedIndex((prev) =>
              prev < BUILD_CONTEXT_OPTIONS.length - 1 ? prev + 1 : 0,
            );
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (isOpen) {
            setHighlightedIndex((prev) =>
              prev > 0 ? prev - 1 : BUILD_CONTEXT_OPTIONS.length - 1,
            );
          }
          break;
        case 'Escape':
          e.preventDefault();
          setIsOpen(false);
          break;
      }
    },
    [isOpen, highlightedIndex, handleSelect],
  );

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && optionsRef.current[highlightedIndex]) {
      optionsRef.current[highlightedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [isOpen, highlightedIndex]);

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      data-testid="build-context-selector"
    >
      {/* Trigger area: button + optional clear */}
      <div className="flex items-center">
        <button
          type="button"
          onClick={handleToggle}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className={`
            flex items-center gap-2 px-3 py-1.5 rounded-l text-sm font-medium
            transition-all duration-200 border
            ${
              disabled
                ? 'opacity-50 cursor-not-allowed bg-poe-bg-tertiary border-poe-border text-poe-text-muted'
                : hasSelection
                  ? 'bg-poe-bg-tertiary border-poe-gold/60 text-poe-gold shadow-poe-glow'
                  : isOpen
                    ? 'bg-poe-bg-tertiary border-poe-gold text-poe-text-highlight shadow-poe-glow'
                    : 'bg-poe-bg-secondary border-poe-border text-poe-text-secondary hover:text-poe-text-highlight hover:border-poe-border-light hover:bg-poe-hover'
            }
            ${hasSelection && !isOpen ? 'rounded-r-none border-r-0' : 'rounded-r'}
          `}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-label={`Select build context${hasSelection ? `, currently ${selectedOption?.label ?? value}` : ''}`}
          data-testid="build-context-trigger"
        >
          {/* Build icon (sword/shield style) */}
          <svg
            className={`w-4 h-4 shrink-0 ${hasSelection ? 'text-poe-gold' : ''}`}
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

          {/* Selected label or default */}
          <span className="whitespace-nowrap">
            {hasSelection ? selectedOption?.label ?? value : 'Build Context'}
          </span>

          {/* Chevron icon (only when not showing clear button) */}
          {!hasSelection && (
            <svg
              className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${
                isOpen ? 'rotate-180' : ''
              }`}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 8.25l-7.5 7.5-7.5-7.5"
              />
            </svg>
          )}
        </button>

        {/* Clear button - shown as sibling when something is selected */}
        {hasSelection && !isOpen && (
          <button
            type="button"
            onClick={handleClear}
            className="
              flex items-center justify-center px-2 py-1.5 rounded-r text-sm
              bg-poe-bg-tertiary border border-l-0 border-poe-gold/60
              text-poe-text-muted hover:text-poe-text-highlight hover:bg-poe-hover
              transition-colors duration-200
            "
            aria-label="Clear build context"
            data-testid="build-context-clear"
          >
            <svg
              className="w-3 h-3"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          className="
            absolute right-0 mt-1 w-72 rounded-lg
            bg-poe-bg-secondary border border-poe-border
            shadow-lg shadow-black/40 z-50
            overflow-hidden
          "
          role="listbox"
          aria-label="Build context options"
          data-testid="build-context-dropdown"
        >
          {/* Dropdown header */}
          <div className="px-3 py-2 border-b border-poe-border bg-poe-bg-tertiary">
            <span className="text-xs text-poe-gold font-semibold uppercase tracking-wider font-poe">
              Build Context
            </span>
            <p className="text-[10px] text-poe-text-muted mt-0.5">
              Select a build archetype for tailored responses
            </p>
          </div>

          {/* Options list */}
          <div className="py-1 max-h-64 overflow-y-auto">
            {BUILD_CONTEXT_OPTIONS.map((option, index) => {
              const isSelected = option.value === value;
              const isHighlighted = index === highlightedIndex;

              return (
                <button
                  key={option.value}
                  ref={(el) => {
                    optionsRef.current[index] = el;
                  }}
                  type="button"
                  onClick={() => handleSelect(option)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`
                    w-full text-left px-3 py-2.5 flex items-center gap-3
                    transition-colors duration-150
                    ${isHighlighted ? 'bg-poe-hover' : ''}
                    ${isSelected ? 'text-poe-gold' : 'text-poe-text-secondary hover:text-poe-text-highlight'}
                  `}
                  role="option"
                  aria-selected={isSelected}
                  data-testid={`build-context-option-${option.value}`}
                >
                  {/* Selection indicator */}
                  <div className="w-4 h-4 shrink-0 flex items-center justify-center">
                    {isSelected ? (
                      <svg
                        className="w-4 h-4 text-poe-gold"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full border border-poe-border" />
                    )}
                  </div>

                  {/* Option content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{option.label}</span>
                      {option.tag && (
                        <span
                          className={`
                            shrink-0 px-1.5 py-0 rounded text-[10px] font-semibold uppercase tracking-wide
                            ${isSelected
                              ? 'bg-poe-gold/20 text-poe-gold border border-poe-gold/30'
                              : 'bg-poe-bg-primary text-poe-text-muted border border-poe-border'
                            }
                          `}
                        >
                          {option.tag}
                        </span>
                      )}
                    </div>
                    {option.description && (
                      <div className="text-xs text-poe-text-muted mt-0.5 truncate">
                        {option.description}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Dropdown footer */}
          <div className="px-3 py-2 border-t border-poe-border bg-poe-bg-primary">
            <p className="text-xs text-poe-text-muted">
              {hasSelection
                ? `Active: ${getBuildContextLabel(value)}`
                : 'No build context selected'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
