import { useDataFreshness, deriveFreshnessStatus } from '@/hooks/useDataFreshness';
import type { FreshnessStatus, FreshnessEntry } from '@/types/freshness';
import type { DataFreshnessIndicatorProps } from '@/types/freshness';

// Re-export the props type for convenient importing
export type { DataFreshnessIndicatorProps } from '@/types/freshness';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Status display configuration: label, color, and dot style. */
const STATUS_CONFIG: Record<
  FreshnessStatus,
  {
    label: string;
    dotColor: string;
    dotPulse: boolean;
    textColor: string;
    bgColor: string;
    borderColor: string;
    description: string;
  }
> = {
  fresh: {
    label: 'Fresh',
    dotColor: 'bg-emerald-400',
    dotPulse: true,
    textColor: 'text-emerald-400',
    bgColor: 'bg-emerald-400/10',
    borderColor: 'border-emerald-400/30',
    description: 'Knowledge base is up to date',
  },
  needs_update: {
    label: 'Needs Update',
    dotColor: 'bg-amber-400',
    dotPulse: true,
    textColor: 'text-amber-400',
    bgColor: 'bg-amber-400/10',
    borderColor: 'border-amber-400/30',
    description: 'Knowledge base may need refreshing',
  },
  outdated: {
    label: 'Outdated',
    dotColor: 'bg-red-400',
    dotPulse: false,
    textColor: 'text-red-400',
    bgColor: 'bg-red-400/10',
    borderColor: 'border-red-400/30',
    description: 'Knowledge base data is stale',
  },
  no_data: {
    label: 'No Data',
    dotColor: 'bg-poe-text-muted',
    dotPulse: false,
    textColor: 'text-poe-text-muted',
    bgColor: 'bg-poe-bg-tertiary',
    borderColor: 'border-poe-border',
    description: 'No knowledge base data available',
  },
};

// ---------------------------------------------------------------------------
// Helper sub-components
// ---------------------------------------------------------------------------

/**
 * Animated status dot with optional pulse animation.
 */
function StatusDot({
  color,
  pulse,
}: {
  color: string;
  pulse: boolean;
}) {
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0">
      {pulse && (
        <span
          className={`absolute inline-flex h-full w-full rounded-full ${color} opacity-75 animate-ping`}
        />
      )}
      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${color}`} />
    </span>
  );
}

/**
 * Per-game entry row showing freshness details for one game version.
 */
function GameEntryRow({ entry }: { entry: FreshnessEntry }) {
  const status = deriveFreshnessStatus(entry);
  const config = STATUS_CONFIG[status];
  const gameLabel = entry.game === 'poe1' ? 'PoE 1' : 'PoE 2';

  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div className="flex items-center gap-2 min-w-0">
        <StatusDot color={config.dotColor} pulse={config.dotPulse} />
        <span className="text-xs text-poe-text-secondary font-medium whitespace-nowrap">
          {gameLabel}
        </span>
      </div>
      <div className="flex items-center gap-2 min-w-0">
        {entry.has_data ? (
          <>
            <span className="text-xs text-poe-text-muted truncate">
              {entry.relative_time ?? 'Unknown'}
            </span>
            {entry.items_scraped > 0 && (
              <span className="text-[10px] text-poe-text-muted/70 whitespace-nowrap">
                ({entry.items_scraped} items)
              </span>
            )}
          </>
        ) : (
          <span className="text-xs text-poe-text-muted italic">Never scraped</span>
        )}
      </div>
    </div>
  );
}

/**
 * Skeleton loader shown while data is being fetched for the first time.
 */
function LoadingSkeleton({ compact }: { compact: boolean }) {
  return (
    <div
      className={`inline-flex items-center gap-2 ${
        compact ? 'px-2 py-0.5' : 'px-3 py-1.5'
      } rounded bg-poe-bg-tertiary border border-poe-border animate-pulse`}
      data-testid="data-freshness-loading"
    >
      <span className="w-2 h-2 rounded-full bg-poe-text-muted/50" />
      <span className={`${compact ? 'text-xs' : 'text-sm'} text-poe-text-muted`}>
        Loading freshness...
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * DataFreshnessIndicator displays the current freshness status of the
 * knowledge base data.
 *
 * Features:
 *  - Connects to GET /api/freshness to retrieve scrape timestamps
 *  - Shows overall status badge (fresh / needs update / outdated / no data)
 *  - Displays last scrape timestamp in relative time (e.g. "2 hours ago")
 *  - Optional expanded details showing per-game breakdown
 *  - Auto-refreshes at a configurable interval
 *  - PoE-themed styling with Tailwind CSS
 *  - Accessible with ARIA labels
 *
 * Usage:
 *   <DataFreshnessIndicator />                     // defaults
 *   <DataFreshnessIndicator showDetails compact />  // compact with details
 */
export function DataFreshnessIndicator({
  className = '',
  showDetails = false,
  compact = false,
  refreshInterval = 60_000,
}: DataFreshnessIndicatorProps) {
  const { data, status, latestEntry, isLoading, error, refresh } =
    useDataFreshness(refreshInterval);

  // Show loading skeleton on first load
  if (isLoading && !data) {
    return <LoadingSkeleton compact={compact} />;
  }

  // Show error state
  if (error && !data) {
    return (
      <div
        className={`inline-flex items-center gap-2 ${
          compact ? 'px-2 py-0.5' : 'px-3 py-1.5'
        } rounded bg-poe-bg-tertiary border border-red-400/30 ${className}`}
        data-testid="data-freshness-error"
      >
        <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
        <span className={`${compact ? 'text-xs' : 'text-sm'} text-red-400`}>
          Freshness unavailable
        </span>
        <button
          type="button"
          onClick={refresh}
          className="text-xs text-poe-text-muted hover:text-poe-text-highlight transition-colors underline"
          aria-label="Retry fetching freshness data"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const config = STATUS_CONFIG[status];

  return (
    <div
      className={`${className}`}
      data-testid="data-freshness-indicator"
      data-status={status}
      role="status"
      aria-label={`Data freshness: ${config.label}. ${config.description}`}
    >
      {/* Main status badge */}
      <div
        className={`
          inline-flex items-center gap-2
          ${compact ? 'px-2 py-0.5' : 'px-3 py-1.5'}
          rounded
          ${config.bgColor}
          border ${config.borderColor}
          transition-all duration-300
        `}
      >
        {/* Status dot */}
        <StatusDot color={config.dotColor} pulse={config.dotPulse} />

        {/* Status label */}
        <span
          className={`font-medium whitespace-nowrap ${config.textColor} ${
            compact ? 'text-xs' : 'text-sm'
          }`}
        >
          {config.label}
        </span>

        {/* Last scrape timestamp */}
        {latestEntry?.has_data && latestEntry.relative_time && (
          <>
            <span className="text-poe-text-muted/50">|</span>
            <span
              className={`text-poe-text-muted whitespace-nowrap ${
                compact ? 'text-[10px]' : 'text-xs'
              }`}
            >
              {latestEntry.relative_time}
            </span>
          </>
        )}

        {/* Loading spinner for background refresh */}
        {isLoading && data && (
          <svg
            className="w-3 h-3 animate-spin text-poe-text-muted shrink-0"
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
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        )}
      </div>

      {/* Expanded details (shown when showDetails is true) */}
      {showDetails && (
        <div className="mt-1.5 rounded bg-poe-bg-secondary border border-poe-border p-2 min-w-[220px]">
          {/* Per-game breakdown */}
          <GameEntryRow entry={data.freshness.poe1} />
          <GameEntryRow entry={data.freshness.poe2} />

          {/* Staleness warning */}
          {(data.freshness.poe1.staleness_warning ||
            data.freshness.poe2.staleness_warning) && (
            <div className="mt-1.5 pt-1.5 border-t border-poe-border">
              <p className="text-[10px] text-amber-400 leading-relaxed">
                {data.freshness.poe1.staleness_warning ||
                  data.freshness.poe2.staleness_warning}
              </p>
            </div>
          )}

          {/* Threshold info */}
          <div className="mt-1.5 pt-1.5 border-t border-poe-border">
            <p className="text-[10px] text-poe-text-muted">
              Staleness threshold: {data.summary.staleness_threshold_days} days
            </p>
          </div>
        </div>
      )}

      {/* Error notice (data may still be available from previous fetch) */}
      {error && data && (
        <p className="mt-1 text-[10px] text-poe-text-muted">
          Could not refresh (showing cached data)
        </p>
      )}
    </div>
  );
}
