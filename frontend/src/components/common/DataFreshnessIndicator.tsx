import { useDataFreshness, deriveFreshnessStatus } from '@/hooks/useDataFreshness';
import type { FreshnessStatus, FreshnessEntry } from '@/types/freshness';
import type { DataFreshnessIndicatorProps } from '@/types/freshness';
import { classifyError } from '@/hooks/useErrorHandling';

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
    dotGlow: string;
    description: string;
  }
> = {
  fresh: {
    label: 'Fresh',
    dotColor: 'bg-poe-teal',
    dotPulse: true,
    textColor: 'text-poe-teal',
    dotGlow: '0 0 6px rgba(27, 162, 155, 0.4)',
    description: 'Knowledge base is up to date',
  },
  needs_update: {
    label: 'Stale',
    dotColor: 'bg-poe-gold-light',
    dotPulse: true,
    textColor: 'text-poe-gold-light',
    dotGlow: '0 0 6px rgba(212, 168, 90, 0.4)',
    description: 'Knowledge base may need refreshing',
  },
  outdated: {
    label: 'Outdated',
    dotColor: 'bg-poe-fire',
    dotPulse: false,
    textColor: 'text-poe-fire',
    dotGlow: '0 0 6px rgba(255, 69, 0, 0.3)',
    description: 'Knowledge base data is stale',
  },
  no_data: {
    label: 'No Data',
    dotColor: 'bg-poe-text-muted',
    dotPulse: false,
    textColor: 'text-poe-text-muted',
    dotGlow: 'none',
    description: 'No knowledge base data available',
  },
};

// ---------------------------------------------------------------------------
// Helper sub-components
// ---------------------------------------------------------------------------

/**
 * Animated status dot with optional pulse animation and glow.
 */
function StatusDot({
  color,
  pulse,
  glow,
}: {
  color: string;
  pulse: boolean;
  glow: string;
}) {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      {pulse && (
        <span
          className={`absolute inline-flex h-full w-full rounded-full ${color} opacity-75 animate-ping`}
        />
      )}
      <span
        className={`relative inline-flex rounded-full h-2 w-2 ${color}`}
        style={{ boxShadow: glow }}
      />
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
        <StatusDot color={config.dotColor} pulse={config.dotPulse} glow={config.dotGlow} />
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
      className={`inline-flex items-center gap-1.5 ${
        compact ? 'px-1.5 py-0.5' : 'px-2 py-1'
      } rounded-[3px] bg-poe-bg-tertiary border border-poe-border animate-pulse`}
      data-testid="data-freshness-loading"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-[#6B6B75]/50" />
      <span className={`${compact ? 'text-[10px]' : 'text-xs'} text-[#6B6B75]`}>
        Loading...
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
    // Classify the error for better messaging
    const classified = classifyError(new Error(error));
    const isNetwork = classified.category === 'network';
    const errorLabel = isNetwork
      ? 'Offline'
      : classified.category === 'authentication'
        ? 'Auth error'
        : 'Unavailable';

    // Use muted styling for network errors, red for auth/other errors
    const dotClass = isNetwork ? 'bg-poe-text-muted' : 'bg-poe-fire';
    const dotGlow = isNetwork ? 'none' : '0 0 6px rgba(255, 69, 0, 0.3)';
    const textClass = isNetwork ? 'text-poe-text-muted' : 'text-poe-fire';
    const borderClass = isNetwork ? 'border-poe-border' : 'border-poe-fire/20';

    if (compact && isNetwork) {
      // Compact network error: just a small muted dot with tooltip
      return (
        <span
          className={`inline-flex items-center ${className}`}
          title="Backend unavailable"
          data-testid="data-freshness-error"
          role="status"
        >
          <span
            className="w-1.5 h-1.5 rounded-full bg-poe-text-muted shrink-0"
          />
        </span>
      );
    }

    return (
      <div
        className={`inline-flex items-center gap-1.5 ${
          compact ? 'px-1.5 py-0.5' : 'px-2 py-1'
        } rounded-[3px] bg-poe-bg-tertiary border ${borderClass} ${className}`}
        data-testid="data-freshness-error"
        role={isNetwork ? 'status' : 'alert'}
      >
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ boxShadow: dotGlow }}
        >
          <span className={`block w-full h-full rounded-full ${dotClass}`} />
        </span>
        <span className={`${compact ? 'text-[10px]' : 'text-xs'} ${textClass}`}>
          {errorLabel}
        </span>
        <button
          type="button"
          onClick={refresh}
          className="p-0.5 rounded text-poe-text-muted hover:text-poe-text-primary transition-colors"
          aria-label="Retry fetching freshness data"
          data-testid="data-freshness-error-retry"
        >
          <svg
            className="w-3 h-3"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182"
            />
          </svg>
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
          inline-flex items-center gap-1.5
          ${compact ? 'px-1.5 py-0.5' : 'px-2 py-1'}
          rounded-[3px]
          bg-poe-bg-tertiary
          border border-poe-border
          transition-all duration-300
        `}
      >
        {/* Status dot */}
        <StatusDot color={config.dotColor} pulse={config.dotPulse} glow={config.dotGlow} />

        {/* Status label */}
        <span
          className={`font-medium whitespace-nowrap ${config.textColor} ${
            compact ? 'text-[10px]' : 'text-xs'
          }`}
        >
          {config.label}
        </span>

        {/* Last scrape timestamp */}
        {latestEntry?.has_data && latestEntry.relative_time && (
          <>
            <span className="text-poe-gold-muted">|</span>
            <span
              className={`text-poe-text-muted whitespace-nowrap ${
                compact ? 'text-[9px]' : 'text-[10px]'
              }`}
            >
              {latestEntry.relative_time}
            </span>
          </>
        )}

        {/* Loading spinner for background refresh */}
        {isLoading && data && (
          <svg
            className="w-2.5 h-2.5 animate-spin text-poe-text-muted shrink-0"
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
        <div className="mt-1.5 rounded-[3px] bg-poe-bg-secondary border border-poe-border p-2 min-w-[220px]">
          {/* Per-game breakdown */}
          <GameEntryRow entry={data.freshness.poe1} />
          <GameEntryRow entry={data.freshness.poe2} />

          {/* Staleness warning */}
          {(data.freshness.poe1.staleness_warning ||
            data.freshness.poe2.staleness_warning) && (
            <div className="mt-1.5 pt-1.5 border-t border-poe-border">
              <p className="text-[10px] text-poe-gold-light leading-relaxed">
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

      {/* Refresh button - shown when data is loaded */}
      {!isLoading && data && (
        <button
          type="button"
          onClick={refresh}
          className="ml-1 p-0.5 rounded text-poe-text-muted hover:text-poe-text-primary transition-colors"
          aria-label="Refresh freshness data"
          data-testid="data-freshness-refresh"
        >
          <svg
            className="w-2.5 h-2.5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
