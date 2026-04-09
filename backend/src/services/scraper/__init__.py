"""
Scraper module for the poedb.tw knowledge base.

This package provides the HTTP client, base scraper classes, DOM parsing
utilities, category scraper, item detail scraper, and custom exceptions
needed to scrape Path of Exile data from poedb.tw.

Quick start::

    from src.services.scraper import HTTPClient, SimpleScraper, check_scraper_health
    from src.services.scraper.parsers import extract_page_title, extract_table_data

    # Async usage
    async with HTTPClient() as client:
        html = await client.get("/us/Unique_Weapons")

    # Sync usage (for quick testing)
    scraper = SimpleScraper()
    result = scraper.fetch("/us/Unique_Weapons")

    # DOM parsing
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "lxml")
    title = extract_page_title(soup)

    # Health check
    status = await check_scraper_health()

    # Category scraping
    from src.services.scraper import CategoryScraper
    async with CategoryScraper() as scraper:
        result = await scraper.scrape_category("Unique", "https://poedb.tw/us/Unique")

    # Item detail scraping
    from src.services.scraper import ItemDetailScraper
    async with ItemDetailScraper() as scraper:
        result = await scraper.scrape_item("https://poedb.tw/us/Tabula_Rasa")

Module structure::

    scraper/
    +-- __init__.py        -- Public API & re-exports
    +-- exceptions.py      -- Custom exception hierarchy
    +-- http_client.py     -- Async HTTP client with retries & rate limiting
    +-- base.py            -- Abstract BaseScraper, ScrapeResult, SimpleScraper
    +-- parsers.py         -- DOM parsing utilities for poedb.tw pages
    +-- category.py        -- Category page scraper with pagination support
    +-- item_detail.py     -- Item detail page scraper for individual items
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
from src.services.scraper.parsers import (
    SELECTORS,
    extract_flavor_text,
    extract_image_url,
    extract_item_name,
    extract_links,
    extract_page_title,
    extract_requirements,
    extract_stats,
    extract_table_data,
    find_all,
    find_first,
    safe_get_attr,
    safe_get_text,
)
from src.services.scraper.category import (
    CategoryItem,
    CategoryScraper,
    scrape_category,
)
from src.services.scraper.item_detail import (
    ItemDetail,
    ItemDetailScraper,
    scrape_item_detail,
)
from src.services.scraper.game_version import (
    detect_game_version,
    detect_game_version_async,
    detect_game_version_model,
    get_version_for_url,
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
    # DOM parsers
    "SELECTORS",
    "safe_get_text",
    "safe_get_attr",
    "find_first",
    "find_all",
    "extract_page_title",
    "extract_item_name",
    "extract_stats",
    "extract_flavor_text",
    "extract_requirements",
    "extract_image_url",
    "extract_links",
    "extract_table_data",
    # Category scraper
    "CategoryItem",
    "CategoryScraper",
    "scrape_category",
    # Item detail scraper
    "ItemDetail",
    "ItemDetailScraper",
    "scrape_item_detail",
    # Game version detection
    "detect_game_version",
    "detect_game_version_async",
    "detect_game_version_model",
    "get_version_for_url",
    # Health check
    "check_scraper_health",
]
