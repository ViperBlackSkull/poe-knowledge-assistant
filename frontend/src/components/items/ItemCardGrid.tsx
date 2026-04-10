import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type {
  ItemCardGridProps,
  EnhancedItemCardGridProps,
  ItemDisplayData,
  ItemRarity,
  ItemCardVariant,
  ItemSortField,
  ItemSortConfig,
  ItemFilterState,
  ItemPaginationState,
  ItemGridConfig,
  GridLayoutMode,
} from '@/types/item';
import type { ItemType } from '@/types/scraper';
import { ItemCard } from './ItemCard';

// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: ItemGridConfig = {
  layout: 'grid',
  columns: { sm: 1, md: 2, lg: 3, xl: 4 },
  pageSize: 12,
  showFilters: true,
  showSort: true,
  showPagination: true,
  showItemCount: true,
  showLayoutToggle: true,
  skeletonCount: 8,
};

const DEFAULT_FILTERS: ItemFilterState = {
  searchText: '',
  rarities: [],
  itemTypes: [],
};

const DEFAULT_SORT: ItemSortConfig = {
  field: 'name',
  direction: 'asc',
};

// ---------------------------------------------------------------------------
// Rarity and item type labels
// ---------------------------------------------------------------------------

const RARITY_OPTIONS: { value: ItemRarity; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'magic', label: 'Magic' },
  { value: 'rare', label: 'Rare' },
  { value: 'unique', label: 'Unique' },
  { value: 'gem', label: 'Gem' },
  { value: 'currency', label: 'Currency' },
  { value: 'divination_card', label: 'Divination Card' },
  { value: 'prophecy', label: 'Prophecy' },
  { value: 'relic', label: 'Relic' },
];

const ITEM_TYPE_OPTIONS: { value: ItemType; label: string }[] = [
  { value: 'weapon', label: 'Weapon' },
  { value: 'armor', label: 'Armor' },
  { value: 'accessory', label: 'Accessory' },
  { value: 'flask', label: 'Flask' },
  { value: 'gem', label: 'Gem' },
  { value: 'jewel', label: 'Jewel' },
  { value: 'currency', label: 'Currency' },
  { value: 'map', label: 'Map' },
  { value: 'divination_card', label: 'Divination Card' },
  { value: 'unique', label: 'Unique' },
  { value: 'other', label: 'Other' },
];

const SORT_OPTIONS: { value: ItemSortField; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'rarity', label: 'Rarity' },
  { value: 'itemLevel', label: 'Item Level' },
  { value: 'itemType', label: 'Item Type' },
  { value: 'gemLevel', label: 'Gem Level' },
  { value: 'mapTier', label: 'Map Tier' },
];

const RARITY_ORDER: Record<ItemRarity, number> = {
  normal: 0,
  magic: 1,
  rare: 2,
  unique: 3,
  gem: 4,
  currency: 5,
  divination_card: 6,
  prophecy: 7,
  relic: 8,
};

const PAGE_SIZE_OPTIONS = [6, 12, 24, 48];

// ---------------------------------------------------------------------------
// Tailwind column class maps (static for JIT compilation)
// ---------------------------------------------------------------------------

const COL_CLASSES: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
};

const MD_COL_CLASSES: Record<number, string> = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
  5: 'md:grid-cols-5',
  6: 'md:grid-cols-6',
};

const LG_COL_CLASSES: Record<number, string> = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
  6: 'lg:grid-cols-6',
};

const XL_COL_CLASSES: Record<number, string> = {
  1: 'xl:grid-cols-1',
  2: 'xl:grid-cols-2',
  3: 'xl:grid-cols-3',
  4: 'xl:grid-cols-4',
  5: 'xl:grid-cols-5',
  6: 'xl:grid-cols-6',
};

// ---------------------------------------------------------------------------
// Helper: filtering logic
// ---------------------------------------------------------------------------

function filterItems(items: ItemDisplayData[], filters: ItemFilterState): ItemDisplayData[] {
  return items.filter((item) => {
    // Search text filter
    if (filters.searchText) {
      const searchLower = filters.searchText.toLowerCase();
      const nameMatch = item.name.toLowerCase().includes(searchLower);
      const baseTypeMatch = item.baseType?.toLowerCase().includes(searchLower) ?? false;
      const descMatch = item.description?.toLowerCase().includes(searchLower) ?? false;
      if (!nameMatch && !baseTypeMatch && !descMatch) return false;
    }

    // Rarity filter
    if (filters.rarities.length > 0 && !filters.rarities.includes(item.rarity)) {
      return false;
    }

    // Item type filter
    if (filters.itemTypes.length > 0 && !filters.itemTypes.includes(item.itemType)) {
      return false;
    }

    // Item level range filter
    if (filters.minItemLevel != null && (item.itemLevel ?? 0) < filters.minItemLevel) {
      return false;
    }
    if (filters.maxItemLevel != null && (item.itemLevel ?? 0) > filters.maxItemLevel) {
      return false;
    }

    return true;
  });
}

// ---------------------------------------------------------------------------
// Helper: sorting logic
// ---------------------------------------------------------------------------

function sortItems(items: ItemDisplayData[], sort: ItemSortConfig): ItemDisplayData[] {
  const sorted = [...items];
  const dir = sort.direction === 'asc' ? 1 : -1;

  sorted.sort((a, b) => {
    switch (sort.field) {
      case 'name':
        return dir * a.name.localeCompare(b.name);
      case 'rarity':
        return dir * (RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity]);
      case 'itemLevel':
        return dir * ((a.itemLevel ?? 0) - (b.itemLevel ?? 0));
      case 'itemType':
        return dir * a.itemType.localeCompare(b.itemType);
      case 'gemLevel':
        return dir * ((a.gemLevel ?? 0) - (b.gemLevel ?? 0));
      case 'mapTier':
        return dir * ((a.mapTier ?? 0) - (b.mapTier ?? 0));
      default:
        return 0;
    }
  });

  return sorted;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Search input with PoE styling. */
function SearchInput({
  value,
  onChange,
  placeholder = 'Search items...',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-poe-text-muted pointer-events-none"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
        />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="poe-input w-full pl-9 pr-3 py-2 text-sm"
        aria-label="Search items"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-poe-text-muted hover:text-poe-text-primary transition-colors"
          aria-label="Clear search"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

/** Chip-style filter button for rarity or item type. */
function FilterChip({
  label,
  active,
  onClick,
  color,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        inline-flex items-center px-2 py-1 rounded text-[11px] font-medium
        transition-colors whitespace-nowrap
        ${
          active
            ? 'bg-poe-gold/20 text-poe-gold-light border border-poe-gold/40'
            : 'bg-poe-bg-tertiary text-poe-text-secondary border border-poe-border hover:bg-poe-hover hover:border-poe-border-light'
        }
      `}
      style={active && color ? { color, borderColor: `${color}60`, backgroundColor: `${color}15` } : undefined}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}

/** Sort control dropdown. */
function SortControl({
  sort,
  onSortChange,
}: {
  sort: ItemSortConfig;
  onSortChange: (sort: ItemSortConfig) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-poe-text-muted shrink-0">Sort:</label>
      <select
        value={sort.field}
        onChange={(e) => onSortChange({ ...sort, field: e.target.value as ItemSortField })}
        className="poe-input py-1 px-2 text-xs"
        aria-label="Sort field"
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <button
        onClick={() => onSortChange({ ...sort, direction: sort.direction === 'asc' ? 'desc' : 'asc' })}
        className="poe-button-secondary py-1 px-2 text-xs flex items-center gap-1"
        aria-label={`Sort ${sort.direction === 'asc' ? 'descending' : 'ascending'}`}
        title={sort.direction === 'asc' ? 'Ascending' : 'Descending'}
      >
        <svg
          className={`w-3.5 h-3.5 transition-transform ${sort.direction === 'desc' ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
        </svg>
        {sort.direction === 'asc' ? 'ASC' : 'DESC'}
      </button>
    </div>
  );
}

/** Layout toggle between grid and list. */
function LayoutToggle({
  layout,
  onLayoutChange,
}: {
  layout: GridLayoutMode;
  onLayoutChange: (layout: GridLayoutMode) => void;
}) {
  return (
    <div className="flex items-center gap-1 bg-poe-bg-tertiary rounded border border-poe-border p-0.5">
      <button
        onClick={() => onLayoutChange('grid')}
        className={`p-1.5 rounded transition-colors ${
          layout === 'grid'
            ? 'bg-poe-gold/20 text-poe-gold'
            : 'text-poe-text-muted hover:text-poe-text-secondary'
        }`}
        aria-label="Grid layout"
        aria-pressed={layout === 'grid'}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
          />
        </svg>
      </button>
      <button
        onClick={() => onLayoutChange('list')}
        className={`p-1.5 rounded transition-colors ${
          layout === 'list'
            ? 'bg-poe-gold/20 text-poe-gold'
            : 'text-poe-text-muted hover:text-poe-text-secondary'
        }`}
        aria-label="List layout"
        aria-pressed={layout === 'list'}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z"
          />
        </svg>
      </button>
    </div>
  );
}

/** Pagination controls. */
function Pagination({
  pagination,
  onPageChange,
  onPageSizeChange,
}: {
  pagination: ItemPaginationState;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(pagination.totalItems / pagination.pageSize));
  const currentPage = Math.min(pagination.currentPage, totalPages);

  // Generate visible page numbers with ellipsis
  const pageNumbers: (number | string)[] = useMemo(() => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('...');
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  }, [totalPages, currentPage]);

  if (pagination.totalItems === 0) return null;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-poe-border">
      {/* Page size selector */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-poe-text-muted">Show:</label>
        <select
          value={pagination.pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="poe-input py-1 px-2 text-xs"
          aria-label="Items per page"
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size} items
            </option>
          ))}
        </select>
      </div>

      {/* Page navigation */}
      <div className="flex items-center gap-1">
        {/* Previous button */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="poe-button-secondary py-1 px-2 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Previous page"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>

        {/* Page numbers */}
        {pageNumbers.map((page, idx) =>
          typeof page === 'string' ? (
            <span key={`ellipsis-${idx}`} className="px-1 text-xs text-poe-text-muted">
              ...
            </span>
          ) : (
            <button
              key={page}
              onClick={() => onPageChange(page)}
              className={`min-w-[28px] h-7 rounded text-xs font-medium transition-colors ${
                page === currentPage
                  ? 'bg-poe-gold text-white'
                  : 'bg-poe-bg-tertiary text-poe-text-secondary border border-poe-border hover:bg-poe-hover'
              }`}
              aria-label={`Page ${page}`}
              aria-current={page === currentPage ? 'page' : undefined}
            >
              {page}
            </button>
          )
        )}

        {/* Next button */}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="poe-button-secondary py-1 px-2 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Next page"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>

      {/* Page info */}
      <div className="text-xs text-poe-text-muted">
        Page {currentPage} of {totalPages}
      </div>
    </div>
  );
}

/** Empty state display. */
function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-16 text-poe-text-muted" data-testid="grid-empty-state">
      <svg
        className="w-16 h-16 mx-auto mb-4 opacity-30"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
        />
      </svg>
      <p className="text-sm font-medium mb-1">{message}</p>
      <p className="text-xs text-poe-text-muted">
        Try adjusting your search or filters
      </p>
    </div>
  );
}

/** Loading skeleton grid. */
function LoadingSkeleton({
  layout,
  columns,
  count,
  variant,
}: {
  layout: GridLayoutMode;
  columns: ItemGridConfig['columns'];
  count: number;
  variant: ItemCardVariant;
}) {
  const smClass = COL_CLASSES[columns.sm ?? 1] ?? 'grid-cols-1';
  const mdClass = MD_COL_CLASSES[columns.md ?? 2] ?? 'md:grid-cols-2';
  const lgClass = LG_COL_CLASSES[columns.lg ?? 3] ?? 'lg:grid-cols-3';
  const xlClass = XL_COL_CLASSES[columns.xl ?? 4] ?? 'xl:grid-cols-4';

  if (layout === 'list') {
    return (
      <div className="space-y-3" data-testid="grid-loading-skeleton">
        {Array.from({ length: count }, (_, i) => (
          <ItemCard
            key={`skeleton-${i}`}
            item={{ id: `skeleton-${i}`, name: '', itemType: 'other', rarity: 'normal', game: 'poe2' }}
            variant="compact"
            loading
          />
        ))}
      </div>
    );
  }

  return (
    <div className={`grid ${smClass} ${mdClass} ${lgClass} ${xlClass} gap-4`} data-testid="grid-loading-skeleton">
      {Array.from({ length: count }, (_, i) => (
        <ItemCard
          key={`skeleton-${i}`}
          item={{ id: `skeleton-${i}`, name: '', itemType: 'other', rarity: 'normal', game: 'poe2' }}
          variant={variant}
          loading
        />
      ))}
    </div>
  );
}

/** Item count summary badge. */
function ItemCountBadge({ total, filtered }: { total: number; filtered: number }) {
  const isFiltered = total !== filtered;
  return (
    <span className="text-xs text-poe-text-muted">
      {isFiltered ? (
        <>
          Showing <span className="text-poe-text-primary font-mono">{filtered}</span> of{' '}
          <span className="text-poe-text-secondary font-mono">{total}</span> items
        </>
      ) : (
        <>
          <span className="text-poe-text-primary font-mono">{total}</span> items
        </>
      )}
    </span>
  );
}

/** Clear all filters button. */
function ClearFiltersButton({
  onClick,
  hasActiveFilters,
}: {
  onClick: () => void;
  hasActiveFilters: boolean;
}) {
  if (!hasActiveFilters) return null;
  return (
    <button
      onClick={onClick}
      className="text-xs text-poe-gold hover:text-poe-gold-light transition-colors underline underline-offset-2"
    >
      Clear all filters
    </button>
  );
}

// ---------------------------------------------------------------------------
// Infinite scroll hook (intersection observer)
// ---------------------------------------------------------------------------

function useInfiniteScrollSentinel(callback: () => void, enabled: boolean) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          callback();
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [callback, enabled]);

  return sentinelRef;
}

// ---------------------------------------------------------------------------
// Basic ItemCardGrid (original, simple version -- kept for backward compat)
// ---------------------------------------------------------------------------

/**
 * Basic ItemCardGrid renders a responsive grid of ItemCard components.
 *
 * Automatically adjusts column count based on viewport width and the
 * provided columns configuration. Supports all ItemCard variants.
 */
export function ItemCardGrid({
  items,
  variant = 'default',
  onCardClick,
  selectedId,
  showIcons = true,
  columns = { sm: 1, md: 2, lg: 3, xl: 4 },
  className = '',
}: ItemCardGridProps) {
  const smClass = COL_CLASSES[columns.sm ?? 1] ?? 'grid-cols-1';
  const mdClass = MD_COL_CLASSES[columns.md ?? 2] ?? 'md:grid-cols-2';
  const lgClass = LG_COL_CLASSES[columns.lg ?? 3] ?? 'lg:grid-cols-3';
  const xlClass = XL_COL_CLASSES[columns.xl ?? 4] ?? 'xl:grid-cols-4';

  const gridClasses = `grid ${smClass} ${mdClass} ${lgClass} ${xlClass} gap-4`;

  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-poe-text-muted">
        <svg
          className="w-12 h-12 mx-auto mb-3 opacity-40"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
          />
        </svg>
        <p className="text-sm">No items found</p>
      </div>
    );
  }

  return (
    <div className={`${gridClasses} ${className}`}>
      {items.map((item) => (
        <ItemCard
          key={item.id}
          item={item}
          variant={variant}
          onClick={onCardClick}
          selected={selectedId === item.id}
          showIcon={showIcons}
          showRequirements={variant === 'detailed'}
          showSource={variant === 'detailed'}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Enhanced ItemCardGrid (task-40)
// ---------------------------------------------------------------------------

/**
 * EnhancedItemCardGrid is a full-featured item grid with:
 *
 * - Text search filtering (name, baseType, description)
 * - Rarity filter chips
 * - Item type filter chips
 * - Item level range filter
 * - Multi-field sorting with direction toggle
 * - Pagination with configurable page sizes
 * - Infinite scroll mode
 * - Grid / List layout toggle
 * - Loading skeleton states
 * - Empty state with customizable message
 * - Item count summary
 * - Fully responsive column configuration
 * - Keyboard accessible controls
 */
export function EnhancedItemCardGrid({
  items,
  variant = 'default',
  selectedId,
  showIcons = true,
  loading = false,
  config: configOverride,
  initialFilters,
  initialSort,
  events,
  className = '',
}: EnhancedItemCardGridProps) {
  // Merge config with defaults
  const config: ItemGridConfig = useMemo(
    () => ({ ...DEFAULT_CONFIG, ...configOverride }),
    [configOverride],
  );

  // State
  const [filters, setFilters] = useState<ItemFilterState>({
    ...DEFAULT_FILTERS,
    ...initialFilters,
  });
  const [sort, setSort] = useState<ItemSortConfig>(initialSort ?? DEFAULT_SORT);
  const [pagination, setPagination] = useState<ItemPaginationState>({
    currentPage: 1,
    pageSize: config.pageSize,
    totalItems: 0,
  });
  const [layout, setLayout] = useState<GridLayoutMode>(config.layout);
  const [filterPanelOpen, setFilterPanelOpen] = useState(true);

  // Infinite scroll state
  const [infiniteScrollPageSize, setInfiniteScrollPageSize] = useState(config.pageSize);
  const [infiniteScrollEnabled, setInfiniteScrollEnabled] = useState(false);

  // Derived: filtered items
  const filteredItems = useMemo(() => filterItems(items, filters), [items, filters]);

  // Derived: sorted items
  const sortedItems = useMemo(() => sortItems(filteredItems, sort), [filteredItems, sort]);

  // Derived: total items after filter
  const totalFiltered = sortedItems.length;

  // Update pagination total when filtered items change
  useEffect(() => {
    setPagination((prev) => ({
      ...prev,
      totalItems: totalFiltered,
      // Reset page if current page exceeds total pages
      currentPage: Math.min(prev.currentPage, Math.max(1, Math.ceil(totalFiltered / prev.pageSize))),
    }));
  }, [totalFiltered]);

  // Derived: paginated items
  const paginatedItems = useMemo(() => {
    if (infiniteScrollEnabled) {
      return sortedItems.slice(0, infiniteScrollPageSize);
    }
    const start = (pagination.currentPage - 1) * pagination.pageSize;
    return sortedItems.slice(start, start + pagination.pageSize);
  }, [sortedItems, pagination.currentPage, pagination.pageSize, infiniteScrollEnabled, infiniteScrollPageSize]);

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return (
      filters.searchText !== '' ||
      filters.rarities.length > 0 ||
      filters.itemTypes.length > 0 ||
      filters.minItemLevel != null ||
      filters.maxItemLevel != null
    );
  }, [filters]);

  // Infinite scroll callback
  const loadMore = useCallback(() => {
    if (infiniteScrollPageSize < sortedItems.length) {
      setInfiniteScrollPageSize((prev) => Math.min(prev + config.pageSize, sortedItems.length));
    }
  }, [infiniteScrollPageSize, sortedItems.length, config.pageSize]);

  const sentinelRef = useInfiniteScrollSentinel(loadMore, infiniteScrollEnabled);

  // Event handlers
  const handleFilterChange = useCallback(
    (newFilters: ItemFilterState) => {
      setFilters(newFilters);
      setPagination((prev) => ({ ...prev, currentPage: 1 }));
      events?.onFilterChange?.(newFilters);
    },
    [events],
  );

  const handleSortChange = useCallback(
    (newSort: ItemSortConfig) => {
      setSort(newSort);
      events?.onSortChange?.(newSort);
    },
    [events],
  );

  const handlePageChange = useCallback(
    (page: number) => {
      setPagination((prev) => ({ ...prev, currentPage: page }));
      events?.onPageChange?.(page);
    },
    [events],
  );

  const handlePageSizeChange = useCallback(
    (size: number) => {
      setPagination((prev) => ({ ...prev, pageSize: size, currentPage: 1 }));
    },
    [],
  );

  const handleLayoutChange = useCallback(
    (newLayout: GridLayoutMode) => {
      setLayout(newLayout);
      events?.onLayoutChange?.(newLayout);
    },
    [events],
  );

  const handleClearFilters = useCallback(() => {
    handleFilterChange({ ...DEFAULT_FILTERS });
  }, [handleFilterChange]);

  const handleRarityToggle = useCallback(
    (rarity: ItemRarity) => {
      const newRarities = filters.rarities.includes(rarity)
        ? filters.rarities.filter((r) => r !== rarity)
        : [...filters.rarities, rarity];
      handleFilterChange({ ...filters, rarities: newRarities });
    },
    [filters, handleFilterChange],
  );

  const handleItemTypeToggle = useCallback(
    (itemType: ItemType) => {
      const newTypes = filters.itemTypes.includes(itemType)
        ? filters.itemTypes.filter((t) => t !== itemType)
        : [...filters.itemTypes, itemType];
      handleFilterChange({ ...filters, itemTypes: newTypes });
    },
    [filters, handleFilterChange],
  );

  // Grid column classes
  const smClass = COL_CLASSES[config.columns.sm ?? 1] ?? 'grid-cols-1';
  const mdClass = MD_COL_CLASSES[config.columns.md ?? 2] ?? 'md:grid-cols-2';
  const lgClass = LG_COL_CLASSES[config.columns.lg ?? 3] ?? 'lg:grid-cols-3';
  const xlClass = XL_COL_CLASSES[config.columns.xl ?? 4] ?? 'xl:grid-cols-4';

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------

  return (
    <div className={`space-y-4 ${className}`} data-testid="enhanced-item-grid">
      {/* ===== Toolbar ===== */}
      <div className="space-y-3">
        {/* Top row: search + layout toggle + count */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          {/* Search */}
          {config.showFilters && (
            <div className="flex-1 min-w-0 w-full sm:w-auto">
              <SearchInput
                value={filters.searchText}
                onChange={(text) => handleFilterChange({ ...filters, searchText: text })}
              />
            </div>
          )}

          {/* Right side controls */}
          <div className="flex items-center gap-3 shrink-0">
            {config.showItemCount && (
              <ItemCountBadge total={items.length} filtered={totalFiltered} />
            )}
            {config.showLayoutToggle && (
              <LayoutToggle layout={layout} onLayoutChange={handleLayoutChange} />
            )}
          </div>
        </div>

        {/* Filter panel */}
        {config.showFilters && filterPanelOpen && (
          <div className="space-y-2">
            {/* Filter toggle bar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setFilterPanelOpen(!filterPanelOpen)}
                  className="text-xs text-poe-text-secondary hover:text-poe-text-primary transition-colors flex items-center gap-1"
                  aria-expanded={filterPanelOpen}
                >
                  <svg
                    className={`w-3.5 h-3.5 transition-transform ${filterPanelOpen ? '' : '-rotate-90'}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                  Filters
                </button>
                <ClearFiltersButton onClick={handleClearFilters} hasActiveFilters={hasActiveFilters} />
              </div>

              {/* Infinite scroll toggle */}
              <label className="flex items-center gap-2 text-xs text-poe-text-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={infiniteScrollEnabled}
                  onChange={(e) => {
                    setInfiniteScrollEnabled(e.target.checked);
                    setInfiniteScrollPageSize(config.pageSize);
                  }}
                  className="accent-poe-gold"
                />
                Infinite scroll
              </label>
            </div>

            {/* Rarity filter chips */}
            <div>
              <label className="text-[11px] text-poe-text-muted mb-1 block">Rarity:</label>
              <div className="flex flex-wrap gap-1.5">
                {RARITY_OPTIONS.map((opt) => (
                  <FilterChip
                    key={opt.value}
                    label={opt.label}
                    active={filters.rarities.includes(opt.value)}
                    onClick={() => handleRarityToggle(opt.value)}
                  />
                ))}
              </div>
            </div>

            {/* Item type filter chips */}
            <div>
              <label className="text-[11px] text-poe-text-muted mb-1 block">Item Type:</label>
              <div className="flex flex-wrap gap-1.5">
                {ITEM_TYPE_OPTIONS.map((opt) => (
                  <FilterChip
                    key={opt.value}
                    label={opt.label}
                    active={filters.itemTypes.includes(opt.value)}
                    onClick={() => handleItemTypeToggle(opt.value)}
                  />
                ))}
              </div>
            </div>

            {/* Item level range filter */}
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-poe-text-muted shrink-0">Item Level:</label>
              <input
                type="number"
                value={filters.minItemLevel ?? ''}
                onChange={(e) =>
                  handleFilterChange({
                    ...filters,
                    minItemLevel: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                placeholder="Min"
                className="poe-input py-1 px-2 text-xs w-20"
                aria-label="Minimum item level"
              />
              <span className="text-xs text-poe-text-muted">to</span>
              <input
                type="number"
                value={filters.maxItemLevel ?? ''}
                onChange={(e) =>
                  handleFilterChange({
                    ...filters,
                    maxItemLevel: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                placeholder="Max"
                className="poe-input py-1 px-2 text-xs w-20"
                aria-label="Maximum item level"
              />
            </div>
          </div>
        )}

        {/* Collapsed filter toggle */}
        {config.showFilters && !filterPanelOpen && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilterPanelOpen(true)}
              className="text-xs text-poe-text-secondary hover:text-poe-text-primary transition-colors flex items-center gap-1"
              aria-expanded="false"
            >
              <svg
                className="w-3.5 h-3.5 -rotate-90"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
              Show Filters
            </button>
            {hasActiveFilters && (
              <span className="text-[10px] bg-poe-gold/20 text-poe-gold-light px-1.5 py-0.5 rounded">
                Active filters
              </span>
            )}
            <ClearFiltersButton onClick={handleClearFilters} hasActiveFilters={hasActiveFilters} />
          </div>
        )}

        {/* Sort controls */}
        {config.showSort && (
          <SortControl sort={sort} onSortChange={handleSortChange} />
        )}
      </div>

      {/* ===== Grid / List content ===== */}
      {loading ? (
        <LoadingSkeleton
          layout={layout}
          columns={config.columns}
          count={config.skeletonCount}
          variant={variant}
        />
      ) : paginatedItems.length === 0 ? (
        <EmptyState message={config.emptyMessage ?? 'No items match your criteria'} />
      ) : layout === 'list' ? (
        <div className="space-y-3" role="list" aria-label="Item list">
          {paginatedItems.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              variant="compact"
              onClick={(clicked) => events?.onCardClick?.(clicked)}
              onHover={(hovered) => events?.onCardHover?.(hovered)}
              selected={selectedId === item.id}
              showIcon={showIcons}
              showRequirements={false}
              showSource={false}
            />
          ))}
          {/* Infinite scroll sentinel */}
          {infiniteScrollEnabled && infiniteScrollPageSize < sortedItems.length && (
            <div ref={sentinelRef} className="h-4" />
          )}
        </div>
      ) : (
        <div
          className={`grid ${smClass} ${mdClass} ${lgClass} ${xlClass} gap-4`}
          role="list"
          aria-label="Item grid"
        >
          {paginatedItems.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              variant={variant}
              onClick={(clicked) => events?.onCardClick?.(clicked)}
              onHover={(hovered) => events?.onCardHover?.(hovered)}
              selected={selectedId === item.id}
              showIcon={showIcons}
              showRequirements={variant === 'detailed'}
              showSource={variant === 'detailed'}
            />
          ))}
        </div>
      )}

      {/* Infinite scroll sentinel for grid mode */}
      {infiniteScrollEnabled && !loading && layout === 'grid' && infiniteScrollPageSize < sortedItems.length && (
        <div ref={sentinelRef} className="h-4" />
      )}

      {/* Infinite scroll: load more indicator */}
      {infiniteScrollEnabled && infiniteScrollPageSize < sortedItems.length && !loading && (
        <div className="text-center py-2">
          <span className="text-xs text-poe-text-muted">
            Showing {paginatedItems.length} of {sortedItems.length} items. Scroll to load more.
          </span>
        </div>
      )}

      {/* ===== Pagination ===== */}
      {config.showPagination && !infiniteScrollEnabled && !loading && totalFiltered > 0 && (
        <Pagination
          pagination={{ ...pagination, totalItems: totalFiltered }}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
        />
      )}
    </div>
  );
}
