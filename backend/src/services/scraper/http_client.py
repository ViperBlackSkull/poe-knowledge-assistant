"""
HTTP client for the poedb.tw scraper.

Provides a resilient HTTP client with:
- Configurable retries with exponential back-off
- Rate-limit awareness (429 handling)
- Request timeout management
- Session reuse via httpx
- Comprehensive logging
"""

import asyncio
import logging
import time
from typing import Any

import httpx

from src.config import get_settings
from src.services.scraper.exceptions import (
    ScraperConnectionError,
    ScraperError,
    ScraperHTTPError,
    ScraperRateLimitError,
    ScraperTimeoutError,
)

logger = logging.getLogger(__name__)

# Default base URL for poedb.tw
DEFAULT_BASE_URL = "https://poedb.tw"


class HTTPClient:
    """
    Async HTTP client tailored for scraping poedb.tw.

    Features:
        - Automatic retries with exponential back-off
        - Rate-limit handling (respects Retry-After header)
        - Configurable delay between requests
        - Comprehensive logging of every request
        - User-Agent rotation / custom headers

    Usage::

        async with HTTPClient() as client:
            html = await client.get("/us/Unique_Weapons")
    """

    def __init__(
        self,
        base_url: str | None = None,
        timeout: float | None = None,
        max_retries: int | None = None,
        rate_limit_delay: float | None = None,
        user_agent: str | None = None,
    ) -> None:
        """
        Initialise the HTTP client.

        Args:
            base_url: Root URL for all requests (defaults to ``https://poedb.tw``).
            timeout: Per-request timeout in seconds.
            max_retries: Maximum number of retry attempts for transient failures.
            rate_limit_delay: Minimum seconds to wait between consecutive requests.
            user_agent: Value for the ``User-Agent`` header.
        """
        settings = get_settings()

        self.base_url = base_url or DEFAULT_BASE_URL
        self.timeout = timeout or settings.scraper.timeout
        self.max_retries = max_retries if max_retries is not None else settings.scraper.max_retries
        self.rate_limit_delay = rate_limit_delay or settings.scraper.rate_limit_delay
        self.user_agent = user_agent or settings.scraper.user_agent

        self._client: httpx.AsyncClient | None = None
        self._last_request_time: float = 0.0

    # ------------------------------------------------------------------
    # Context-manager support
    # ------------------------------------------------------------------

    async def __aenter__(self) -> "HTTPClient":
        """Create the underlying httpx client when entering the context."""
        await self._ensure_client()
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Close the underlying httpx client."""
        await self.close()

    # ------------------------------------------------------------------
    # Client lifecycle
    # ------------------------------------------------------------------

    async def _ensure_client(self) -> httpx.AsyncClient:
        """Return the existing client or create a new one."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=httpx.Timeout(self.timeout),
                headers={
                    "User-Agent": self.user_agent,
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.5",
                },
                follow_redirects=True,
            )
            logger.info(
                "HTTPClient initialised -- base_url=%s, timeout=%.1fs, max_retries=%d, rate_limit_delay=%.2fs",
                self.base_url,
                self.timeout,
                self.max_retries,
                self.rate_limit_delay,
            )
        return self._client

    async def close(self) -> None:
        """Gracefully close the HTTP client."""
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()
            logger.info("HTTPClient closed")

    # ------------------------------------------------------------------
    # Rate-limit bookkeeping
    # ------------------------------------------------------------------

    async def _enforce_rate_limit(self) -> None:
        """Block until the configured inter-request delay has elapsed."""
        now = time.monotonic()
        elapsed = now - self._last_request_time
        if elapsed < self.rate_limit_delay:
            wait = self.rate_limit_delay - elapsed
            logger.debug("Rate-limit: sleeping %.2fs", wait)
            await asyncio.sleep(wait)
        self._last_request_time = time.monotonic()

    # ------------------------------------------------------------------
    # Core request method
    # ------------------------------------------------------------------

    async def get(
        self,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> str:
        """
        Perform a GET request with automatic retries.

        Args:
            path: URL path relative to ``base_url`` (e.g. ``/us/Unique_Weapons``).
            params: Optional query parameters.
            headers: Optional additional headers to merge with defaults.

        Returns:
            The response body as text (HTML).

        Raises:
            ScraperConnectionError: Network-level failure after all retries.
            ScraperHTTPError: Server returned a non-2xx status after all retries.
            ScraperRateLimitError: 429 received and retries exhausted.
            ScraperTimeoutError: Request timed out after all retries.
            ScraperError: Unexpected failure.
        """
        client = await self._ensure_client()
        url = f"{self.base_url}{path}"

        last_exception: Exception | None = None

        for attempt in range(1, self.max_retries + 1):
            try:
                await self._enforce_rate_limit()

                logger.info("GET %s (attempt %d/%d)", url, attempt, self.max_retries)
                start = time.monotonic()
                response = await client.get(path, params=params, headers=headers)
                elapsed = time.monotonic() - start
                logger.info(
                    "Response: %d in %.2fs (url=%s)", response.status_code, elapsed, url
                )

                # --- Handle specific status codes ---
                if response.status_code == 429:
                    retry_after = float(response.headers.get("Retry-After", self.rate_limit_delay * 2))
                    logger.warning(
                        "Rate-limited (429) on %s -- Retry-After=%.1fs", url, retry_after
                    )
                    if attempt < self.max_retries:
                        await asyncio.sleep(retry_after)
                        continue
                    raise ScraperRateLimitError(
                        f"Rate-limited by {url} after {self.max_retries} attempts",
                        url=url,
                        retry_after=retry_after,
                    )

                if response.status_code >= 500:
                    logger.warning(
                        "Server error %d from %s (attempt %d/%d)",
                        response.status_code,
                        url,
                        attempt,
                        self.max_retries,
                    )
                    last_exception = ScraperHTTPError(
                        f"Server error {response.status_code} from {url}",
                        url=url,
                        status_code=response.status_code,
                    )
                    if attempt < self.max_retries:
                        backoff = 2 ** attempt
                        logger.debug("Backing off %ds before retry", backoff)
                        await asyncio.sleep(backoff)
                        continue
                    raise last_exception

                if response.status_code >= 400:
                    raise ScraperHTTPError(
                        f"HTTP {response.status_code} from {url}",
                        url=url,
                        status_code=response.status_code,
                    )

                # --- Success ---
                return response.text

            except ScraperError:
                # Re-raise our own errors immediately (they are already typed)
                raise

            except httpx.TimeoutException as exc:
                logger.warning(
                    "Timeout on %s (attempt %d/%d): %s", url, attempt, self.max_retries, exc
                )
                last_exception = ScraperTimeoutError(
                    f"Request to {url} timed out after {self.timeout}s",
                    url=url,
                    timeout=self.timeout,
                )
                if attempt < self.max_retries:
                    await asyncio.sleep(2 ** attempt)
                    continue

            except httpx.ConnectError as exc:
                logger.warning(
                    "Connection error on %s (attempt %d/%d): %s",
                    url,
                    attempt,
                    self.max_retries,
                    exc,
                )
                last_exception = ScraperConnectionError(
                    f"Cannot connect to {url}: {exc}",
                    url=url,
                )
                if attempt < self.max_retries:
                    await asyncio.sleep(2 ** attempt)
                    continue

            except httpx.HTTPError as exc:
                logger.warning(
                    "HTTP error on %s (attempt %d/%d): %s", url, attempt, self.max_retries, exc
                )
                last_exception = ScraperConnectionError(
                    f"HTTP error for {url}: {exc}",
                    url=url,
                )
                if attempt < self.max_retries:
                    await asyncio.sleep(2 ** attempt)
                    continue

        # All retries exhausted without a ScraperError raise
        if last_exception is not None:
            raise last_exception
        raise ScraperError(f"All {self.max_retries} retries exhausted for {url}", url=url)

    # ------------------------------------------------------------------
    # Convenience helpers
    # ------------------------------------------------------------------

    async def health_check(self) -> dict[str, Any]:
        """
        Verify connectivity to poedb.tw.

        Returns:
            A dict with keys ``status``, ``url``, ``response_time_s``,
            and ``message``.
        """
        try:
            client = await self._ensure_client()
            start = time.monotonic()
            response = await client.get("/", timeout=httpx.Timeout(10.0))
            elapsed = time.monotonic() - start

            if response.status_code < 400:
                return {
                    "status": "healthy",
                    "url": self.base_url,
                    "response_time_s": round(elapsed, 3),
                    "message": f"Successfully connected to {self.base_url}",
                }
            return {
                "status": "unhealthy",
                "url": self.base_url,
                "response_time_s": round(elapsed, 3),
                "message": f"Server returned HTTP {response.status_code}",
            }
        except Exception as exc:
            return {
                "status": "unhealthy",
                "url": self.base_url,
                "response_time_s": None,
                "message": f"Connection failed: {exc}",
            }


__all__ = [
    "HTTPClient",
    "DEFAULT_BASE_URL",
]
