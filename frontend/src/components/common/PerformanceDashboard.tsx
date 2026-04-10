/**
 * Performance Dashboard component for POE Knowledge Assistant.
 * Displays real-time performance metrics, cache stats, rate limiting info,
 * and system resource monitoring from the backend performance API.
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
      return '#22c55e';
    case 'degraded':
    case 'disabled':
      return '#f59e0b';
    case 'error':
      return '#ef4444';
    default:
      return '#6b7280';
  }
}

function ProgressBar({ value, max, color = '#3b82f6' }: { value: number; max: number; color?: string }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div style={{ background: '#1e293b', borderRadius: 4, height: 8, overflow: 'hidden', width: '100%' }}>
      <div style={{ background: color, width: `${pct}%`, height: '100%', borderRadius: 4, transition: 'width 0.3s' }} />
    </div>
  );
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
      <div style={{ padding: 16, color: '#94a3b8', fontFamily: 'monospace', fontSize: 13 }}>
        Loading performance data...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 16, color: '#ef4444', fontFamily: 'monospace', fontSize: 13 }}>
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

  const sectionStyle: React.CSSProperties = {
    background: '#0f172a',
    borderRadius: 8,
    padding: 16,
    border: '1px solid #1e293b',
  };

  const labelStyle: React.CSSProperties = {
    color: '#94a3b8',
    fontSize: 11,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 4,
  };

  const valueStyle: React.CSSProperties = {
    color: '#f1f5f9',
    fontSize: 18,
    fontWeight: 600,
    fontFamily: 'monospace',
  };

  return (
    <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#e2e8f0', padding: 8 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: getStatusColor(data.status),
          }} />
          <span style={{ fontWeight: 600, fontSize: 15 }}>Performance Dashboard</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={clearCaches}
            style={{
              background: '#1e293b', border: '1px solid #334155', borderRadius: 4,
              color: '#94a3b8', padding: '4px 10px', fontSize: 11, cursor: 'pointer',
            }}
          >
            Clear Caches
          </button>
          <button
            onClick={resetMetrics}
            style={{
              background: '#1e293b', border: '1px solid #334155', borderRadius: 4,
              color: '#94a3b8', padding: '4px 10px', fontSize: 11, cursor: 'pointer',
            }}
          >
            Reset Metrics
          </button>
          <span style={{ color: '#64748b', fontSize: 11 }}>
            Updated: {lastRefresh.toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* Top-level metrics row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div style={sectionStyle}>
          <div style={labelStyle}>Uptime</div>
          <div style={valueStyle}>{summary.uptime_human}</div>
        </div>
        <div style={sectionStyle}>
          <div style={labelStyle}>Total Requests</div>
          <div style={valueStyle}>{formatNumber(summary.total_requests)}</div>
        </div>
        <div style={sectionStyle}>
          <div style={labelStyle}>Active</div>
          <div style={valueStyle}>{summary.active_requests}</div>
          <div style={{ color: '#64748b', fontSize: 10 }}>Peak: {summary.peak_active_requests}</div>
        </div>
        <div style={sectionStyle}>
          <div style={labelStyle}>Throughput</div>
          <div style={valueStyle}>{summary.requests_per_second.toFixed(1)}</div>
          <div style={{ color: '#64748b', fontSize: 10 }}>req/s</div>
        </div>
        <div style={sectionStyle}>
          <div style={labelStyle}>Avg Response</div>
          <div style={{ ...valueStyle, color: summary.avg_response_ms < 100 ? '#22c55e' : summary.avg_response_ms < 500 ? '#f59e0b' : '#ef4444' }}>
            {summary.avg_response_ms.toFixed(1)}ms
          </div>
        </div>
        <div style={sectionStyle}>
          <div style={labelStyle}>P95 Response</div>
          <div style={{ ...valueStyle, color: summary.p95_response_ms < 200 ? '#22c55e' : summary.p95_response_ms < 1000 ? '#f59e0b' : '#ef4444' }}>
            {summary.p95_response_ms.toFixed(1)}ms
          </div>
        </div>
      </div>

      {/* Second row: System + Cache + Rate Limiting */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        {/* System Resources */}
        <div style={sectionStyle}>
          <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 13 }}>System Resources</div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: '#94a3b8', fontSize: 11 }}>Memory</span>
              <span style={{ color: '#f1f5f9', fontSize: 11 }}>{system.current.memory_mb.toFixed(0)} MB</span>
            </div>
            <ProgressBar value={system.current.memory_mb} max={2048} color="#3b82f6" />
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: '#94a3b8', fontSize: 11 }}>CPU</span>
              <span style={{ color: '#f1f5f9', fontSize: 11 }}>{system.current.cpu_percent.toFixed(1)}%</span>
            </div>
            <ProgressBar value={system.current.cpu_percent} max={100} color="#8b5cf6" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: 11 }}>
            <span>Threads: {system.current.thread_count}</span>
            <span>Disk: {system.current.disk_percent.toFixed(0)}%</span>
          </div>
        </div>

        {/* Cache Stats */}
        <div style={sectionStyle}>
          <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 13 }}>Cache Performance</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <div style={labelStyle}>Entries</div>
              <div style={{ ...valueStyle, fontSize: 14 }}>{totalCacheEntries}</div>
            </div>
            <div>
              <div style={labelStyle}>Hit Rate</div>
              <div style={{ ...valueStyle, fontSize: 14, color: overallHitRate > 50 ? '#22c55e' : overallHitRate > 20 ? '#f59e0b' : '#64748b' }}>
                {overallHitRate.toFixed(1)}%
              </div>
            </div>
            <div>
              <div style={labelStyle}>Hits</div>
              <div style={{ color: '#22c55e', fontSize: 14, fontFamily: 'monospace' }}>{formatNumber(totalCacheHits)}</div>
            </div>
            <div>
              <div style={labelStyle}>Misses</div>
              <div style={{ color: '#64748b', fontSize: 14, fontFamily: 'monospace' }}>{formatNumber(totalCacheMisses)}</div>
            </div>
          </div>
          {Object.keys(cache).length > 0 && (
            <div style={{ marginTop: 8, borderTop: '1px solid #1e293b', paddingTop: 8 }}>
              {Object.entries(cache).map(([name, stats]) => (
                <div key={name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b', marginBottom: 2 }}>
                  <span>{name}</span>
                  <span>{stats.size}/{stats.max_size} ({stats.hit_rate_percent}%)</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Rate Limiting */}
        <div style={sectionStyle}>
          <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 13 }}>Rate Limiting</div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ color: '#94a3b8', fontSize: 11 }}>Status</span>
              <span style={{ color: getStatusColor(rate_limiting.status), fontSize: 11 }}>{rate_limiting.status}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ color: '#94a3b8', fontSize: 11 }}>Rules</span>
              <span style={{ color: '#f1f5f9', fontSize: 11 }}>{rate_limiting.rules}</span>
            </div>
          </div>
          {rate_limiting.stats && Object.entries(rate_limiting.stats).map(([name, stats]) => (
            <div key={name} style={{ marginBottom: 6, padding: '4px 0', borderTop: '1px solid #1e293b' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ color: '#94a3b8' }}>{stats.rule_name}</span>
                <span style={{ color: '#f1f5f9' }}>{stats.max_requests}/{stats.window_seconds}s</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b' }}>
                <span>Blocked: {stats.global_blocked}</span>
                <span>Clients: {stats.active_clients}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Status Code Distribution */}
      <div style={{ ...sectionStyle, marginTop: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>Status Code Distribution</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' as const }}>
          {Object.entries(summary.status_code_distribution).map(([code, count]) => (
            <div key={code} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: Number(code) < 300 ? '#22c55e' : Number(code) < 400 ? '#f59e0b' : '#ef4444',
              }} />
              <span style={{ color: '#f1f5f9', fontSize: 12 }}>{code}: {formatNumber(count)}</span>
            </div>
          ))}
          {summary.error_count > 0 && (
            <div style={{ color: '#ef4444', fontSize: 12 }}>
              Errors: {summary.error_count}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PerformanceDashboard;
