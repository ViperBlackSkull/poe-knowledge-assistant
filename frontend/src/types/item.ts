/**
 * Item display types for the PoE Item Card component.
 *
 * These types define the data structure for displaying Path of Exile items
 * in the UI, including rarity-based styling, stats, and metadata.
 */

import type { ItemType, Game } from './scraper';

// ---------------------------------------------------------------------------
// Enums / Union types
// ---------------------------------------------------------------------------

/** PoE item rarity levels. Determines border/text color and visual styling. */
export type ItemRarity =
  | 'normal'
  | 'magic'
  | 'rare'
  | 'unique'
  | 'gem'
  | 'currency'
  | 'divination_card'
  | 'prophecy'
  | 'relic';

/** Slot types for equipment items. */
export type ItemSlot =
  | 'weapon'
  | 'offhand'
  | 'helmet'
  | 'body_armour'
  | 'gloves'
  | 'boots'
  | 'belt'
  | 'ring'
  | 'amulet'
  | 'flask'
  | 'jewel'
  | 'map'
  | 'gem_active'
  | 'gem_support';

/** Influence types for items. */
export type ItemInfluence =
  | 'shaper'
  | 'elder'
  | 'crusader'
  | 'hunter'
  | 'redeemer'
  | 'warlord';

/** Display variant for the item card. */
export type ItemCardVariant = 'compact' | 'default' | 'detailed';

// ---------------------------------------------------------------------------
// Item stat types
// ---------------------------------------------------------------------------

/** A single item stat/modifier line. */
export interface ItemStat {
  /** The stat text as displayed in-game (e.g., "+25% to Cold Resistance") */
  text: string;
  /** Whether this is a crafted modifier */
  crafted?: boolean;
  /** Whether this is a fractured modifier */
  fractured?: boolean;
  /** Whether this is an implicit modifier */
  implicit?: boolean;
  /** Whether this is a corrupted modifier */
  corrupted?: boolean;
  /** Optional numeric value for sorting/filtering */
  value?: number;
}

/** Item requirements to use the item. */
export interface ItemRequirements {
  /** Level requirement */
  level?: number;
  /** Strength requirement */
  strength?: number;
  /** Dexterity requirement */
  dexterity?: number;
  /** Intelligence requirement */
  intelligence?: number;
  /** Class restriction (e.g., "Witch", "Marauder") */
  classRestriction?: string;
}

/** Item quality information. */
export interface ItemQuality {
  /** Current quality percentage (0-30) */
  value: number;
  /** Maximum quality (typically 20) */
  max?: number;
}

// ---------------------------------------------------------------------------
// Core item display data
// ---------------------------------------------------------------------------

/**
 * Complete item display data for the ItemCard component.
 *
 * This extends the raw PoEItem from scraper types with display-specific
 * information like rarity, explicit stats, and influence.
 */
export interface ItemDisplayData {
  /** Unique identifier for the item */
  id: string;
  /** Item name (e.g., "Stormcaller") */
  name: string;
  /** Item base type name (e.g., "Expert Staff") */
  baseType?: string;
  /** Type of item for categorization */
  itemType: ItemType;
  /** Item rarity */
  rarity: ItemRarity;
  /** Which game this item belongs to */
  game: Game;

  // Visual / description
  /** URL to the item icon image */
  iconUrl?: string;
  /** Item description or flavor text */
  description?: string;
  /** Secondary flavor text (unique items often have lore text) */
  flavourText?: string;

  // Stats and modifiers
  /** Implicit modifiers (built into the base type) */
  implicitStats?: ItemStat[];
  /** Explicit modifiers (from rarity) */
  explicitStats?: ItemStat[];
  /** Crafted modifiers */
  craftedStats?: ItemStat[];
  /** Total modifier count / max (e.g., "4/6") */
  modifierCount?: { current: number; max: number };

  // Requirements
  /** Requirements to use the item */
  requirements?: ItemRequirements;

  // Properties
  /** Item level */
  itemLevel?: number;
  /** Quality percentage */
  quality?: ItemQuality;
  /** Item slot */
  slot?: ItemSlot;
  /** Stack size for stackable items (e.g., currency, divination cards) */
  stackSize?: { current: number; max: number };
  /** Gem level (for skill gems) */
  gemLevel?: number;
  /** Map tier (for maps) */
  mapTier?: number;

  // Influence / special states
  /** Influences on the item */
  influences?: ItemInfluence[];
  /** Whether the item is corrupted */
  corrupted?: boolean;
  /** Whether the item is mirrored (copy) */
  mirrored?: boolean;
  /** Whether the item is identified */
  identified?: boolean;
  /** Whether the item is a replica */
  replica?: boolean;
  /** Whether the item is fractured */
  fractured?: boolean;
  /** Whether the item is synthesized */
  synthesized?: boolean;
  /** Whether the item is veiled */
  veiled?: boolean;

  // Weapon/armor specific
  /** Weapon damage info (for weapons) */
  weaponDamage?: {
    physicalMin: number;
    physicalMax: number;
    elementalMin?: number;
    elementalMax?: number;
    chaosMin?: number;
    chaosMax?: number;
    attacksPerSecond?: number;
    criticalStrikeChance?: number;
    range?: number;
  };
  /** Armor/defense info (for armor pieces) */
  defenses?: {
    armour?: number;
    evasion?: number;
    energyShield?: number;
    ward?: number;
    blockChance?: number;
  };

  // Metadata
  /** Tags associated with the item */
  tags?: string[];
  /** Categories this item belongs to */
  categories?: string[];
  /** Source URL for more information */
  sourceUrl?: string;
}

// ---------------------------------------------------------------------------
// Component props
// ---------------------------------------------------------------------------

/** Props for the ItemCard component. */
export interface ItemCardProps {
  /** The item data to display */
  item: ItemDisplayData;
  /** Display variant */
  variant?: ItemCardVariant;
  /** Optional click handler */
  onClick?: (item: ItemDisplayData) => void;
  /** Optional hover handler */
  onHover?: (item: ItemDisplayData | null) => void;
  /** Whether the card is selected */
  selected?: boolean;
  /** Whether the card is in a loading/skeleton state */
  loading?: boolean;
  /** Additional CSS class names */
  className?: string;
  /** Whether to show the item icon */
  showIcon?: boolean;
  /** Whether to show item requirements */
  showRequirements?: boolean;
  /** Whether to show the source link */
  showSource?: boolean;
}

/** Props for the ItemCardGrid component. */
export interface ItemCardGridProps {
  /** Array of items to display */
  items: ItemDisplayData[];
  /** Display variant for all cards */
  variant?: ItemCardVariant;
  /** Optional click handler for any card */
  onCardClick?: (item: ItemDisplayData) => void;
  /** Selected item ID */
  selectedId?: string;
  /** Whether to show icons on cards */
  showIcons?: boolean;
  /** Number of columns (responsive: sm, md, lg, xl) */
  columns?: {
    sm?: number;
    md?: number;
    lg?: number;
    xl?: number;
  };
  /** Additional CSS class names */
  className?: string;
}

// ---------------------------------------------------------------------------
// Enhanced Grid Types (task-40)
// ---------------------------------------------------------------------------

/** Grid layout mode for the enhanced item card grid. */
export type GridLayoutMode = 'grid' | 'list';

/** Available sort fields for items. */
export type ItemSortField =
  | 'name'
  | 'rarity'
  | 'itemLevel'
  | 'itemType'
  | 'gemLevel'
  | 'mapTier';

/** Sort direction. */
export type SortDirection = 'asc' | 'desc';

/** Sort configuration for the grid. */
export interface ItemSortConfig {
  /** Which field to sort by */
  field: ItemSortField;
  /** Sort direction */
  direction: SortDirection;
}

/** Filter state for the grid. */
export interface ItemFilterState {
  /** Text search filter (matches name and baseType) */
  searchText: string;
  /** Filter by rarities (empty = show all) */
  rarities: ItemRarity[];
  /** Filter by item types (empty = show all) */
  itemTypes: ItemType[];
  /** Minimum item level filter */
  minItemLevel?: number;
  /** Maximum item level filter */
  maxItemLevel?: number;
}

/** Pagination state for the grid. */
export interface ItemPaginationState {
  /** Current page number (1-based) */
  currentPage: number;
  /** Number of items per page */
  pageSize: number;
  /** Total number of items (after filtering) */
  totalItems: number;
}

/** Grid configuration options. */
export interface ItemGridConfig {
  /** Layout mode (grid or list) */
  layout: GridLayoutMode;
  /** Column configuration for responsive grid layout */
  columns: {
    sm?: number;
    md?: number;
    lg?: number;
    xl?: number;
  };
  /** Number of items per page (0 = no pagination / show all) */
  pageSize: number;
  /** Whether to show the filter panel */
  showFilters: boolean;
  /** Whether to show the sort controls */
  showSort: boolean;
  /** Whether to show the pagination controls */
  showPagination: boolean;
  /** Whether to show the item count summary */
  showItemCount: boolean;
  /** Whether to show the layout toggle (grid/list) */
  showLayoutToggle: boolean;
  /** Empty state message override */
  emptyMessage?: string;
  /** Empty state icon (SVG path data) override */
  emptyIcon?: string;
  /** Loading skeleton count */
  skeletonCount: number;
}

/** Event callbacks for the enhanced grid. */
export interface ItemGridEvents {
  /** Fired when filters change */
  onFilterChange?: (filters: ItemFilterState) => void;
  /** Fired when sort configuration changes */
  onSortChange?: (sort: ItemSortConfig) => void;
  /** Fired when page changes */
  onPageChange?: (page: number) => void;
  /** Fired when layout mode changes */
  onLayoutChange?: (layout: GridLayoutMode) => void;
  /** Fired when a card is clicked */
  onCardClick?: (item: ItemDisplayData) => void;
  /** Fired when a card is hovered */
  onCardHover?: (item: ItemDisplayData | null) => void;
}

/** Complete props for the enhanced ItemCardGrid component. */
export interface EnhancedItemCardGridProps {
  /** Array of items to display (before filtering/sorting) */
  items: ItemDisplayData[];
  /** Display variant for all cards */
  variant?: ItemCardVariant;
  /** Selected item ID */
  selectedId?: string;
  /** Whether to show icons on cards */
  showIcons?: boolean;
  /** Whether the grid is in a loading state */
  loading?: boolean;
  /** Grid configuration */
  config?: Partial<ItemGridConfig>;
  /** Initial filter state */
  initialFilters?: Partial<ItemFilterState>;
  /** Initial sort configuration */
  initialSort?: ItemSortConfig;
  /** Event callbacks */
  events?: ItemGridEvents;
  /** Additional CSS class names for the outer container */
  className?: string;
}
