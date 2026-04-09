"""
Base scraper classes and interfaces for the poedb.tw scraper.

Provides an abstract base class that concrete scrapers (items, skills,
categories, etc.) must implement, along with a thin synchronous wrapper
used for simple scripting and testing.

Design goals:
    - Single Responsibility: each subclass scrapes one domain (items, skills, etc.)
    - Consistent logging across all scrapers
    - Structured error reporting
"""

import logging
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from bs4 import BeautifulSoup

from src.config import get_settings
from src.models.scraper import Game, ScrapeJob, ScrapeStatus
from src.services.scraper.exceptions import ScraperError, ScraperParsingError
from src.services.scraper.http_client import HTTPClient

logger = logging.getLogger(__name__)


# ------------------------------------------------------------------
# Dataclasses for scraper results
# ------------------------------------------------------------------


@dataclass
class ScrapeResult:
    """
    Container for the outcome of a single page scrape.

    Attributes:
        url: The URL that was scraped.
        html: Raw HTML of the page (may be ``None`` on failure).
        soup: Parsed BeautifulSoup object (may be ``None`` on failure).
        success: Whether the scrape succeeded.
        error: Error message if the scrape failed.
        elapsed_s: Wall-clock time for the request in seconds.
        metadata: Arbitrary metadata attached by the scraper.
    """

    url: str
    html: str | None = None
    soup: BeautifulSoup | None = None
    success: bool = True
    error: str | None = None
    elapsed_s: float = 0.0
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ScrapeBatchResult:
    """
    Aggregated result for a batch of page scrapes.

    Attributes:
        results: Individual page results.
        total: Total pages attempted.
        succeeded: Number of successful scrapes.
        failed: Number of failed scrapes.
        total_elapsed_s: Cumulative elapsed time.
        errors: List of error messages.
    """

    results: list[ScrapeResult] = field(default_factory=list)
    total: int = 0
    succeeded: int = 0
    failed: int = 0
    total_elapsed_s: float = 0.0
    errors: list[str] = field(default_factory=list)

    def add(self, result: ScrapeResult) -> None:
        """Add a single result and update counters."""
        self.results.append(result)
        self.total += 1
        self.total_elapsed_s += result.elapsed_s
        if result.success:
            self.succeeded += 1
        else:
            self.failed += 1
            if result.error:
                self.errors.append(f"{result.url}: {result.error}")


# ------------------------------------------------------------------
# Abstract base scraper
# ------------------------------------------------------------------


class BaseScraper(ABC):
    """
    Abstract base class for all poedb.tw scrapers.

    Subclasses must implement :meth:`scrape_page` which defines how a
    single page is parsed, and :meth:`get_page_paths` which returns the
    list of relative paths to scrape for a given game.

    The base class handles:
        - HTTP client lifecycle
        - Per-page fetching with logging
        - Batch orchestration
        - Job status tracking
    """

    def __init__(
        self,
        http_client: HTTPClient | None = None,
        game: Game = Game.POE2,
        parser: str = "lxml",
    ) -> None:
        """
        Initialise the base scraper.

        Args:
            http_client: An :class:`HTTPClient` instance.  If ``None`` a
                default one is created.
            game: Which game to scrape.
            parser: BeautifulSoup parser backend (default ``lxml``).
        """
        self.http_client = http_client or HTTPClient()
        self.game = game
        self.parser = parser
        self._owns_client = http_client is None
        self._logger = logging.getLogger(self.__class__.__name__)

    # ------------------------------------------------------------------
    # Abstract methods -- subclasses MUST override
    # ------------------------------------------------------------------

    @abstractmethod
    async def scrape_page(self, url: str, soup: BeautifulSoup) -> dict[str, Any]:
        """
        Parse a single page and return structured data.

        Args:
            url: Absolute URL of the page.
            soup: Pre-parsed BeautifulSoup tree.

        Returns:
            A dict of structured data extracted from the page.

        Raises:
            ScraperParsingError: If the page cannot be parsed.
        """

    @abstractmethod
    def get_page_paths(self) -> list[str]:
        """
        Return a list of relative URL paths to scrape.

        For example: ``["/us/Unique_Weapons", "/us/Unique_Armour"]``.

        Returns:
            List of path strings.
        """

    # ------------------------------------------------------------------
    # Concrete helper methods
    # ------------------------------------------------------------------

    def _parse_html(self, html: str, url: str) -> BeautifulSoup:
        """
        Parse raw HTML into a BeautifulSoup object.

        Args:
            html: Raw HTML string.
            url: Source URL (used in error messages).

        Returns:
            A BeautifulSoup instance.

        Raises:
            ScraperParsingError: If parsing fails.
        """
        try:
            return BeautifulSoup(html, self.parser)
        except Exception as exc:
            raise ScraperParsingError(
                f"Failed to parse HTML from {url}: {exc}",
                url=url,
            )

    async def fetch_page(self, path: str) -> ScrapeResult:
        """
        Fetch a single page and return a :class:`ScrapeResult`.

        This method:
            1. GETs the page via the HTTP client
            2. Parses the HTML with BeautifulSoup
            3. Delegates to :meth:`scrape_page` for domain-specific extraction

        Args:
            path: Relative URL path.

        Returns:
            A :class:`ScrapeResult` with ``soup`` populated on success.
        """
        url = f"{self.http_client.base_url}{path}"
        start = time.monotonic()

        try:
            self._logger.info("Fetching page: %s", url)
            html = await self.http_client.get(path)
            soup = self._parse_html(html, url)

            # Let the subclass extract structured data
            data = await self.scrape_page(url, soup)

            elapsed = time.monotonic() - start
            self._logger.info(
                "Successfully scraped %s in %.2fs", url, elapsed
            )
            return ScrapeResult(
                url=url,
                html=html,
                soup=soup,
                success=True,
                elapsed_s=elapsed,
                metadata={"extracted_data": data},
            )
        except ScraperError as exc:
            elapsed = time.monotonic() - start
            self._logger.error("Scraper error on %s: %s", url, exc)
            return ScrapeResult(
                url=url,
                success=False,
                error=str(exc),
                elapsed_s=elapsed,
            )
        except Exception as exc:
            elapsed = time.monotonic() - start
            self._logger.error("Unexpected error scraping %s: %s", url, exc)
            return ScrapeResult(
                url=url,
                success=False,
                error=f"Unexpected error: {exc}",
                elapsed_s=elapsed,
            )

    async def scrape_all(self) -> ScrapeBatchResult:
        """
        Scrape all pages returned by :meth:`get_page_paths`.

        Returns:
            A :class:`ScrapeBatchResult` summarising the batch.
        """
        batch = ScrapeBatchResult()
        paths = self.get_page_paths()

        self._logger.info(
            "Starting scrape batch: %d pages for game=%s",
            len(paths),
            self.game.value,
        )

        for path in paths:
            result = await self.fetch_page(path)
            batch.add(result)

        self._logger.info(
            "Scrape batch complete: %d/%d succeeded in %.2fs",
            batch.succeeded,
            batch.total,
            batch.total_elapsed_s,
        )
        return batch

    def create_job(self, job_id: str | None = None) -> ScrapeJob:
        """
        Create a :class:`ScrapeJob` tracker for this scraper.

        Args:
            job_id: Optional explicit job ID.  Auto-generated if ``None``.

        Returns:
            A new :class:`ScrapeJob` instance.
        """
        import uuid

        return ScrapeJob(
            job_id=job_id or f"scrape-{self.game.value}-{uuid.uuid4().hex[:8]}",
            status=ScrapeStatus.PENDING,
            game=self.game,
            message=f"Job created for {self.__class__.__name__}",
        )


# ------------------------------------------------------------------
# Simple synchronous wrapper for quick testing
# ------------------------------------------------------------------


class SimpleScraper:
    """
    Lightweight synchronous wrapper around :class:`HTTPClient` and
    BeautifulSoup for quick one-off page fetches.

    This is **not** intended for production batch scraping -- use
    :class:`BaseScraper` subclasses instead.

    Usage::

        scraper = SimpleScraper()
        result = scraper.fetch("/us/Unique_Weapons")
        print(result.soup.title)
    """

    def __init__(
        self,
        base_url: str | None = None,
        timeout: float = 30.0,
    ) -> None:
        self.base_url = base_url or "https://poedb.tw"
        self.timeout = timeout
        self._logger = logging.getLogger(self.__class__.__name__)

    def fetch(self, path: str) -> ScrapeResult:
        """
        Synchronously fetch and parse a page.

        Args:
            path: Relative URL path.

        Returns:
            A :class:`ScrapeResult`.
        """
        import requests as sync_requests

        url = f"{self.base_url}{path}"
        start = time.monotonic()

        try:
            self._logger.info("Fetching (sync): %s", url)
            settings = get_settings()
            response = sync_requests.get(
                url,
                timeout=self.timeout,
                headers={"User-Agent": settings.scraper.user_agent},
            )
            elapsed = time.monotonic() - start

            if response.status_code >= 400:
                return ScrapeResult(
                    url=url,
                    success=False,
                    error=f"HTTP {response.status_code}",
                    elapsed_s=elapsed,
                )

            soup = BeautifulSoup(response.text, "lxml")
            return ScrapeResult(
                url=url,
                html=response.text,
                soup=soup,
                success=True,
                elapsed_s=elapsed,
            )
        except Exception as exc:
            elapsed = time.monotonic() - start
            self._logger.error("Failed to fetch %s: %s", url, exc)
            return ScrapeResult(
                url=url,
                success=False,
                error=str(exc),
                elapsed_s=elapsed,
            )


__all__ = [
    "ScrapeResult",
    "ScrapeBatchResult",
    "BaseScraper",
    "SimpleScraper",
]
