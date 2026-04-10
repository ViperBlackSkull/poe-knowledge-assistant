"""
API rate limiting service for POE Knowledge Assistant.
Provides per-client and global rate limiting using a sliding window algorithm.
"""
import logging
import threading
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Tuple

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse

logger = logging.getLogger(__name__)


@dataclass
class RateLimitRule:
    """A rate limit rule definition."""
    name: str
    max_requests: int
    window_seconds: float
    description: str = ""

    @property
    def requests_per_second(self) -> float:
        return self.max_requests / self.window_seconds


@dataclass
class ClientState:
    """Rate limit state for a single client."""
    request_times: List[float] = field(default_factory=list)
    blocked_count: int = 0
    total_requests: int = 0

    def cleanup(self, window_seconds: float, now: float) -> None:
        """Remove timestamps outside the sliding window."""
        cutoff = now - window_seconds
        self.request_times = [t for t in self.request_times if t > cutoff]


class SlidingWindowRateLimiter:
    """
    Sliding window rate limiter.

    Tracks requests per client using a sliding time window.
    When the number of requests in the window exceeds the limit,
    subsequent requests are rejected with HTTP 429.
    """

    def __init__(
        self,
        rule: RateLimitRule,
        cleanup_interval: float = 30.0,
    ):
        """
        Initialize the rate limiter.

        Args:
            rule: The rate limit rule to enforce
            cleanup_interval: How often to clean up old entries (seconds)
        """
        self._rule = rule
        self._cleanup_interval = cleanup_interval
        self._clients: Dict[str, ClientState] = defaultdict(ClientState)
        self._lock = threading.RLock()
        self._last_cleanup = time.time()
        self._global_requests: int = 0
        self._global_blocked: int = 0

    @property
    def rule(self) -> RateLimitRule:
        return self._rule

    def _get_client_id(self, request: Request) -> str:
        """Extract a client identifier from the request."""
        # Try X-Forwarded-For header first (for reverse proxy setups)
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()

        # Try X-Real-IP
        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip

        # Fall back to direct client IP
        client = request.client
        if client:
            return client.host

        return "unknown"

    def is_allowed(self, client_id: str) -> Tuple[bool, Dict[str, Any]]:
        """
        Check if a request from the given client is allowed.

        Args:
            client_id: Client identifier

        Returns:
            Tuple of (is_allowed, metadata_dict)
        """
        now = time.time()

        with self._lock:
            # Periodic cleanup
            if now - self._last_cleanup > self._cleanup_interval:
                self._cleanup(now)

            state = self._clients[client_id]
            state.cleanup(self._rule.window_seconds, now)

            current_count = len(state.request_times)
            remaining = max(0, self._rule.max_requests - current_count)
            reset_time = (
                state.request_times[0] + self._rule.window_seconds
                if state.request_times
                else now + self._rule.window_seconds
            )

            metadata = {
                "limit": self._rule.max_requests,
                "remaining": remaining,
                "reset_at": reset_time,
                "window_seconds": self._rule.window_seconds,
                "retry_after": 0,
            }

            if current_count >= self._rule.max_requests:
                state.blocked_count += 1
                self._global_blocked += 1
                metadata["retry_after"] = max(
                    0,
                    state.request_times[0] + self._rule.window_seconds - now,
                )
                return False, metadata

            # Record the request
            state.request_times.append(now)
            state.total_requests += 1
            self._global_requests += 1
            metadata["remaining"] = remaining - 1

            return True, metadata

    def _cleanup(self, now: float) -> None:
        """Remove inactive clients."""
        cutoff = now - self._rule.window_seconds * 2
        inactive_clients = [
            cid
            for cid, state in self._clients.items()
            if not state.request_times
            or state.request_times[-1] < cutoff
        ]
        for cid in inactive_clients:
            del self._clients[cid]

        self._last_cleanup = now
        if inactive_clients:
            logger.debug(
                f"Cleaned up {len(inactive_clients)} inactive rate limit clients"
            )

    def get_stats(self) -> Dict[str, Any]:
        """Get rate limiter statistics."""
        with self._lock:
            return {
                "rule_name": self._rule.name,
                "max_requests": self._rule.max_requests,
                "window_seconds": self._rule.window_seconds,
                "active_clients": len(self._clients),
                "global_requests": self._global_requests,
                "global_blocked": self._global_blocked,
                "requests_per_second": round(self._rule.requests_per_second, 2),
            }


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    FastAPI middleware for API rate limiting.

    Applies configurable rate limits per client IP address.
    Different limits can be set for different endpoint patterns.
    """

    def __init__(
        self,
        app,
        default_rule: Optional[RateLimitRule] = None,
        endpoint_rules: Optional[Dict[str, RateLimitRule]] = None,
    ):
        """
        Initialize rate limiting middleware.

        Args:
            app: The ASGI application
            default_rule: Default rate limit for all endpoints
            endpoint_rules: Specific rules for endpoint path prefixes
        """
        super().__init__(app)
        self._default_rule = default_rule or RateLimitRule(
            name="default",
            max_requests=200,
            window_seconds=60.0,
            description="Default rate limit: 200 requests per minute",
        )
        self._endpoint_rules = endpoint_rules or {
            "/api/chat": RateLimitRule(
                name="chat",
                max_requests=60,
                window_seconds=60.0,
                description="Chat endpoint: 60 requests per minute",
            ),
            "/api/test": RateLimitRule(
                name="testing",
                max_requests=120,
                window_seconds=60.0,
                description="Testing endpoints: 120 requests per minute",
            ),
            "/api/admin": RateLimitRule(
                name="admin",
                max_requests=20,
                window_seconds=60.0,
                description="Admin endpoints: 20 requests per minute",
            ),
        }

        # Create a rate limiter for each rule
        self._limiters: Dict[str, SlidingWindowRateLimiter] = {}
        self._limiters[self._default_rule.name] = SlidingWindowRateLimiter(
            self._default_rule
        )
        for prefix, rule in self._endpoint_rules.items():
            self._limiters[rule.name] = SlidingWindowRateLimiter(rule)

        logger.info(
            f"Rate limiting middleware initialized with "
            f"{len(self._limiters)} rules"
        )

    def _find_rule(self, path: str) -> Tuple[SlidingWindowRateLimiter, RateLimitRule]:
        """Find the applicable rate limit rule for a path."""
        for prefix, rule in self._endpoint_rules.items():
            if path.startswith(prefix):
                return self._limiters[rule.name], rule
        return self._limiters[self._default_rule.name], self._default_rule

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        """Process the request with rate limiting."""
        path = request.url.path

        # Skip rate limiting for non-API paths (docs, openapi.json, etc.)
        if not path.startswith("/api"):
            return await call_next(request)

        limiter, rule = self._find_rule(path)
        client_id = limiter._get_client_id(request)

        allowed, metadata = limiter.is_allowed(client_id)

        # Add rate limit headers to all responses
        if not allowed:
            logger.warning(
                f"Rate limit exceeded for client {client_id} on {path} "
                f"(rule: {rule.name})"
            )
            response = JSONResponse(
                status_code=429,
                content={
                    "detail": "Rate limit exceeded",
                    "rule": rule.name,
                    "retry_after_seconds": round(metadata["retry_after"], 1),
                    "limit": metadata["limit"],
                    "window_seconds": metadata["window_seconds"],
                },
            )
            response.headers["X-RateLimit-Limit"] = str(metadata["limit"])
            response.headers["X-RateLimit-Remaining"] = "0"
            response.headers["X-RateLimit-Reset"] = str(
                int(metadata["reset_at"])
            )
            response.headers["Retry-After"] = str(
                int(metadata["retry_after"])
            )
            return response

        # Process the request
        response = await call_next(request)

        # Add rate limit info headers
        response.headers["X-RateLimit-Limit"] = str(metadata["limit"])
        response.headers["X-RateLimit-Remaining"] = str(metadata["remaining"])
        response.headers["X-RateLimit-Reset"] = str(
            int(metadata["reset_at"])
        )

        return response

    def get_stats(self) -> Dict[str, Any]:
        """Get statistics from all rate limiters."""
        return {
            name: limiter.get_stats()
            for name, limiter in self._limiters.items()
        }


# Global rate limiter middleware reference
_rate_limit_middleware: Optional[RateLimitMiddleware] = None


def set_rate_limit_middleware(middleware: RateLimitMiddleware) -> None:
    """Set the global rate limit middleware reference."""
    global _rate_limit_middleware
    _rate_limit_middleware = middleware


def get_rate_limit_middleware() -> Optional[RateLimitMiddleware]:
    """Get the global rate limit middleware."""
    return _rate_limit_middleware


def check_rate_limiter_health() -> dict:
    """Check rate limiter health."""
    try:
        if _rate_limit_middleware is None:
            return {
                "status": "disabled",
                "message": "Rate limiting not configured",
            }
        stats = _rate_limit_middleware.get_stats()
        return {
            "status": "ready",
            "rules": len(stats),
            "message": f"Rate limiting active with {len(stats)} rules",
            "stats": stats,
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Rate limiter error: {str(e)}",
        }


__all__ = [
    "RateLimitRule",
    "ClientState",
    "SlidingWindowRateLimiter",
    "RateLimitMiddleware",
    "set_rate_limit_middleware",
    "get_rate_limit_middleware",
    "check_rate_limiter_health",
]
