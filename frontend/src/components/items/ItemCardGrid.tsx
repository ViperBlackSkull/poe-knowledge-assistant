import type { ItemCardGridProps } from '@/types/item';
import { ItemCard } from './ItemCard';

/**
 * Tailwind requires static class names for JIT compilation.
 * This map provides the full class string for each column count.
 */
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

/**
 * ItemCardGrid renders a responsive grid of ItemCard components.
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
