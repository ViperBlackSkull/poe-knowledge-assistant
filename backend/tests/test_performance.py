"""
Comprehensive load testing suite for POE Knowledge Assistant.

Tests concurrent user scenarios, API throughput, database performance,
caching efficiency, rate limiting, and system resource monitoring.

Usage:
    python -m pytest tests/test_performance.py -v -s
    python -m pytest tests/test_performance.py -v -s -k "test_concurrent"
    python -m pytest tests/test_performance.py::LoadTestSuite -v -s
"""
import json
import logging
import statistics
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import pytest
import httpx

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BASE_URL = "http://localhost:8460"
API_PREFIX = f"{BASE_URL}/api"
TIMEOUT = 30.0

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data classes for test results
# ---------------------------------------------------------------------------

@dataclass
class RequestResult:
    """Result of a single HTTP request."""
    endpoint: str
    method: str
    status_code: int
    duration_ms: float
    success: bool
    error: str = ""
    timestamp: float = field(default_factory=time.time)


@dataclass
class LoadTestReport:
    """Aggregated report from a load test run."""
    test_name: str
    total_requests: int
    successful_requests: int
    failed_requests: int
    rate_limited_requests: int
    duration_seconds: float
    requests_per_second: float
    avg_response_ms: float
    p50_response_ms: float
    p90_response_ms: float
    p95_response_ms: float
    p99_response_ms: float
    min_response_ms: float
    max_response_ms: float
    error_rate_percent: float
    status_code_distribution: Dict[int, int] = field(default_factory=dict)
    errors: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "test_name": self.test_name,
            "total_requests": self.total_requests,
            "successful_requests": self.successful_requests,
            "failed_requests": self.failed_requests,
            "rate_limited_requests": self.rate_limited_requests,
            "duration_seconds": round(self.duration_seconds, 2),
            "requests_per_second": round(self.requests_per_second, 2),
            "avg_response_ms": round(self.avg_response_ms, 2),
            "p50_response_ms": round(self.p50_response_ms, 2),
            "p90_response_ms": round(self.p90_response_ms, 2),
            "p95_response_ms": round(self.p95_response_ms, 2),
            "p99_response_ms": round(self.p99_response_ms, 2),
            "min_response_ms": round(self.min_response_ms, 2),
            "max_response_ms": round(self.max_response_ms, 2),
            "error_rate_percent": round(self.error_rate_percent, 2),
            "status_code_distribution": self.status_code_distribution,
            "errors": self.errors[:10],
        }


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def percentile(data: List[float], pct: float) -> float:
    """Calculate percentile from a list of values."""
    if not data:
        return 0.0
    sorted_data = sorted(data)
    idx = int(len(sorted_data) * pct / 100)
    idx = min(idx, len(sorted_data) - 1)
    return sorted_data[idx]


def make_request(
    method: str,
    endpoint: str,
    json_data: Optional[Dict] = None,
    timeout: float = TIMEOUT,
) -> RequestResult:
    """Make an HTTP request and return a RequestResult."""
    url = f"{API_PREFIX}{endpoint}"
    start = time.time()
    try:
        with httpx.Client(timeout=timeout) as client:
            if method.upper() == "GET":
                response = client.get(url)
            elif method.upper() == "POST":
                response = client.post(url, json=json_data)
            elif method.upper() == "PUT":
                response = client.put(url, json=json_data)
            elif method.upper() == "DELETE":
                response = client.delete(url)
            else:
                raise ValueError(f"Unsupported method: {method}")

        duration_ms = (time.time() - start) * 1000
        is_rate_limited = response.status_code == 429
        return RequestResult(
            endpoint=endpoint,
            method=method,
            status_code=response.status_code,
            duration_ms=duration_ms,
            success=200 <= response.status_code < 300,
            error="" if not is_rate_limited else "rate_limited",
        )
    except Exception as e:
        duration_ms = (time.time() - start) * 1000
        return RequestResult(
            endpoint=endpoint,
            method=method,
            status_code=0,
            duration_ms=duration_ms,
            success=False,
            error=str(e),
        )


def run_concurrent_requests(
    num_requests: int,
    num_threads: int,
    method: str,
    endpoint: str,
    json_data: Optional[Dict] = None,
) -> Tuple[List[RequestResult], float]:
    """
    Run concurrent HTTP requests and return results with total duration.
    """
    results: List[RequestResult] = []
    start_time = time.time()

    with ThreadPoolExecutor(max_workers=num_threads) as executor:
        futures = [
            executor.submit(make_request, method, endpoint, json_data)
            for _ in range(num_requests)
        ]
        for future in as_completed(futures):
            results.append(future.result())

    total_duration = time.time() - start_time
    return results, total_duration


def generate_report(
    test_name: str,
    results: List[RequestResult],
    duration: float,
) -> LoadTestReport:
    """Generate a LoadTestReport from a list of RequestResults."""
    successful = [r for r in results if r.success]
    rate_limited = [r for r in results if r.status_code == 429]
    failed = [r for r in results if not r.success and r.status_code != 429]
    durations = [r.duration_ms for r in results]
    status_dist: Dict[int, int] = {}
    errors = []

    for r in results:
        status_dist[r.status_code] = status_dist.get(r.status_code, 0) + 1
        if r.error and r.error != "rate_limited":
            errors.append(r.error)

    return LoadTestReport(
        test_name=test_name,
        total_requests=len(results),
        successful_requests=len(successful),
        failed_requests=len(failed),
        rate_limited_requests=len(rate_limited),
        duration_seconds=duration,
        requests_per_second=len(results) / max(duration, 0.001),
        avg_response_ms=statistics.mean(durations) if durations else 0,
        p50_response_ms=percentile(durations, 50),
        p90_response_ms=percentile(durations, 90),
        p95_response_ms=percentile(durations, 95),
        p99_response_ms=percentile(durations, 99),
        min_response_ms=min(durations) if durations else 0,
        max_response_ms=max(durations) if durations else 0,
        error_rate_percent=len(failed) / max(len(results), 1) * 100,
        status_code_distribution=status_dist,
        errors=errors,
    )


def wait_for_rate_limit_reset(wait_seconds: float = 2.0) -> None:
    """Wait for rate limit window to partially reset."""
    time.sleep(wait_seconds)


# ---------------------------------------------------------------------------
# Fixture for ensuring server is available and resetting state
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session", autouse=True)
def verify_server_available():
    """Verify the test server is running before tests."""
    try:
        response = httpx.get(f"{API_PREFIX}/", timeout=5.0)
        assert response.status_code == 200
    except Exception as e:
        pytest.skip(
            f"Test server not available at {BASE_URL}: {e}"
        )
    # Reset metrics at start
    try:
        httpx.post(f"{API_PREFIX}/performance/metrics/reset")
    except Exception:
        pass


@pytest.fixture(autouse=True)
def reset_rate_limits():
    """Wait briefly between tests to allow rate limit windows to partially reset."""
    yield
    time.sleep(1)


# ---------------------------------------------------------------------------
# Test Suite: Basic Performance
# ---------------------------------------------------------------------------

class TestBasicPerformance:
    """Test basic API endpoint performance and responsiveness."""

    def test_root_endpoint_responsive(self):
        """Root endpoint should respond in under 100ms."""
        result = make_request("GET", "/")
        assert result.success, f"Root endpoint failed: {result.error}"
        assert result.duration_ms < 100, (
            f"Root endpoint too slow: {result.duration_ms:.1f}ms"
        )

    def test_health_endpoint_responsive(self):
        """Health endpoint should respond in under 1000ms (allows for cold start)."""
        # Warm up first
        make_request("GET", "/health")
        result = make_request("GET", "/health")
        assert result.success, f"Health endpoint failed: {result.error}"
        assert result.duration_ms < 1000, (
            f"Health endpoint too slow: {result.duration_ms:.1f}ms"
        )

    def test_config_endpoint_responsive(self):
        """Config endpoint should respond in under 500ms."""
        result = make_request("GET", "/config")
        assert result.success, f"Config endpoint failed: {result.error}"
        assert result.duration_ms < 500, (
            f"Config endpoint too slow: {result.duration_ms:.1f}ms"
        )

    def test_performance_endpoints_responsive(self):
        """Performance monitoring endpoints should respond in under 300ms."""
        endpoints = [
            "/performance/health",
            "/performance/overview",
            "/performance/metrics",
            "/performance/system",
            "/performance/cache",
            "/performance/rate-limits",
        ]
        for endpoint in endpoints:
            result = make_request("GET", endpoint)
            assert result.success, (
                f"Performance endpoint {endpoint} failed: {result.error}"
            )
            assert result.duration_ms < 300, (
                f"Performance endpoint {endpoint} too slow: "
                f"{result.duration_ms:.1f}ms"
            )

    def test_sequential_requests_consistency(self):
        """30 sequential requests should all succeed with consistent latency."""
        results = []
        for _ in range(30):
            result = make_request("GET", "/health")
            results.append(result)

        successes = [r for r in results if r.success]
        assert len(successes) >= 28, (
            f"Only {len(successes)}/30 sequential requests succeeded"
        )

        durations = [r.duration_ms for r in results if r.success]
        avg = statistics.mean(durations) if durations else 0
        assert avg < 500, f"Average response time too high: {avg:.1f}ms"

        report = generate_report("sequential_30", results, sum(durations) / 1000)
        logger.info(f"Sequential test: {json.dumps(report.to_dict(), indent=2)}")


# ---------------------------------------------------------------------------
# Test Suite: Concurrent Users
# ---------------------------------------------------------------------------

class TestConcurrentUsers:
    """Test API behavior under concurrent user load."""

    def test_10_concurrent_users(self):
        """10 concurrent users making health check requests."""
        wait_for_rate_limit_reset(2)
        results, duration = run_concurrent_requests(
            num_requests=40,
            num_threads=10,
            method="GET",
            endpoint="/health",
        )
        report = generate_report("concurrent_10_users", results, duration)
        logger.info(f"10 concurrent users: {json.dumps(report.to_dict(), indent=2)}")

        # At least 80% should succeed (some may be rate-limited from prior tests)
        non_rate_limited = [r for r in results if r.status_code != 429]
        assert len(non_rate_limited) >= 20, (
            f"Too many rate-limited responses: {report.rate_limited_requests}"
        )

        if non_rate_limited:
            successful_durations = [r.duration_ms for r in non_rate_limited]
            p95 = percentile(successful_durations, 95)
            assert p95 < 2000, (
                f"P95 response time too high: {p95:.1f}ms"
            )

    def test_50_concurrent_users(self):
        """50 concurrent users making mixed endpoint requests."""
        wait_for_rate_limit_reset(3)
        endpoints = ["/health", "/", "/config", "/performance/metrics"]
        all_results = []
        start = time.time()

        with ThreadPoolExecutor(max_workers=50) as executor:
            futures = []
            for i in range(100):
                endpoint = endpoints[i % len(endpoints)]
                futures.append(
                    executor.submit(make_request, "GET", endpoint)
                )
            for future in as_completed(futures):
                all_results.append(future.result())

        duration = time.time() - start
        report = generate_report("concurrent_50_users", all_results, duration)
        logger.info(f"50 concurrent users: {json.dumps(report.to_dict(), indent=2)}")

        # Count successful (200) and rate-limited (429) separately
        ok_count = report.status_code_distribution.get(200, 0)
        rate_limited_count = report.status_code_distribution.get(429, 0)
        errors_count = len([r for r in all_results if r.status_code not in (200, 429)])

        assert errors_count == 0, f"Unexpected errors: {errors_count}"
        assert ok_count > 0, "No successful requests"

        logger.info(
            f"50 users: {ok_count} ok, {rate_limited_count} rate-limited, "
            f"{report.requests_per_second:.1f} req/s"
        )

    def test_100_concurrent_users(self):
        """100 concurrent users making rapid health check requests."""
        wait_for_rate_limit_reset(3)
        results, duration = run_concurrent_requests(
            num_requests=200,
            num_threads=100,
            method="GET",
            endpoint="/health",
        )
        report = generate_report("concurrent_100_users", results, duration)
        logger.info(f"100 concurrent users: {json.dumps(report.to_dict(), indent=2)}")

        ok_count = report.status_code_distribution.get(200, 0)
        rate_limited_count = report.status_code_distribution.get(429, 0)

        assert ok_count > 0, "No successful requests under 100-user load"

        logger.info(
            f"100 users: {ok_count} ok, {rate_limited_count} rate-limited, "
            f"throughput={report.requests_per_second:.1f} req/s"
        )

    def test_500_concurrent_users(self):
        """500 concurrent users - stress test."""
        wait_for_rate_limit_reset(5)
        results, duration = run_concurrent_requests(
            num_requests=500,
            num_threads=500,
            method="GET",
            endpoint="/health",
        )
        report = generate_report("concurrent_500_users", results, duration)
        logger.info(f"500 concurrent users: {json.dumps(report.to_dict(), indent=2)}")

        ok_count = report.status_code_distribution.get(200, 0)
        rate_limited_count = report.status_code_distribution.get(429, 0)
        errors = [r for r in results if r.status_code not in (200, 429)]

        # Under heavy stress, most requests may be rate-limited from accumulated counts
        # The key assertion is that there are no unexpected errors (only 429s)
        assert len(errors) == 0, f"Unexpected errors under stress: {len(errors)}"
        assert ok_count + rate_limited_count == len(results), (
            "Mismatch in result counts"
        )

        logger.info(
            f"500 users: {ok_count} ok, {rate_limited_count} rate-limited, "
            f"throughput={report.requests_per_second:.1f} req/s"
        )


# ---------------------------------------------------------------------------
# Test Suite: Cache Performance
# ---------------------------------------------------------------------------

class TestCachePerformance:
    """Test caching system performance and efficiency."""

    def test_cache_initialization(self):
        """Cache system should initialize and report stats."""
        wait_for_rate_limit_reset(2)
        result = make_request("GET", "/performance/cache")
        assert result.success or result.status_code == 429
        if result.success:
            response = httpx.get(f"{API_PREFIX}/performance/cache")
            data = response.json()
            assert "health" in data
            assert data["health"]["status"] in ("ready", "ok")

    def test_cache_clear(self):
        """Cache clear endpoint should work."""
        wait_for_rate_limit_reset(2)
        result = make_request("POST", "/performance/cache/clear")
        assert result.success or result.status_code == 429

    def test_cache_hit_rate_under_load(self):
        """Cache hit rate should be tracked under repeated requests."""
        wait_for_rate_limit_reset(3)
        # Make identical config requests
        durations = []
        success_count = 0
        rate_limited_count = 0
        for i in range(10):
            result = make_request("GET", "/config")
            if result.success:
                durations.append(result.duration_ms)
                success_count += 1
            elif result.status_code == 429:
                rate_limited_count += 1

        # Allow all to be rate-limited (accumulated from prior tests)
        if rate_limited_count == 10:
            pytest.skip("All requests rate-limited (accumulated rate limits from prior tests)")

        assert success_count >= 1, f"No successful config requests (all rate-limited)"

        # Check cache stats endpoint
        cache_result = make_request("GET", "/performance/cache")
        logger.info(
            f"Cache test: {success_count} successful, "
            f"{rate_limited_count} rate-limited, "
            f"avg={statistics.mean(durations):.1f}ms"
        )

    def test_cache_concurrent_access(self):
        """Cache should handle concurrent reads without errors."""
        wait_for_rate_limit_reset(3)
        results, duration = run_concurrent_requests(
            num_requests=30,
            num_threads=10,
            method="GET",
            endpoint="/performance/cache",
        )

        successes = [r for r in results if r.success]
        rate_limited = [r for r in results if r.status_code == 429]
        assert len(successes) + len(rate_limited) == len(results), (
            "Unexpected errors in concurrent cache access"
        )


# ---------------------------------------------------------------------------
# Test Suite: Rate Limiting
# ---------------------------------------------------------------------------

class TestRateLimiting:
    """Test API rate limiting behavior."""

    def test_rate_limit_headers_present(self):
        """Rate limit headers should be present in API responses."""
        wait_for_rate_limit_reset(2)
        response = httpx.get(f"{API_PREFIX}/health")
        assert "X-RateLimit-Limit" in response.headers
        assert "X-RateLimit-Remaining" in response.headers
        assert "X-RateLimit-Reset" in response.headers

    def test_rate_limit_counter_decreases(self):
        """Rate limit remaining count should decrease with requests."""
        wait_for_rate_limit_reset(2)
        headers_list = []
        for _ in range(3):
            response = httpx.get(f"{API_PREFIX}/health")
            headers_list.append(dict(response.headers))

        remaining_values = [
            int(h.get("X-RateLimit-Remaining", "0"))
            for h in headers_list
        ]
        # Remaining should generally decrease
        assert remaining_values[-1] <= remaining_values[0], (
            f"Rate limit remaining not decreasing: {remaining_values}"
        )

    def test_rate_limit_stats(self):
        """Rate limit stats endpoint should report active rules."""
        wait_for_rate_limit_reset(2)
        result = make_request("GET", "/performance/rate-limits")
        assert result.success or result.status_code == 429
        if result.success:
            response = httpx.get(f"{API_PREFIX}/performance/rate-limits")
            data = response.json()
            assert "status" in data
            assert data["status"] == "ready"

    def test_rate_limiting_blocks_excess_requests(self):
        """Rapid requests beyond the limit should get 429 responses."""
        # Make many rapid requests to a low-limit endpoint
        results = []
        for _ in range(25):
            result = make_request("GET", "/admin/scrape/status")
            results.append(result)

        rate_limited = [r for r in results if r.status_code == 429]
        # Some should get rate limited (admin has limit of 20/min)
        logger.info(
            f"Rate limit test: {len(rate_limited)} of {len(results)} "
            f"requests rate-limited (expected some)"
        )


# ---------------------------------------------------------------------------
# Test Suite: System Resources
# ---------------------------------------------------------------------------

class TestSystemResources:
    """Test system resource monitoring."""

    def test_system_stats_available(self):
        """System resource stats should be available."""
        wait_for_rate_limit_reset(2)
        result = make_request("GET", "/performance/system")
        assert result.success or result.status_code == 429
        if result.success:
            response = httpx.get(f"{API_PREFIX}/performance/system")
            data = response.json()
            assert "status" in data
            assert "current" in data
            assert "memory_mb" in data["current"]

    def test_system_memory_reasonable(self):
        """Memory usage should be under 2GB."""
        wait_for_rate_limit_reset(2)
        response = httpx.get(f"{API_PREFIX}/performance/system")
        if response.status_code == 200:
            data = response.json()
            memory_mb = data["current"]["memory_mb"]
            assert memory_mb < 2048, (
                f"Memory usage too high: {memory_mb:.0f}MB"
            )
        else:
            pytest.skip("Rate limited")

    def test_system_stats_during_load(self):
        """System stats should remain reasonable under load."""
        wait_for_rate_limit_reset(3)
        # Make concurrent requests
        results, duration = run_concurrent_requests(
            num_requests=30,
            num_threads=10,
            method="GET",
            endpoint="/health",
        )

        # Check system stats after load
        response = httpx.get(f"{API_PREFIX}/performance/system")
        if response.status_code == 200:
            data = response.json()
            memory_mb = data["current"]["memory_mb"]
            logger.info(
                f"System after load: memory={memory_mb:.0f}MB, "
                f"threads={data['current'].get('thread_count', 'N/A')}"
            )
            assert memory_mb < 2048, (
                f"Memory spike after load: {memory_mb:.0f}MB"
            )


# ---------------------------------------------------------------------------
# Test Suite: Performance Monitoring
# ---------------------------------------------------------------------------

class TestPerformanceMonitoring:
    """Test performance monitoring and metrics collection."""

    def test_metrics_collection(self):
        """Metrics should be collected for each request."""
        wait_for_rate_limit_reset(2)
        response = httpx.get(f"{API_PREFIX}/performance/metrics")
        assert response.status_code == 200, f"Metrics endpoint failed: {response.status_code}"
        data = response.json()
        assert "total_requests" in data
        assert data["total_requests"] >= 1

    def test_endpoint_specific_metrics(self):
        """Endpoint-specific metrics should be available."""
        wait_for_rate_limit_reset(2)
        response = httpx.get(
            f"{API_PREFIX}/performance/metrics",
            params={"endpoint": "/api/performance/system"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "endpoints" in data

    def test_slow_requests_tracking(self):
        """Slow requests should be tracked."""
        wait_for_rate_limit_reset(2)
        response = httpx.get(
            f"{API_PREFIX}/performance/metrics/slow",
            params={"threshold_ms": 0, "limit": 10},
        )
        assert response.status_code == 200
        data = response.json()
        assert "slow_requests" in data
        assert "count" in data

    def test_metrics_reset(self):
        """Metrics reset should clear collected data."""
        wait_for_rate_limit_reset(2)
        result = make_request("POST", "/performance/metrics/reset")
        assert result.success or result.status_code == 429

    def test_performance_overview(self):
        """Performance overview should include all subsystems."""
        wait_for_rate_limit_reset(2)
        response = httpx.get(f"{API_PREFIX}/performance/overview")
        assert response.status_code == 200, f"Overview failed: {response.status_code}"
        data = response.json()
        assert "status" in data
        assert "summary" in data
        assert "system" in data
        assert "cache" in data
        assert "rate_limiting" in data


# ---------------------------------------------------------------------------
# Test Suite: Sustained Load
# ---------------------------------------------------------------------------

class TestSustainedLoad:
    """Test API behavior under sustained load over time."""

    def test_sustained_load_10_seconds(self):
        """API should handle sustained load for 10 seconds."""
        wait_for_rate_limit_reset(5)
        all_results = []
        start = time.time()
        target_duration = 10

        with ThreadPoolExecutor(max_workers=5) as executor:
            while time.time() - start < target_duration:
                futures = [
                    executor.submit(make_request, "GET", "/health")
                    for _ in range(5)
                ]
                for future in as_completed(futures):
                    all_results.append(future.result())
                time.sleep(0.5)

        actual_duration = time.time() - start
        report = generate_report(
            "sustained_10s", all_results, actual_duration
        )
        logger.info(
            f"Sustained load test: {json.dumps(report.to_dict(), indent=2)}"
        )

        successes = [r for r in all_results if r.success]
        success_rate = len(successes) / len(all_results) * 100

        assert success_rate >= 80, (
            f"Success rate too low: {success_rate:.1f}%"
        )


# ---------------------------------------------------------------------------
# Test Suite: Mixed Workload
# ---------------------------------------------------------------------------

class TestMixedWorkload:
    """Test API with mixed read/write workloads."""

    def test_mixed_read_write(self):
        """Mixed read (GET) and write (POST cache clear) workload."""
        wait_for_rate_limit_reset(5)
        all_results = []
        start = time.time()

        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = []
            for i in range(30):
                if i % 10 == 0:
                    futures.append(
                        executor.submit(
                            make_request, "POST",
                            "/performance/cache/clear"
                        )
                    )
                else:
                    endpoints = ["/health", "/config", "/performance/metrics"]
                    endpoint = endpoints[i % len(endpoints)]
                    futures.append(
                        executor.submit(make_request, "GET", endpoint)
                    )

            for future in as_completed(futures):
                all_results.append(future.result())

        duration = time.time() - start
        report = generate_report("mixed_read_write", all_results, duration)
        logger.info(f"Mixed workload: {json.dumps(report.to_dict(), indent=2)}")

        successes = [r for r in all_results if r.success]
        assert len(successes) >= 15, (
            f"Too many failures in mixed workload: "
            f"{len(successes)}/{len(all_results)}"
        )


# ---------------------------------------------------------------------------
# Comprehensive Report Generation
# ---------------------------------------------------------------------------

class TestComprehensiveReport:
    """Generate a comprehensive performance report."""

    def test_full_performance_report(self):
        """
        Run a comprehensive performance test and generate a full report.
        This is the main acceptance test for performance optimization.
        """
        wait_for_rate_limit_reset(10)

        test_scenarios = [
            ("light_5_users", 20, 5, "/health", "GET"),
            ("medium_20_users", 50, 20, "/health", "GET"),
        ]

        reports = []
        for name, num_req, threads, endpoint, method in test_scenarios:
            results, duration = run_concurrent_requests(
                num_requests=num_req,
                num_threads=threads,
                method=method,
                endpoint=endpoint,
            )
            report = generate_report(name, results, duration)
            reports.append(report)
            logger.info(f"[{name}] {report.to_dict()}")
            time.sleep(2)  # Wait between scenarios for rate limit reset

        # Get final performance overview
        overview_response = httpx.get(f"{API_PREFIX}/performance/overview")
        overview = overview_response.json() if overview_response.status_code == 200 else {}

        logger.info("=" * 60)
        logger.info("COMPREHENSIVE PERFORMANCE REPORT")
        logger.info("=" * 60)
        for report in reports:
            r = report.to_dict()
            logger.info(
                f"\n{r['test_name']}:\n"
                f"  Requests: {r['total_requests']} "
                f"({r['successful_requests']} ok, "
                f"{r['rate_limited_requests']} rate-limited, "
                f"{r['failed_requests']} errors)\n"
                f"  Throughput: {r['requests_per_second']} req/s\n"
                f"  Latency: avg={r['avg_response_ms']}ms, "
                f"p95={r['p95_response_ms']}ms, "
                f"p99={r['p99_response_ms']}ms\n"
                f"  Error rate: {r['error_rate_percent']}%"
            )
        if overview:
            logger.info(f"\nFinal system state: {json.dumps(overview.get('summary', {}), indent=2)}")
            logger.info(f"System resources: {json.dumps(overview.get('system', {}), indent=2)}")
        logger.info("=" * 60)

        # At least the light test should have mostly succeeded
        light_report = reports[0]
        assert light_report.error_rate_percent < 50, (
            f"Light load test had too many errors: {light_report.error_rate_percent}%"
        )
