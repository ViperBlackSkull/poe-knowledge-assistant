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
    description: 'Legacy',
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
      {/* Pill trigger button */}
      <button
        type="button"
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={`
          flex items-center gap-1.5 px-2.5 py-1 rounded-[3px] text-xs font-medium
          transition-all duration-200 border
          ${
            disabled
              ? 'opacity-50 cursor-not-allowed bg-poe-bg-tertiary border-poe-border text-[#6B6B75]'
              : isOpen
                ? 'bg-[#1A1510] border-poe-gold text-poe-gold-light shadow-poe-glow'
                : 'bg-poe-bg-secondary border-poe-border text-poe-text-secondary hover:text-poe-text-primary hover:border-poe-border-light hover:bg-poe-hover'
          }
        `}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Select game version, currently ${selectedOption?.label ?? value}`}
        data-testid="game-version-trigger"
      >
        {/* Selected label */}
        <span className="whitespace-nowrap">{selectedOption?.label ?? value}</span>

        {/* Chevron icon */}
        <svg
          className={`w-3 h-3 shrink-0 transition-transform duration-200 ${
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
            absolute right-0 mt-1 w-56 rounded-[3px]
            bg-poe-bg-secondary border border-poe-border
            shadow-lg shadow-black/50 z-50
            overflow-hidden animate-poe-fade-in
          "
          role="listbox"
          aria-label="Game version options"
          data-testid="game-version-dropdown"
        >
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
                    w-full text-left px-3 py-2 flex items-center gap-2.5
                    transition-colors duration-150
                    ${isHighlighted ? 'bg-poe-hover' : ''}
                    ${isSelected ? 'text-poe-gold-light' : 'text-poe-text-secondary hover:text-poe-text-primary'}
                  `}
                  role="option"
                  aria-selected={isSelected}
                  data-testid={`game-version-option-${option.value}`}
                >
                  {/* Selection indicator */}
                  <div className="w-3.5 h-3.5 shrink-0 flex items-center justify-center">
                    {isSelected ? (
                      <div className="w-2 h-2 rounded-full bg-poe-gold" />
                    ) : (
                      <div className="w-2 h-2 rounded-full border border-poe-border" />
                    )}
                  </div>

                  {/* Option content */}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{option.label}</div>
                    {option.description && (
                      <div className="text-[10px] text-[#6B6B75] mt-0.5 truncate">
                        {option.description}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
