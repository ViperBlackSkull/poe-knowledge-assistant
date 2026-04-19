/**
 * Performance Dashboard component for POE Knowledge Assistant.
 * Displays real-time performance metrics, cache stats, rate limiting info,
 * and system resource monitoring from the backend performance API.
 *
 * Redesigned with dark card grid layout matching pathofexile.com aesthetic.
 */
import { useState, useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SystemStats {
  cpu_percent: number;
  memory_mb: number;
  memory_percent: number;
  disk_percent: number;
  thread_count: number;
  open_files: number;
}

interface PerformanceSummary {
  uptime_seconds: number;
  uptime_human: string;
  total_requests: number;
  active_requests: number;
  peak_active_requests: number;
  requests_per_second: number;
  avg_response_ms: number;
  p95_response_ms: number;
  status_code_distribution: Record<number, number>;
  error_count: number;
  psutil_available: boolean;
}

interface CacheStats {
  size: number;
  max_size: number;
  hits: number;
  misses: number;
  evictions: number;
  expired: number;
  sets: number;
  hit_rate_percent: number;
  total_requests: number;
  default_ttl_seconds: number;
}

interface RateLimitRuleStats {
  rule_name: string;
  max_requests: number;
  window_seconds: number;
  active_clients: number;
  global_requests: number;
  global_blocked: number;
  requests_per_second: number;
}

interface PerformanceOverview {
  status: string;
  monitor: { status: string; message: string; uptime: string; has_psutil: boolean };
  summary: PerformanceSummary;
  system: { status: string; samples: number; current: SystemStats; averages_1min: { cpu_percent: number; memory_mb: number }; has_psutil: boolean };
  cache: Record<string, CacheStats>;
  rate_limiting: { status: string; rules: number; message: string; stats: Record<string, RateLimitRuleStats> };
}

interface PerformanceDashboardProps {
  /** API base URL (defaults to '/api') */
  apiUrl?: string;
  /** Auto-refresh interval in ms (default 5000) */
  refreshInterval?: number;
  /** Whether to show the dashboard (default true) */
  visible?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toFixed(n % 1 === 0 ? 0 : 1);
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'healthy':
    case 'ready':
    case 'ok':
      return '#1BA29B'; // poe-teal
    case 'degraded':
    case 'disabled':
      return '#D4A85A'; // poe-gold-light
    case 'error':
      return '#FF4500'; // poe-fire
    default:
      return '#6B6B75'; // poe-text-muted
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PerformanceDashboard({
  apiUrl = '/api',
  refreshInterval = 5000,
  visible = true,
}: PerformanceDashboardProps) {
  const [data, setData] = useState<PerformanceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch(`${apiUrl}/performance/overview`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      setData(json);
      setError(null);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch performance data');
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchData, refreshInterval]);

  const clearCaches = async () => {
    try {
      await fetch(`${apiUrl}/performance/cache/clear`, { method: 'POST' });
      fetchData();
    } catch { /* ignore */ }
  };

  const resetMetrics = async () => {
    try {
      await fetch(`${apiUrl}/performance/metrics/reset`, { method: 'POST' });
      fetchData();
    } catch { /* ignore */ }
  };

  if (!visible) return null;

  if (loading) {
    return (
      <div className="p-4 text-[#6B6B75] text-xs font-mono">
        Loading performance data...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-red-400 text-xs font-mono">
        Error: {error}
      </div>
    );
  }

  if (!data) return null;

  const { summary, system, cache, rate_limiting } = data;

  // Aggregate cache stats
  const totalCacheEntries = Object.values(cache).reduce((sum, c) => sum + c.size, 0);
  const totalCacheHits = Object.values(cache).reduce((sum, c) => sum + c.hits, 0);
  const totalCacheMisses = Object.values(cache).reduce((sum, c) => sum + c.misses, 0);
  const overallHitRate = totalCacheHits + totalCacheMisses > 0
    ? (totalCacheHits / (totalCacheHits + totalCacheMisses) * 100)
    : 0;

  // Color helpers for response times
  const getResponseColor = (ms: number, thresholds: [number, number]): string => {
    if (ms < thresholds[0]) return '#1BA29B'; // poe-teal
    if (ms < thresholds[1]) return '#D4A85A'; // poe-gold-light
    return '#FF4500'; // poe-fire
  };

  return (
    <div className="font-mono text-xs text-[#C8C8C8] p-2">
      {/* Header */}
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{
              background: getStatusColor(data.status),
              boxShadow: `0 0 6px ${getStatusColor(data.status)}40`,
            }}
          />
          <span className="font-semibold text-sm text-poe-text-primary">Performance Dashboard</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={clearCaches}
            className="
              px-2 py-0.5 rounded-[3px] text-[10px]
              bg-poe-bg-tertiary border border-poe-border
              text-[#6B6B75] hover:text-poe-text-primary hover:border-poe-border-light
              transition-colors duration-200 cursor-pointer
            "
          >
            Clear Caches
          </button>
          <button
            onClick={resetMetrics}
            className="
              px-2 py-0.5 rounded-[3px] text-[10px]
              bg-poe-bg-tertiary border border-poe-border
              text-[#6B6B75] hover:text-poe-text-primary hover:border-poe-border-light
              transition-colors duration-200 cursor-pointer
            "
          >
            Reset Metrics
          </button>
          <span className="text-[10px] text-[#6B6B75]">
            {lastRefresh.toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* Top-level metrics row — card grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-3">
        {/* Uptime */}
        <div className="rounded-[3px] bg-poe-bg-secondary border border-poe-border p-3">
          <div className="text-[10px] text-[#6B6B75] uppercase tracking-wider mb-1">Uptime</div>
          <div className="text-sm font-semibold text-[#D4A85A]">{summary.uptime_human}</div>
        </div>
        {/* Total Requests */}
        <div className="rounded-[3px] bg-poe-bg-secondary border border-poe-border p-3">
          <div className="text-[10px] text-[#6B6B75] uppercase tracking-wider mb-1">Total Requests</div>
          <div className="text-sm font-semibold text-[#D4A85A]">{formatNumber(summary.total_requests)}</div>
        </div>
        {/* Active */}
        <div className="rounded-[3px] bg-poe-bg-secondary border border-poe-border p-3">
          <div className="text-[10px] text-[#6B6B75] uppercase tracking-wider mb-1">Active</div>
          <div className="text-sm font-semibold text-poe-text-primary">{summary.active_requests}</div>
          <div className="text-[10px] text-[#6B6B75] mt-0.5">Peak: {summary.peak_active_requests}</div>
        </div>
        {/* Throughput */}
        <div className="rounded-[3px] bg-poe-bg-secondary border border-poe-border p-3">
          <div className="text-[10px] text-[#6B6B75] uppercase tracking-wider mb-1">Throughput</div>
          <div className="text-sm font-semibold text-[#1BA29B]">{summary.requests_per_second.toFixed(1)}</div>
          <div className="text-[10px] text-[#6B6B75] mt-0.5">req/s</div>
        </div>
        {/* Avg Response */}
        <div className="rounded-[3px] bg-poe-bg-secondary border border-poe-border p-3">
          <div className="text-[10px] text-[#6B6B75] uppercase tracking-wider mb-1">Avg Response</div>
          <div
            className="text-sm font-semibold"
            style={{ color: getResponseColor(summary.avg_response_ms, [100, 500]) }}
          >
            {summary.avg_response_ms.toFixed(1)}ms
          </div>
        </div>
        {/* P95 Response */}
        <div className="rounded-[3px] bg-poe-bg-secondary border border-poe-border p-3">
          <div className="text-[10px] text-[#6B6B75] uppercase tracking-wider mb-1">P95 Response</div>
          <div
            className="text-sm font-semibold"
            style={{ color: getResponseColor(summary.p95_response_ms, [200, 1000]) }}
          >
            {summary.p95_response_ms.toFixed(1)}ms
          </div>
        </div>
      </div>

      {/* Second row: System + Cache + Rate Limiting */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {/* System Resources */}
        <div className="rounded-[3px] bg-poe-bg-secondary border border-poe-border p-3">
          <div className="text-xs font-semibold text-poe-text-primary mb-3">System Resources</div>
          {/* Memory */}
          <div className="mb-3">
            <div className="flex justify-between mb-1">
              <span className="text-[10px] text-[#6B6B75]">Memory</span>
              <span className="text-[10px] text-poe-text-primary">{system.current.memory_mb.toFixed(0)} MB</span>
            </div>
            <div className="h-1.5 rounded-full bg-poe-bg-primary overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min((system.current.memory_mb / 2048) * 100, 100)}%`,
                  background: '#1BA29B',
                }}
              />
            </div>
          </div>
          {/* CPU */}
          <div className="mb-3">
            <div className="flex justify-between mb-1">
              <span className="text-[10px] text-[#6B6B75]">CPU</span>
              <span className="text-[10px] text-poe-text-primary">{system.current.cpu_percent.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-poe-bg-primary overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(system.current.cpu_percent, 100)}%`,
                  background: '#D4A85A',
                }}
              />
            </div>
          </div>
          {/* Threads / Disk */}
          <div className="flex justify-between text-[10px] text-[#6B6B75]">
            <span>Threads: {system.current.thread_count}</span>
            <span>Disk: {system.current.disk_percent.toFixed(0)}%</span>
          </div>
        </div>

        {/* Cache Performance */}
        <div className="rounded-[3px] bg-poe-bg-secondary border border-poe-border p-3">
          <div className="text-xs font-semibold text-poe-text-primary mb-3">Cache Performance</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[10px] text-[#6B6B75] uppercase tracking-wider mb-0.5">Entries</div>
              <div className="text-sm font-semibold text-[#D4A85A]">{totalCacheEntries}</div>
            </div>
            <div>
              <div className="text-[10px] text-[#6B6B75] uppercase tracking-wider mb-0.5">Hit Rate</div>
              <div
                className="text-sm font-semibold"
                style={{ color: overallHitRate > 50 ? '#1BA29B' : overallHitRate > 20 ? '#D4A85A' : '#6B6B75' }}
              >
                {overallHitRate.toFixed(1)}%
              </div>
            </div>
            <div>
              <div className="text-[10px] text-[#6B6B75] uppercase tracking-wider mb-0.5">Hits</div>
              <div className="text-sm font-semibold text-[#1BA29B]">{formatNumber(totalCacheHits)}</div>
            </div>
            <div>
              <div className="text-[10px] text-[#6B6B75] uppercase tracking-wider mb-0.5">Misses</div>
              <div className="text-sm font-semibold text-[#6B6B75]">{formatNumber(totalCacheMisses)}</div>
            </div>
          </div>
          {Object.keys(cache).length > 0 && (
            <div className="mt-2 pt-2 border-t border-poe-border">
              {Object.entries(cache).map(([name, stats]) => (
                <div key={name} className="flex justify-between text-[10px] text-[#6B6B75] mb-0.5">
                  <span>{name}</span>
                  <span>{stats.size}/{stats.max_size} ({stats.hit_rate_percent}%)</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Rate Limiting */}
        <div className="rounded-[3px] bg-poe-bg-secondary border border-poe-border p-3">
          <div className="text-xs font-semibold text-poe-text-primary mb-3">Rate Limiting</div>
          <div className="mb-2">
            <div className="flex justify-between mb-1">
              <span className="text-[10px] text-[#6B6B75]">Status</span>
              <span
                className="text-[10px]"
                style={{ color: getStatusColor(rate_limiting.status) }}
              >
                {rate_limiting.status}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[10px] text-[#6B6B75]">Rules</span>
              <span className="text-[10px] text-poe-text-primary">{rate_limiting.rules}</span>
            </div>
          </div>
          {rate_limiting.stats && Object.entries(rate_limiting.stats).map(([name, stats]) => (
            <div key={name} className="pt-2 border-t border-poe-border mb-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-[#6B6B75]">{stats.rule_name}</span>
                <span className="text-poe-text-primary">{stats.max_requests}/{stats.window_seconds}s</span>
              </div>
              <div className="flex justify-between text-[10px] text-[#6B6B75]">
                <span>Blocked: {stats.global_blocked}</span>
                <span>Clients: {stats.active_clients}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Status Code Distribution */}
      <div className="rounded-[3px] bg-poe-bg-secondary border border-poe-border p-3 mt-2">
        <div className="text-xs font-semibold text-poe-text-primary mb-2">Status Code Distribution</div>
        <div className="flex gap-4 flex-wrap">
          {Object.entries(summary.status_code_distribution).map(([code, count]) => (
            <div key={code} className="flex items-center gap-1.5">
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background: Number(code) < 300 ? '#1BA29B' : Number(code) < 400 ? '#D4A85A' : '#FF4500',
                  boxShadow: Number(code) < 300
                    ? '0 0 4px rgba(27, 162, 155, 0.4)'
                    : Number(code) < 400
                      ? '0 0 4px rgba(212, 168, 90, 0.4)'
                      : '0 0 4px rgba(255, 69, 0, 0.3)',
                }}
              />
              <span className="text-[11px] text-poe-text-primary">{code}: {formatNumber(count)}</span>
            </div>
          ))}
          {summary.error_count > 0 && (
            <div className="text-[11px] text-poe-fire">
              Errors: {summary.error_count}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PerformanceDashboard;
