"""
Caching service for POE Knowledge Assistant.
Provides in-memory caching for RAG search results, configuration,
and frequently accessed data with TTL and size-based eviction.
"""
import hashlib
import logging
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


@dataclass
class CacheEntry:
    """A single cache entry with value, TTL, and access metadata."""
    value: Any
    created_at: float
    expires_at: float
    hits: int = 0
    last_accessed: float = 0.0

    def __post_init__(self):
        self.last_accessed = self.created_at

    @property
    def is_expired(self) -> bool:
        return time.time() > self.expires_at

    @property
    def age_seconds(self) -> float:
        return time.time() - self.created_at


class LRUCache:
    """
    Thread-safe LRU (Least Recently Used) cache with TTL support.

    Features:
    - Size-based eviction when max capacity is reached
    - TTL-based expiration for stale entries
    - Thread-safe operations via locking
    - Cache statistics (hits, misses, evictions)
    - Periodic cleanup of expired entries
    """

    def __init__(
        self,
        max_size: int = 1000,
        default_ttl: float = 300.0,
        cleanup_interval: float = 60.0,
    ):
        """
        Initialize the LRU cache.

        Args:
            max_size: Maximum number of entries in the cache
            default_ttl: Default time-to-live in seconds for cache entries
            cleanup_interval: Interval in seconds between automatic cleanups
        """
        self._max_size = max_size
        self._default_ttl = default_ttl
        self._cleanup_interval = cleanup_interval
        self._cache: OrderedDict[str, CacheEntry] = OrderedDict()
        self._lock = threading.RLock()
        self._stats = {
            "hits": 0,
            "misses": 0,
            "evictions": 0,
            "expired": 0,
            "sets": 0,
        }
        self._last_cleanup = time.time()

    def _make_key(self, prefix: str, **kwargs) -> str:
        """Create a deterministic cache key from prefix and keyword arguments."""
        # Sort kwargs for deterministic key generation
        serialized = "&".join(
            f"{k}={v}" for k, v in sorted(kwargs.items())
        )
        raw = f"{prefix}:{serialized}"
        return hashlib.md5(raw.encode()).hexdigest()

    def get(self, key: str) -> Optional[Any]:
        """
        Get a value from the cache.

        Args:
            key: Cache key

        Returns:
            Cached value or None if not found/expired
        """
        with self._lock:
            entry = self._cache.get(key)

            if entry is None:
                self._stats["misses"] += 1
                return None

            if entry.is_expired:
                del self._cache[key]
                self._stats["misses"] += 1
                self._stats["expired"] += 1
                return None

            # Move to end (most recently used)
            self._cache.move_to_end(key)
            entry.hits += 1
            entry.last_accessed = time.time()
            self._stats["hits"] += 1
            return entry.value

    def set(
        self,
        key: str,
        value: Any,
        ttl: Optional[float] = None,
    ) -> None:
        """
        Set a value in the cache.

        Args:
            key: Cache key
            value: Value to cache
            ttl: Optional TTL override in seconds
        """
        with self._lock:
            now = time.time()
            effective_ttl = ttl if ttl is not None else self._default_ttl

            # Evict if at capacity and key is new
            if key not in self._cache and len(self._cache) >= self._max_size:
                self._evict_one()

            self._cache[key] = CacheEntry(
                value=value,
                created_at=now,
                expires_at=now + effective_ttl,
            )
            self._cache.move_to_end(key)
            self._stats["sets"] += 1

            # Periodic cleanup
            if now - self._last_cleanup > self._cleanup_interval:
                self._cleanup_expired()

    def delete(self, key: str) -> bool:
        """
        Delete a key from the cache.

        Args:
            key: Cache key to delete

        Returns:
            True if key was found and deleted
        """
        with self._lock:
            if key in self._cache:
                del self._cache[key]
                return True
            return False

    def clear(self) -> int:
        """
        Clear all entries from the cache.

        Returns:
            Number of entries cleared
        """
        with self._lock:
            count = len(self._cache)
            self._cache.clear()
            return count

    def _evict_one(self) -> None:
        """Evict the least recently used entry."""
        if self._cache:
            self._cache.popitem(last=False)
            self._stats["evictions"] += 1

    def _cleanup_expired(self) -> int:
        """
        Remove all expired entries.

        Returns:
            Number of entries removed
        """
        with self._lock:
            expired_keys = [
                k for k, v in self._cache.items() if v.is_expired
            ]
            for key in expired_keys:
                del self._cache[key]
                self._stats["expired"] += 1
            self._last_cleanup = time.time()
            return len(expired_keys)

    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        with self._lock:
            total_requests = self._stats["hits"] + self._stats["misses"]
            hit_rate = (
                self._stats["hits"] / total_requests * 100
                if total_requests > 0
                else 0.0
            )
            return {
                "size": len(self._cache),
                "max_size": self._max_size,
                "hits": self._stats["hits"],
                "misses": self._stats["misses"],
                "evictions": self._stats["evictions"],
                "expired": self._stats["expired"],
                "sets": self._stats["sets"],
                "hit_rate_percent": round(hit_rate, 2),
                "total_requests": total_requests,
                "default_ttl_seconds": self._default_ttl,
            }

    def reset_stats(self) -> None:
        """Reset statistics counters."""
        with self._lock:
            self._stats = {
                "hits": 0,
                "misses": 0,
                "evictions": 0,
                "expired": 0,
                "sets": 0,
            }


class CacheManager:
    """
    Manages multiple named caches for different data types.

    Provides specialized caching for:
    - RAG search results (query + game version + build context)
    - Vector store results
    - Configuration data
    - Health check results
    """

    def __init__(self):
        self._caches: Dict[str, LRUCache] = {}
        self._lock = threading.Lock()

    def get_cache(
        self,
        name: str,
        max_size: int = 1000,
        default_ttl: float = 300.0,
    ) -> LRUCache:
        """
        Get or create a named cache.

        Args:
            name: Cache name (e.g., 'rag', 'config', 'health')
            max_size: Maximum entries for new caches
            default_ttl: Default TTL for new caches

        Returns:
            LRUCache instance
        """
        if name not in self._caches:
            with self._lock:
                if name not in self._caches:
                    self._caches[name] = LRUCache(
                        max_size=max_size,
                        default_ttl=default_ttl,
                    )
                    logger.info(
                        f"Created cache '{name}' with max_size={max_size}, "
                        f"ttl={default_ttl}s"
                    )
        return self._caches[name]

    def get_all_stats(self) -> Dict[str, Dict[str, Any]]:
        """Get statistics for all caches."""
        return {
            name: cache.get_stats()
            for name, cache in self._caches.items()
        }

    def clear_all(self) -> Dict[str, int]:
        """Clear all caches and return counts."""
        return {
            name: cache.clear()
            for name, cache in self._caches.items()
        }

    def clear_cache(self, name: str) -> bool:
        """Clear a specific named cache."""
        if name in self._caches:
            self._caches[name].clear()
            return True
        return False

    def get_rag_cache(self) -> LRUCache:
        """Get the RAG results cache (1000 entries, 5 min TTL)."""
        return self.get_cache("rag", max_size=1000, default_ttl=300.0)

    def get_vector_store_cache(self) -> LRUCache:
        """Get the vector store results cache (500 entries, 5 min TTL)."""
        return self.get_cache("vector_store", max_size=500, default_ttl=300.0)

    def get_config_cache(self) -> LRUCache:
        """Get the configuration cache (50 entries, 60s TTL)."""
        return self.get_cache("config", max_size=50, default_ttl=60.0)

    def get_health_cache(self) -> LRUCache:
        """Get the health check cache (10 entries, 30s TTL)."""
        return self.get_cache("health", max_size=10, default_ttl=30.0)


# Global cache manager instance
_cache_manager: Optional[CacheManager] = None
_cache_lock = threading.Lock()


def get_cache_manager() -> CacheManager:
    """Get the global CacheManager instance."""
    global _cache_manager
    if _cache_manager is None:
        with _cache_lock:
            if _cache_manager is None:
                _cache_manager = CacheManager()
                logger.info("Initialized global CacheManager")
    return _cache_manager


def check_cache_health() -> dict:
    """Check cache system health."""
    try:
        manager = get_cache_manager()
        stats = manager.get_all_stats()
        total_entries = sum(s["size"] for s in stats.values())
        return {
            "status": "ready",
            "caches": len(stats),
            "total_entries": total_entries,
            "message": f"Cache system ready with {len(stats)} caches, {total_entries} entries",
        }
    except Exception as e:
        return {
            "status": "error",
            "caches": 0,
            "total_entries": 0,
            "message": f"Cache system error: {str(e)}",
        }


__all__ = [
    "CacheEntry",
    "LRUCache",
    "CacheManager",
    "get_cache_manager",
    "check_cache_health",
]
