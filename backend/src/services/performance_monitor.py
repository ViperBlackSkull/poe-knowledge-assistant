"""
Performance monitoring service for POE Knowledge Assistant.
Tracks request metrics, response times, system resources,
and provides performance reporting.
"""
import logging
import os
import threading
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Any, Deque, Dict, List, Optional

logger = logging.getLogger(__name__)

# Try importing psutil for system metrics; fall back gracefully
try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False


@dataclass
class RequestMetric:
    """A single request metric entry."""
    endpoint: str
    method: str
    status_code: int
    duration_ms: float
    timestamp: float
    client_ip: str = ""
    error: str = ""


@dataclass
class SystemSnapshot:
    """A point-in-time snapshot of system resource usage."""
    timestamp: float
    cpu_percent: float
    memory_percent: float
    memory_mb: float
    disk_percent: float = 0.0
    open_files: int = 0
    thread_count: int = 0


class MetricsCollector:
    """
    Collects and aggregates performance metrics.

    Tracks:
    - Request counts and latencies per endpoint
    - Error rates
    - System resource usage (CPU, memory, disk)
    - Percentile response times (p50, p90, p95, p99)
    """

    def __init__(
        self,
        max_request_history: int = 10000,
        system_sample_interval: float = 10.0,
    ):
        """
        Initialize the metrics collector.

        Args:
            max_request_history: Maximum number of request metrics to retain
            system_sample_interval: Seconds between system metric snapshots
        """
        self._max_history = max_request_history
        self._system_sample_interval = system_sample_interval

        # Request metrics organized by endpoint
        self._request_metrics: Deque[RequestMetric] = deque(
            maxlen=max_request_history
        )
        self._lock = threading.RLock()

        # System resource snapshots
        self._system_snapshots: Deque[SystemSnapshot] = deque(maxlen=360)

        # Counters
        self._endpoint_counts: Dict[str, int] = defaultdict(int)
        self._status_counts: Dict[int, int] = defaultdict(int)
        self._error_counts: Dict[str, int] = defaultdict(int)

        # Active requests tracking
        self._active_requests: int = 0
        self._peak_active_requests: int = 0
        self._total_requests: int = 0
        self._start_time: float = time.time()

        # Start system sampling thread
        self._sampling = True
        self._sampler_thread = threading.Thread(
            target=self._system_sampler,
            daemon=True,
            name="perf-monitor-sampler",
        )
        self._sampler_thread.start()

    def record_request(
        self,
        endpoint: str,
        method: str,
        status_code: int,
        duration_ms: float,
        client_ip: str = "",
        error: str = "",
    ) -> None:
        """
        Record a request metric.

        Args:
            endpoint: API endpoint path
            method: HTTP method
            status_code: Response status code
            duration_ms: Request duration in milliseconds
            client_ip: Client IP address
            error: Error message if applicable
        """
        with self._lock:
            metric = RequestMetric(
                endpoint=endpoint,
                method=method,
                status_code=status_code,
                duration_ms=duration_ms,
                timestamp=time.time(),
                client_ip=client_ip,
                error=error,
            )
            self._request_metrics.append(metric)

            self._endpoint_counts[endpoint] += 1
            self._status_counts[status_code] += 1
            self._total_requests += 1

            if error:
                self._error_counts[endpoint] += 1

    def start_request(self) -> None:
        """Track an active request (for concurrent request monitoring)."""
        with self._lock:
            self._active_requests += 1
            if self._active_requests > self._peak_active_requests:
                self._peak_active_requests = self._active_requests

    def end_request(self) -> None:
        """Decrement active request counter."""
        with self._lock:
            self._active_requests = max(0, self._active_requests - 1)

    def _system_sampler(self) -> None:
        """Background thread to sample system metrics."""
        while self._sampling:
            try:
                snapshot = self._take_system_snapshot()
                with self._lock:
                    self._system_snapshots.append(snapshot)
            except Exception as e:
                logger.debug(f"System sample error: {e}")

            time.sleep(self._system_sample_interval)

    def _take_system_snapshot(self) -> SystemSnapshot:
        """Take a snapshot of current system resource usage."""
        now = time.time()

        if HAS_PSUTIL:
            process = psutil.Process(os.getpid())
            mem_info = process.memory_info()
            return SystemSnapshot(
                timestamp=now,
                cpu_percent=process.cpu_percent(interval=0.1),
                memory_percent=process.memory_percent(),
                memory_mb=mem_info.rss / (1024 * 1024),
                disk_percent=psutil.disk_usage("/").percent,
                open_files=len(process.open_files()),
                thread_count=process.num_threads(),
            )
        else:
            # Fallback without psutil
            import resource
            mem_usage = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
            return SystemSnapshot(
                timestamp=now,
                cpu_percent=0.0,
                memory_percent=0.0,
                memory_mb=mem_usage / 1024 if os.sys.platform != "darwin" else mem_usage / (1024 * 1024),
                thread_count=threading.active_count(),
            )

    def get_endpoint_stats(self, endpoint: Optional[str] = None) -> Dict[str, Any]:
        """
        Get statistics for a specific endpoint or all endpoints.

        Args:
            endpoint: Optional endpoint path to filter by

        Returns:
            Dictionary with endpoint statistics
        """
        with self._lock:
            if endpoint:
                metrics = [m for m in self._request_metrics if m.endpoint == endpoint]
            else:
                metrics = list(self._request_metrics)

            if not metrics:
                return {
                    "total_requests": 0,
                    "endpoints": {},
                }

            # Group by endpoint
            endpoint_groups: Dict[str, List[RequestMetric]] = defaultdict(list)
            for m in metrics:
                endpoint_groups[m.endpoint].append(m)

            result = {"total_requests": len(metrics), "endpoints": {}}

            for ep, ep_metrics in endpoint_groups.items():
                durations = [m.duration_ms for m in ep_metrics]
                durations.sort()

                errors = [m for m in ep_metrics if m.status_code >= 400]

                result["endpoints"][ep] = {
                    "count": len(ep_metrics),
                    "errors": len(errors),
                    "error_rate_percent": round(
                        len(errors) / len(ep_metrics) * 100, 2
                    ) if ep_metrics else 0,
                    "avg_ms": round(sum(durations) / len(durations), 2),
                    "min_ms": round(min(durations), 2),
                    "max_ms": round(max(durations), 2),
                    "p50_ms": round(self._percentile(durations, 50), 2),
                    "p90_ms": round(self._percentile(durations, 90), 2),
                    "p95_ms": round(self._percentile(durations, 95), 2),
                    "p99_ms": round(self._percentile(durations, 99), 2),
                }

            return result

    def get_system_stats(self) -> Dict[str, Any]:
        """Get current and recent system resource statistics."""
        with self._lock:
            if not self._system_snapshots:
                return {"status": "no_data", "samples": 0}

            latest = self._system_snapshots[-1]

            # Calculate averages over recent snapshots
            recent_count = min(len(self._system_snapshots), 12)
            recent = list(self._system_snapshots)[-recent_count:]

            avg_cpu = sum(s.cpu_percent for s in recent) / len(recent)
            avg_memory = sum(s.memory_mb for s in recent) / len(recent)

            return {
                "status": "ok",
                "samples": len(self._system_snapshots),
                "current": {
                    "cpu_percent": round(latest.cpu_percent, 2),
                    "memory_mb": round(latest.memory_mb, 2),
                    "memory_percent": round(latest.memory_percent, 2),
                    "disk_percent": round(latest.disk_percent, 2),
                    "thread_count": latest.thread_count,
                    "open_files": latest.open_files,
                },
                "averages_1min": {
                    "cpu_percent": round(avg_cpu, 2),
                    "memory_mb": round(avg_memory, 2),
                },
                "has_psutil": HAS_PSUTIL,
            }

    def get_summary(self) -> Dict[str, Any]:
        """Get a comprehensive performance summary."""
        with self._lock:
            uptime = time.time() - self._start_time
            all_metrics = list(self._request_metrics)

            durations = [m.duration_ms for m in all_metrics] if all_metrics else [0]

            return {
                "uptime_seconds": round(uptime, 1),
                "uptime_human": self._format_uptime(uptime),
                "total_requests": self._total_requests,
                "active_requests": self._active_requests,
                "peak_active_requests": self._peak_active_requests,
                "requests_per_second": round(
                    self._total_requests / max(uptime, 1), 2
                ),
                "avg_response_ms": round(
                    sum(durations) / max(len(durations), 1), 2
                ),
                "p95_response_ms": round(
                    self._percentile(sorted(durations), 95), 2
                ),
                "status_code_distribution": dict(self._status_counts),
                "error_count": sum(self._error_counts.values()),
                "psutil_available": HAS_PSUTIL,
            }

    def get_slow_requests(
        self, threshold_ms: float = 1000, limit: int = 20
    ) -> List[Dict[str, Any]]:
        """
        Get the slowest recent requests.

        Args:
            threshold_ms: Minimum duration in milliseconds
            limit: Maximum number of results

        Returns:
            List of slow request details
        """
        with self._lock:
            slow = [
                m for m in self._request_metrics if m.duration_ms >= threshold_ms
            ]
            slow.sort(key=lambda m: m.duration_ms, reverse=True)
            return [
                {
                    "endpoint": m.endpoint,
                    "method": m.method,
                    "status_code": m.status_code,
                    "duration_ms": round(m.duration_ms, 2),
                    "timestamp": m.timestamp,
                    "client_ip": m.client_ip,
                    "error": m.error,
                }
                for m in slow[:limit]
            ]

    @staticmethod
    def _percentile(sorted_data: List[float], pct: float) -> float:
        """Calculate percentile from sorted data."""
        if not sorted_data:
            return 0.0
        idx = int(len(sorted_data) * pct / 100)
        idx = min(idx, len(sorted_data) - 1)
        return sorted_data[idx]

    @staticmethod
    def _format_uptime(seconds: float) -> str:
        """Format uptime seconds into human-readable string."""
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        parts = []
        if hours > 0:
            parts.append(f"{hours}h")
        if minutes > 0:
            parts.append(f"{minutes}m")
        parts.append(f"{secs}s")
        return "".join(parts)

    def shutdown(self) -> None:
        """Stop the background sampling thread."""
        self._sampling = False

    def reset_stats(self) -> None:
        """Reset all collected metrics."""
        with self._lock:
            self._request_metrics.clear()
            self._system_snapshots.clear()
            self._endpoint_counts.clear()
            self._status_counts.clear()
            self._error_counts.clear()
            self._active_requests = 0
            self._peak_active_requests = 0
            self._total_requests = 0
            self._start_time = time.time()


class PerformanceMonitorMiddleware:
    """
    ASGI middleware to track request performance metrics.

    Records request duration, status codes, and errors for each request.
    """

    def __init__(self, app, collector: MetricsCollector):
        self.app = app
        self._collector = collector

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Track active requests
        self._collector.start_request()

        start_time = time.time()
        status_code = 200
        error_msg = ""

        async def send_with_tracking(message):
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message.get("status", 200)
            await send(message)

        try:
            await self.app(scope, receive, send_with_tracking)
        except Exception as exc:
            status_code = 500
            error_msg = str(exc)
            raise
        finally:
            duration_ms = (time.time() - start_time) * 1000

            path = scope.get("path", "/unknown")
            method = scope.get("method", "UNKNOWN")
            client_ip = ""
            if scope.get("client"):
                client_ip = scope["client"][0]

            self._collector.record_request(
                endpoint=path,
                method=method,
                status_code=status_code,
                duration_ms=duration_ms,
                client_ip=client_ip,
                error=error_msg,
            )
            self._collector.end_request()


# Global metrics collector
_metrics_collector: Optional[MetricsCollector] = None
_collector_lock = threading.Lock()


def get_metrics_collector() -> MetricsCollector:
    """Get the global MetricsCollector instance."""
    global _metrics_collector
    if _metrics_collector is None:
        with _collector_lock:
            if _metrics_collector is None:
                _metrics_collector = MetricsCollector()
                logger.info("Initialized global MetricsCollector")
    return _metrics_collector


def check_performance_monitor_health() -> dict:
    """Check performance monitor health."""
    try:
        collector = get_metrics_collector()
        summary = collector.get_summary()
        return {
            "status": "ready",
            "message": f"Performance monitor active, {summary['total_requests']} requests tracked",
            "uptime": summary["uptime_human"],
            "has_psutil": HAS_PSUTIL,
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Performance monitor error: {str(e)}",
        }


__all__ = [
    "RequestMetric",
    "SystemSnapshot",
    "MetricsCollector",
    "PerformanceMonitorMiddleware",
    "get_metrics_collector",
    "check_performance_monitor_health",
]
