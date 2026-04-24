/**
 * Unit tests for the useDataFreshness hook and helper functions.
 *
 * Covers:
 *   - deriveFreshnessStatus helper
 *   - getWorstStatus helper
 *   - getLatestEntry helper
 *   - Hook initial fetch and state updates
 *   - Error handling
 *   - Manual refresh
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import {
  useDataFreshness,
  deriveFreshnessStatus,
  getWorstStatus,
  getLatestEntry,
} from '../useDataFreshness';
import type { FreshnessEntry, FreshnessResponse } from '@/types/freshness';

// ---------------------------------------------------------------------------
// Mock api-client
// ---------------------------------------------------------------------------

const mockGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-client', () => ({
  get: mockGet,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<FreshnessEntry> = {}): FreshnessEntry {
  return {
    game: 'poe2',
    last_scraped_at: '2025-06-01T12:00:00Z',
    relative_time: '2 hours ago',
    is_stale: false,
    staleness_warning: null,
    has_data: true,
    items_scraped: 100,
    categories_scraped: 10,
    last_successful_job_id: 'job-1',
    ...overrides,
  };
}

function makeResponse(overrides: Partial<FreshnessResponse> = {}): FreshnessResponse {
  return {
    success: true,
    freshness: {
      poe1: makeEntry({ game: 'poe1' }),
      poe2: makeEntry({ game: 'poe2' }),
    },
    summary: {
      any_stale: false,
      any_data_available: true,
      staleness_threshold_days: 7,
    },
    message: 'Data is fresh',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helper tests (pure functions)
// ---------------------------------------------------------------------------

describe('deriveFreshnessStatus', () => {
  it('returns "no_data" when entry has no data', () => {
    expect(deriveFreshnessStatus(makeEntry({ has_data: false }))).toBe('no_data');
  });

  it('returns "outdated" when entry is stale', () => {
    expect(deriveFreshnessStatus(makeEntry({ has_data: true, is_stale: true }))).toBe('outdated');
  });

  it('returns "needs_update" when relative_time is unknown', () => {
    expect(deriveFreshnessStatus(makeEntry({ has_data: true, is_stale: false, relative_time: 'unknown' }))).toBe('needs_update');
  });

  it('returns "fresh" for healthy data', () => {
    expect(deriveFreshnessStatus(makeEntry({ has_data: true, is_stale: false, relative_time: '1 hour ago' }))).toBe('fresh');
  });
});

describe('getWorstStatus', () => {
  it('returns "no_data" when all entries have no data', () => {
    expect(getWorstStatus([makeEntry({ has_data: false }), makeEntry({ has_data: false })])).toBe('no_data');
  });

  it('returns "outdated" when any entry is outdated', () => {
    expect(getWorstStatus([
      makeEntry({ has_data: true, is_stale: false, relative_time: '1 hour ago' }),
      makeEntry({ has_data: true, is_stale: true }),
    ])).toBe('outdated');
  });

  it('returns "needs_update" when any entry needs update', () => {
    expect(getWorstStatus([
      makeEntry({ has_data: true, is_stale: false, relative_time: '1 hour ago' }),
      makeEntry({ has_data: true, is_stale: false, relative_time: 'unknown' }),
    ])).toBe('needs_update');
  });

  it('returns "fresh" when all entries are fresh', () => {
    expect(getWorstStatus([
      makeEntry({ has_data: true, is_stale: false, relative_time: '1 hour ago' }),
      makeEntry({ has_data: true, is_stale: false, relative_time: '2 hours ago' }),
    ])).toBe('fresh');
  });

  it('handles empty array', () => {
    expect(getWorstStatus([])).toBe('no_data');
  });
});

describe('getLatestEntry', () => {
  it('returns poe2 when poe1 has no data', () => {
    const poe1 = makeEntry({ game: 'poe1', has_data: false });
    const poe2 = makeEntry({ game: 'poe2', has_data: true });
    expect(getLatestEntry(poe1, poe2)).toBe(poe2);
  });

  it('returns poe1 when poe2 has no data', () => {
    const poe1 = makeEntry({ game: 'poe1', has_data: true });
    const poe2 = makeEntry({ game: 'poe2', has_data: false });
    expect(getLatestEntry(poe1, poe2)).toBe(poe1);
  });

  it('returns poe1 when both have no data', () => {
    const poe1 = makeEntry({ game: 'poe1', has_data: false });
    const poe2 = makeEntry({ game: 'poe2', has_data: false });
    expect(getLatestEntry(poe1, poe2)).toBe(poe1);
  });

  it('returns the entry with the more recent scrape time', () => {
    const poe1 = makeEntry({ game: 'poe1', has_data: true, last_scraped_at: '2025-06-01T10:00:00Z' });
    const poe2 = makeEntry({ game: 'poe2', has_data: true, last_scraped_at: '2025-06-01T12:00:00Z' });
    expect(getLatestEntry(poe1, poe2)).toBe(poe2);
  });

  it('returns poe1 when timestamps are equal', () => {
    const ts = '2025-06-01T12:00:00Z';
    const poe1 = makeEntry({ game: 'poe1', has_data: true, last_scraped_at: ts });
    const poe2 = makeEntry({ game: 'poe2', has_data: true, last_scraped_at: ts });
    expect(getLatestEntry(poe1, poe2)).toBe(poe1);
  });
});

// ---------------------------------------------------------------------------
// Hook tests
// ---------------------------------------------------------------------------

describe('useDataFreshness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches data on mount and updates state', async () => {
    const response = makeResponse();
    mockGet.mockResolvedValueOnce(response);

    const { result } = renderHook(() => useDataFreshness());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(response);
    expect(result.current.error).toBeNull();
    expect(result.current.status).toBe('fresh');
    expect(result.current.latestEntry).not.toBeNull();
  });

  it('sets error state on fetch failure', async () => {
    mockGet.mockRejectedValueOnce(new Error('Server down'));

    const { result } = renderHook(() => useDataFreshness());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe('Server down');
    expect(result.current.status).toBe('no_data');
  });

  it('handles non-Error fetch failures', async () => {
    mockGet.mockRejectedValueOnce('string error');

    const { result } = renderHook(() => useDataFreshness());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Failed to fetch freshness data');
  });

  it('derives correct status from stale data', async () => {
    const response = makeResponse({
      freshness: {
        poe1: makeEntry({ game: 'poe1', has_data: true, is_stale: true }),
        poe2: makeEntry({ game: 'poe2', has_data: true, is_stale: false, relative_time: '1 hour ago' }),
      },
    });
    mockGet.mockResolvedValueOnce(response);

    const { result } = renderHook(() => useDataFreshness());

    await waitFor(() => {
      expect(result.current.status).toBe('outdated');
    });
  });

  it('provides a refresh function', async () => {
    const response = makeResponse();
    mockGet.mockResolvedValue(response);

    const { result } = renderHook(() => useDataFreshness());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await result.current.refresh();

    expect(mockGet.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
