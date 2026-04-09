"""
Scraper module for the poedb.tw knowledge base.

This package provides the HTTP client, base scraper classes, and custom
exceptions needed to scrape Path of Exile data from poedb.tw.

Quick start::

    from src.services.scraper import HTTPClient, SimpleScraper, check_scraper_health

    # Async usage
    async with HTTPClient() as client:
        html = await client.get("/us/Unique_Weapons")

    # Sync usage (for quick testing)
    scraper = SimpleScraper()
    result = scraper.fetch("/us/Unique_Weapons")

    # Health check
    status = await check_scraper_health()
"""

from src.services.scraper.exceptions import (
    ScraperConnectionError,
    ScraperError,
    ScraperHTTPError,
    ScraperParsingError,
    ScraperRateLimitError,
    ScraperTimeoutError,
)
from src.services.scraper.http_client import (
    DEFAULT_BASE_URL,
    HTTPClient,
)
from src.services.scraper.base import (
    BaseScraper,
    ScrapeBatchResult,
    ScrapeResult,
    SimpleScraper,
)


async def check_scraper_health() -> dict:
    """
    Check the health of the scraper HTTP client.

    Verifies that poedb.tw is reachable.

    Returns:
        dict with keys ``status``, ``url``, ``response_time_s``, ``message``.
    """
    async with HTTPClient() as client:
        return await client.health_check()


__all__ = [
    # Exceptions
    "ScraperError",
    "ScraperConnectionError",
    "ScraperHTTPError",
    "ScraperRateLimitError",
    "ScraperParsingError",
    "ScraperTimeoutError",
    # HTTP client
    "HTTPClient",
    "DEFAULT_BASE_URL",
    # Base classes
    "BaseScraper",
    "ScrapeResult",
    "ScrapeBatchResult",
    "SimpleScraper",
    # Health check
    "check_scraper_health",
]
