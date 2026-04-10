import { useState, useEffect, useCallback, useRef } from 'react';
import { get } from '@/lib/api-client';
import type {
  FreshnessResponse,
  FreshnessEntry,
  FreshnessStatus,
} from '@/types/freshness';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default auto-refresh interval (60 seconds). */
const DEFAULT_REFRESH_INTERVAL_MS = 60_000;

/** Maximum number of consecutive failures before backing off. */
const MAX_CONSECUTIVE_FAILURES = 3;

/** Backoff multiplier applied to the refresh interval on repeated failures. */
const BACKOFF_MULTIPLIER = 2;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive a human-readable freshness status from a FreshnessEntry.
 *
 * Returns:
 *  - 'fresh'       -- data exists and is not stale
 *  - 'needs_update'-- data exists and is stale
 *  - 'outdated'    -- data exists but could not be parsed or is extremely old
 *  - 'no_data'     -- no data has been scraped yet
 */
export function deriveFreshnessStatus(entry: FreshnessEntry): FreshnessStatus {
  if (!entry.has_data) {
    return 'no_data';
  }
  if (entry.is_stale) {
    return 'outdated';
  }
  if (entry.relative_time === 'unknown') {
    return 'needs_update';
  }
  return 'fresh';
}

/**
 * Get the "worst" status across multiple entries.
 * Priority: no_data > outdated > needs_update > fresh
 */
export function getWorstStatus(entries: FreshnessEntry[]): FreshnessStatus {
  const priority: FreshnessStatus[] = ['outdated', 'needs_update', 'fresh'];

  // If no entries have data, return no_data
  if (entries.every((e) => !e.has_data)) {
    return 'no_data';
  }

  for (const status of priority) {
    if (entries.some((e) => deriveFreshnessStatus(e) === status)) {
      return status;
    }
  }

  return 'fresh';
}

/**
 * Get the latest entry from both game versions (the one with the most recent scrape).
 */
export function getLatestEntry(
  poe1: FreshnessEntry,
  poe2: FreshnessEntry,
): FreshnessEntry {
  if (!poe1.has_data && !poe2.has_data) return poe1;
  if (!poe1.has_data) return poe2;
  if (!poe2.has_data) return poe1;

  const t1 = poe1.last_scraped_at ? new Date(poe1.last_scraped_at).getTime() : 0;
  const t2 = poe2.last_scraped_at ? new Date(poe2.last_scraped_at).getTime() : 0;

  return t1 >= t2 ? poe1 : poe2;
}

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

/**
 * State and helpers returned by the useDataFreshness hook.
 */
export interface UseDataFreshnessReturn {
  /** Full freshness response from the API, or null if not yet loaded */
  data: FreshnessResponse | null;
  /** Overall freshness status derived from all game entries */
  status: FreshnessStatus;
  /** The most recently scraped game entry */
  latestEntry: FreshnessEntry | null;
  /** Whether data is currently being fetched */
  isLoading: boolean;
  /** Error message if the last fetch failed, or null */
  error: string | null;
  /** Manually trigger a refresh */
  refresh: () => Promise<void>;
  /** Time (ms) until the next automatic refresh, or null if not scheduled */
  nextRefreshIn: number | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Custom hook for fetching and auto-refreshing data freshness information.
 *
 * Connects to GET /api/freshness and provides:
 *  - The full freshness response
 *  - A derived overall status (fresh / needs_update / outdated / no_data)
 *  - Loading and error state
 *  - Auto-refresh on a configurable interval
 *  - Exponential backoff on repeated failures
 *
 * @param refreshInterval - Auto-refresh interval in milliseconds (default 60s)
 */
export function useDataFreshness(
  refreshInterval: number = DEFAULT_REFRESH_INTERVAL_MS,
): UseDataFreshnessReturn {
  const [data, setData] = useState<FreshnessResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [nextRefreshIn, setNextRefreshIn] = useState<number | null>(null);

  const consecutiveFailures = useRef(0);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nextRefreshAt = useRef<number>(0);
  const isMounted = useRef(true);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await get<FreshnessResponse>('/freshness');

      if (!isMounted.current) return;

      setData(response);
      setError(null);
      consecutiveFailures.current = 0;
    } catch (err) {
      if (!isMounted.current) return;

      const message =
        err instanceof Error ? err.message : 'Failed to fetch freshness data';
      setError(message);
      consecutiveFailures.current += 1;
    } finally {
      if (isMounted.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const refresh = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  // Initial fetch + auto-refresh setup
  useEffect(() => {
    isMounted.current = true;

    // Initial fetch
    fetchData();

    return () => {
      isMounted.current = false;
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
    };
  }, [fetchData]);

  // Schedule auto-refresh whenever data or error changes
  useEffect(() => {
    // Clear any existing timers
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }

    // Don't schedule if still loading
    if (isLoading) return;

    // Apply exponential backoff on repeated failures
    const effectiveInterval =
      consecutiveFailures.current >= MAX_CONSECUTIVE_FAILURES
        ? refreshInterval * Math.pow(BACKOFF_MULTIPLIER, Math.min(consecutiveFailures.current - MAX_CONSECUTIVE_FAILURES + 1, 4))
        : refreshInterval;

    nextRefreshAt.current = Date.now() + effectiveInterval;

    // Countdown tracker (updates every second)
    countdownTimerRef.current = setInterval(() => {
      if (!isMounted.current) return;
      const remaining = Math.max(0, nextRefreshAt.current - Date.now());
      setNextRefreshIn(remaining > 0 ? remaining : null);
    }, 1000);

    // Schedule the next refresh
    refreshTimerRef.current = setTimeout(() => {
      if (isMounted.current) {
        fetchData();
      }
    }, effectiveInterval);

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
    };
  }, [data, error, isLoading, refreshInterval, fetchData]);

  // Derive computed values
  const status: FreshnessStatus = data
    ? getWorstStatus([data.freshness.poe1, data.freshness.poe2])
    : 'no_data';

  const latestEntry: FreshnessEntry | null = data
    ? getLatestEntry(data.freshness.poe1, data.freshness.poe2)
    : null;

  return {
    data,
    status,
    latestEntry,
    isLoading,
    error,
    refresh,
    nextRefreshIn,
  };
}
