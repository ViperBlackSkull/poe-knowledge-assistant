import { useState, useRef, useEffect, useCallback } from 'react';
import type { GameVersion } from '@/types/chat';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Describes a selectable game version option.
 */
export interface GameVersionOption {
  /** Machine-readable value sent to the API */
  value: GameVersion;
  /** Human-readable label shown in the dropdown */
  label: string;
  /** Short description shown below the label */
  description?: string;
}

/**
 * Props for the GameVersionSelector component.
 */
export interface GameVersionSelectorProps {
  /** Currently selected game version */
  value: GameVersion;
  /** Callback when the user selects a different version */
  onChange: (version: GameVersion) => void;
  /** Optional additional CSS class names */
  className?: string;
  /** Whether the selector is disabled */
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Available game version options. */
export const GAME_VERSION_OPTIONS: GameVersionOption[] = [
  {
    value: 'poe2',
    label: 'Path of Exile 2',
    description: 'Current Early Access',
  },
  {
    value: 'poe1',
    label: 'Path of Exile 1',
    description: '3.24 Necropolis',
  },
];

/**
 * Get a display label for a given GameVersion value.
 */
export function getGameVersionLabel(version: GameVersion): string {
  const option = GAME_VERSION_OPTIONS.find((o) => o.value === version);
  return option?.label ?? version;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * GameVersionSelector provides a PoE-themed dropdown for selecting
 * the game version to query against.
 *
 * Features:
 *  - Custom styled dropdown matching the PoE dark theme
 *  - Keyboard accessible (Enter/Space to open, Arrow keys to navigate)
 *  - Click-outside to close
 *  - Selected version badge display
 */
export function GameVersionSelector({
  value,
  onChange,
  className = '',
  disabled = false,
}: GameVersionSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(
    GAME_VERSION_OPTIONS.findIndex((o) => o.value === value),
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const optionsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const selectedOption = GAME_VERSION_OPTIONS.find((o) => o.value === value);

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
      setHighlightedIndex(GAME_VERSION_OPTIONS.findIndex((o) => o.value === value));
    }
  }, [isOpen, value]);

  const handleToggle = useCallback(() => {
    if (!disabled) {
      setIsOpen((prev) => !prev);
    }
  }, [disabled]);

  const handleSelect = useCallback(
    (option: GameVersionOption) => {
      onChange(option.value);
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
            // Select the highlighted option
            const highlighted = GAME_VERSION_OPTIONS[highlightedIndex];
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
              prev < GAME_VERSION_OPTIONS.length - 1 ? prev + 1 : 0,
            );
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (isOpen) {
            setHighlightedIndex((prev) =>
              prev > 0 ? prev - 1 : GAME_VERSION_OPTIONS.length - 1,
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
      data-testid="game-version-selector"
    >
      {/* Trigger button */}
      <button
        type="button"
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={`
          flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium
          transition-all duration-200 border
          ${
            disabled
              ? 'opacity-50 cursor-not-allowed bg-poe-bg-tertiary border-poe-border text-poe-text-muted'
              : isOpen
                ? 'bg-poe-bg-tertiary border-poe-gold text-poe-text-highlight shadow-poe-glow'
                : 'bg-poe-bg-secondary border-poe-border text-poe-text-secondary hover:text-poe-text-highlight hover:border-poe-border-light hover:bg-poe-hover'
          }
        `}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Select game version, currently ${selectedOption?.label ?? value}`}
        data-testid="game-version-trigger"
      >
        {/* Version icon */}
        <svg
          className="w-4 h-4 text-poe-gold shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>

        {/* Selected label */}
        <span className="whitespace-nowrap">{selectedOption?.label ?? value}</span>

        {/* Chevron icon */}
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
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          className="
            absolute right-0 mt-1 w-64 rounded-lg
            bg-poe-bg-secondary border border-poe-border
            shadow-lg shadow-black/40 z-50
            overflow-hidden
          "
          role="listbox"
          aria-label="Game version options"
          data-testid="game-version-dropdown"
        >
          {/* Dropdown header */}
          <div className="px-3 py-2 border-b border-poe-border bg-poe-bg-tertiary">
            <span className="text-xs text-poe-gold font-semibold uppercase tracking-wider font-poe">
              Game Version
            </span>
          </div>

          {/* Options list */}
          <div className="py-1">
            {GAME_VERSION_OPTIONS.map((option, index) => {
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
                  data-testid={`game-version-option-${option.value}`}
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
                    <div className="text-sm font-medium truncate">{option.label}</div>
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
              Select which game version to query against
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
