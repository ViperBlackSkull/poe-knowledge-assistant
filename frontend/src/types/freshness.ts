/**
 * Data freshness types for the /api/freshness endpoint.
 * Mirrors backend response from backend/src/main.py data_freshness().
 */

// ---------------------------------------------------------------------------
// Freshness entry (per game version)
// ---------------------------------------------------------------------------

/**
 * A single game version's freshness metadata.
 *
 * Returned as part of the freshness response for each game (poe1 / poe2).
 */
export interface FreshnessEntry {
  /** Game version key ('poe1' or 'poe2') */
  game: string;
  /** ISO 8601 timestamp of the last scrape, or null if never scraped */
  last_scraped_at: string | null;
  /** Human-readable relative time (e.g. '2 hours ago'), or null */
  relative_time: string | null;
  /** Whether the data is considered stale (older than threshold) */
  is_stale: boolean;
  /** Warning message when data is stale, or null */
  staleness_warning: string | null;
  /** Whether any data has been scraped for this game */
  has_data: boolean;
  /** Total number of items scraped */
  items_scraped: number;
  /** Total number of categories scraped */
  categories_scraped: number;
  /** ID of the last successful scrape job */
  last_successful_job_id: string | null;
}

// ---------------------------------------------------------------------------
// Freshness summary
// ---------------------------------------------------------------------------

/**
 * Summary section of the freshness response.
 */
export interface FreshnessSummary {
  /** Whether any game version has stale data */
  any_stale: boolean;
  /** Whether any game version has data available */
  any_data_available: boolean;
  /** Staleness threshold in days */
  staleness_threshold_days: number;
}

// ---------------------------------------------------------------------------
// Freshness API response
// ---------------------------------------------------------------------------

/**
 * Full response from GET /api/freshness.
 */
export interface FreshnessResponse {
  /** Whether the request was successful */
  success: boolean;
  /** Per-game freshness entries */
  freshness: {
    poe1: FreshnessEntry;
    poe2: FreshnessEntry;
  };
  /** Aggregate summary */
  summary: FreshnessSummary;
  /** Human-readable message */
  message: string;
}

// ---------------------------------------------------------------------------
// Component types
// ---------------------------------------------------------------------------

/**
 * Freshness status level derived from the API data.
 */
export type FreshnessStatus = 'fresh' | 'needs_update' | 'outdated' | 'no_data';

/**
 * Props for the DataFreshnessIndicator component.
 */
export interface DataFreshnessIndicatorProps {
  /** Optional additional CSS class names */
  className?: string;
  /** Whether to show detailed stats (items/categories count) */
  showDetails?: boolean;
  /** Whether to render in compact mode (no expanded details) */
  compact?: boolean;
  /** Auto-refresh interval in milliseconds (default: 60000 = 1 min) */
  refreshInterval?: number;
}
