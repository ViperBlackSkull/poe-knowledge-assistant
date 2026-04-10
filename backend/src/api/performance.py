"""
Performance monitoring API routes for POE Knowledge Assistant.
Provides endpoints for performance metrics, cache management,
rate limiting stats, and system resource monitoring.
"""
import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, Query, Response

from src.services.cache import get_cache_manager, check_cache_health
from src.services.rate_limiter import (
    check_rate_limiter_health,
    get_rate_limit_middleware,
)
from src.services.performance_monitor import (
    get_metrics_collector,
    check_performance_monitor_health,
)

logger = logging.getLogger(__name__)

# Create the performance router
performance_router = APIRouter()


@performance_router.get(
    "/overview",
    tags=["Performance"],
    summary="Get performance overview",
)
async def performance_overview(response: Response):
    """
    Get a comprehensive performance overview including system health,
    cache stats, rate limiting, and request metrics.

    Returns:
        Performance overview with all subsystem stats
    """
    collector = get_metrics_collector()
    cache_manager = get_cache_manager()

    summary = collector.get_summary()
    system = collector.get_system_stats()
    cache_stats = cache_manager.get_all_stats()
    rate_limit = check_rate_limiter_health()
    monitor_health = check_performance_monitor_health()

    overview = {
        "status": "ok",
        "monitor": monitor_health,
        "summary": summary,
        "system": system,
        "cache": cache_stats,
        "rate_limiting": rate_limit,
    }

    return overview


@performance_router.get(
    "/metrics",
    tags=["Performance"],
    summary="Get request metrics",
)
async def get_metrics(
    endpoint: Optional[str] = Query(
        None,
        description="Filter by endpoint path"
    ),
):
    """
    Get detailed request metrics.

    Query Parameters:
        endpoint: Optional endpoint path to filter metrics

    Returns:
        Request metrics with percentile latencies and error rates
    """
    collector = get_metrics_collector()
    return collector.get_endpoint_stats(endpoint)


@performance_router.get(
    "/metrics/summary",
    tags=["Performance"],
    summary="Get metrics summary",
)
async def get_metrics_summary():
    """
    Get a high-level metrics summary.

    Returns:
        Summary with total requests, active requests, avg response time, etc.
    """
    collector = get_metrics_collector()
    return collector.get_summary()


@performance_router.get(
    "/metrics/slow",
    tags=["Performance"],
    summary="Get slow requests",
)
async def get_slow_requests(
    threshold_ms: float = Query(
        1000,
        description="Minimum duration threshold in milliseconds"
    ),
    limit: int = Query(
        20,
        description="Maximum number of results",
        ge=1,
        le=100,
    ),
):
    """
    Get the slowest recent requests above a threshold.

    Query Parameters:
        threshold_ms: Minimum request duration in ms (default 1000)
        limit: Maximum number of results (default 20)

    Returns:
        List of slow request details
    """
    collector = get_metrics_collector()
    slow = collector.get_slow_requests(threshold_ms=threshold_ms, limit=limit)
    return {
        "threshold_ms": threshold_ms,
        "count": len(slow),
        "slow_requests": slow,
    }


@performance_router.get(
    "/system",
    tags=["Performance"],
    summary="Get system resource stats",
)
async def get_system_stats():
    """
    Get current system resource usage.

    Returns:
        CPU, memory, disk usage and process information
    """
    collector = get_metrics_collector()
    return collector.get_system_stats()


@performance_router.get(
    "/cache",
    tags=["Performance"],
    summary="Get cache statistics",
)
async def get_cache_stats():
    """
    Get cache statistics for all named caches.

    Returns:
        Cache hit rates, sizes, and eviction counts
    """
    cache_manager = get_cache_manager()
    health = check_cache_health()
    stats = cache_manager.get_all_stats()
    return {
        "health": health,
        "caches": stats,
    }


@performance_router.post(
    "/cache/clear",
    tags=["Performance"],
    summary="Clear all caches",
)
async def clear_all_caches():
    """
    Clear all cached data.

    Returns:
        Confirmation with counts of cleared entries per cache
    """
    cache_manager = get_cache_manager()
    cleared = cache_manager.clear_all()
    total = sum(cleared.values())
    return {
        "success": True,
        "message": f"Cleared {total} entries from {len(cleared)} caches",
        "cleared": cleared,
    }


@performance_router.post(
    "/cache/clear/{cache_name}",
    tags=["Performance"],
    summary="Clear a specific cache",
)
async def clear_cache(cache_name: str):
    """
    Clear a specific named cache.

    Path Parameters:
        cache_name: Name of the cache to clear (e.g., 'rag', 'config', 'health')

    Returns:
        Confirmation of cache clearing
    """
    cache_manager = get_cache_manager()
    success = cache_manager.clear_cache(cache_name)
    if success:
        return {
            "success": True,
            "message": f"Cache '{cache_name}' cleared",
        }
    return {
        "success": False,
        "message": f"Cache '{cache_name}' not found",
    }


@performance_router.get(
    "/rate-limits",
    tags=["Performance"],
    summary="Get rate limiting statistics",
)
async def get_rate_limit_stats():
    """
    Get rate limiting statistics for all rules.

    Returns:
        Rate limiter configuration and current stats
    """
    return check_rate_limiter_health()


@performance_router.post(
    "/metrics/reset",
    tags=["Performance"],
    summary="Reset all performance metrics",
)
async def reset_metrics():
    """
    Reset all collected performance metrics.

    Returns:
        Confirmation of metrics reset
    """
    collector = get_metrics_collector()
    collector.reset_stats()
    return {
        "success": True,
        "message": "Performance metrics reset",
    }


@performance_router.get(
    "/health",
    tags=["Performance"],
    summary="Performance subsystem health check",
)
async def performance_health():
    """
    Check the health of all performance subsystems.

    Returns:
        Health status of cache, rate limiter, and metrics collector
    """
    cache_health = check_cache_health()
    rate_limit_health = check_rate_limiter_health()
    monitor_health = check_performance_monitor_health()

    all_healthy = all(
        h.get("status") in ("ready", "disabled", "ok")
        for h in [cache_health, rate_limit_health, monitor_health]
    )

    return {
        "status": "healthy" if all_healthy else "degraded",
        "cache": cache_health,
        "rate_limiting": rate_limit_health,
        "monitor": monitor_health,
    }


__all__ = ["performance_router"]
