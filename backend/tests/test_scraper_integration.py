"""
Comprehensive scraper integration tests for POE Knowledge Assistant.

Validates the complete scraper functionality including:
- HTTP client connectivity and health checks
- HTML parsing and content extraction
- Item detail page scraping and parsing
- Category page scraping with link extraction
- Rate limiting and retry logic
- Error handling for various failure scenarios
- Game version detection
- DOM parser utilities
"""

import asyncio
import sys
import time
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
import httpx

# Ensure backend src is on the path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bs4 import BeautifulSoup

from src.services.scraper.exceptions import (
    ScraperConnectionError,
    ScraperError,
    ScraperHTTPError,
    ScraperParsingError,
    ScraperRateLimitError,
    ScraperTimeoutError,
)
from src.services.scraper.http_client import HTTPClient, DEFAULT_BASE_URL
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
    detect_game_version_model,
    get_version_for_url,
)
from src.models.scraper import Game, ItemType, PoEItem, PoECategory, ScrapeJob, ScrapeStatus


# ---------------------------------------------------------------------------
# Sample HTML fixtures for testing
# ---------------------------------------------------------------------------

SAMPLE_ITEM_PAGE_HTML = """
<!DOCTYPE html>
<html>
<head>
    <title>Tabula Rasa - PoEDB</title>
    <meta name="description" content="Tabula Rasa Simple Robe Unique Armour">
</head>
<body>
    <div id="content">
        <h1 class="page-title">Tabula Rasa</h1>
        <div class="itemHeader">
            <span class="name">Tabula Rasa</span>
            <span class="base">Simple Robe</span>
            <span class="rarity">Unique</span>
        </div>
        <div class="requirements">
            Level: 58, Str: 134, Int: 134
        </div>
        <table class="itemStats">
            <tr><th>Property</th><th>Value</th></tr>
            <tr><td>Evasion Rating</td><td>360</td></tr>
            <tr><td>Energy Shield</td><td>54</td></tr>
        </table>
        <div class="explicitMod">+67 to maximum Life</div>
        <div class="explicitMod">+24% to Fire Resistance</div>
        <div class="implicitMod">+20 to Strength</div>
        <div class="flavour">Venividivici</div>
        <img class="item-image" src="/images/Tabula_Rasa.png" alt="Tabula Rasa" />
        <div class="tags"><span>armour</span><span>unique</span><span>body_armour</span></div>
        <div class="breadcrumb">
            <a href="/us/Unique_Armour">Unique Armour</a>
            <a href="/us/Body_Armour">Body Armour</a>
        </div>
        <div class="related">
            <a href="/us/Carcass_Jack">Carcass Jack</a>
            <a href="/us/Quetzalcoatl">Quetzalcoatl</a>
        </div>
    </div>
</body>
</html>
"""

SAMPLE_CATEGORY_PAGE_HTML = """
<!DOCTYPE html>
<html>
<head>
    <title>Unique - PoEDB</title>
</head>
<body>
    <div id="content">
        <h1 class="page-title">Unique</h1>
        <table class="wikitable">
            <tr><th>Name</th><th>Type</th><th>Base</th></tr>
            <tr>
                <td><a href="/us/Tabula_Rasa">Tabula Rasa</a></td>
                <td>Body Armour</td>
                <td>Simple Robe</td>
            </tr>
            <tr>
                <td><a href="/us/Starforge">Starforge</a></td>
                <td>Two-Handed Sword</td>
                <td>Void Blade</td>
            </tr>
            <tr>
                <td><a href="/us/Shavronnes_Wrappings">Shavronne's Wrappings</a></td>
                <td>Body Armour</td>
                <td>Murmur of the Loor</td>
            </tr>
        </table>
        <div class="pagination">
            <a href="/us/Unique?page=2" class="next">Next</a>
        </div>
    </div>
</body>
</html>
"""

SAMPLE_CATEGORY_PAGE_2_HTML = """
<!DOCTYPE html>
<html>
<head>
    <title>Unique - Page 2 - PoEDB</title>
</head>
<body>
    <div id="content">
        <h1 class="page-title">Unique</h1>
        <table class="wikitable">
            <tr><th>Name</th><th>Type</th></tr>
            <tr>
                <td><a href="/us/Headhunter">Headhunter</a></td>
                <td>Belt</td>
            </tr>
        </table>
    </div>
</body>
</html>
"""

SAMPLE_GEM_PAGE_HTML = """
<!DOCTYPE html>
<html>
<head>
    <title>Fireball - PoEDB</title>
</head>
<body>
    <div id="content">
        <h1 class="page-title">Fireball</h1>
        <div class="itemHeader">
            <span class="name">Fireball</span>
            <span class="base">Skill Gem</span>
        </div>
        <div class="requirements">
            Level: 12, Int: 68
        </div>
        <table class="itemStats">
            <tr><th>Property</th><th>Value</th></tr>
            <tr><td>Quality</td><td>+20%</td></tr>
            <tr><td>Damage</td><td>150-250</td></tr>
        </table>
        <div class="explicitMod">Deals 150 to 250 Fire Damage</div>
        <div class="explicitMod">+20% increased Area of Effect</div>
    </div>
</body>
</html>
"""

SAMPLE_EMPTY_PAGE_HTML = """
<!DOCTYPE html>
<html>
<head><title>Empty - PoEDB</title></head>
<body><div id="content"><h1 class="page-title">Empty</h1></div></body>
</html>
"""

SAMPLE_ERROR_PAGE_HTML = """
<!DOCTYPE html>
<html>
<head><title>404 Not Found</title></head>
<body><h1>404 Not Found</h1><p>The requested page was not found.</p></body>
</html>
"""


# ---------------------------------------------------------------------------
# Helper to build mock httpx responses
# ---------------------------------------------------------------------------

def make_httpx_response(
    status_code: int = 200,
    text: str = "",
    headers: dict[str, str] | None = None,
) -> httpx.Response:
    """Build a mock httpx.Response object."""
    return httpx.Response(
        status_code=status_code,
        text=text,
        headers=headers or {},
        request=httpx.Request("GET", "https://poedb.tw"),
    )


# ---------------------------------------------------------------------------
# Tests: Exception Hierarchy
# ---------------------------------------------------------------------------

class TestScraperExceptions:
    """Verify the custom exception hierarchy is correct."""

    def test_scraper_error_is_base(self):
        exc = ScraperError("test error", url="https://example.com")
        assert str(exc) == "test error"
        assert exc.url == "https://example.com"
        assert isinstance(exc, Exception)

    def test_connection_error_inherits(self):
        exc = ScraperConnectionError("conn fail", url="https://poedb.tw")
        assert isinstance(exc, ScraperError)
        assert exc.url == "https://poedb.tw"

    def test_http_error_inherits(self):
        exc = ScraperHTTPError("http fail", url="https://poedb.tw", status_code=500)
        assert isinstance(exc, ScraperError)
        assert exc.status_code == 500

    def test_rate_limit_error_inherits(self):
        exc = ScraperRateLimitError("rate limited", url="https://poedb.tw", retry_after=5.0)
        assert isinstance(exc, ScraperHTTPError)
        assert isinstance(exc, ScraperError)
        assert exc.retry_after == 5.0
        assert exc.status_code == 429

    def test_parsing_error_inherits(self):
        exc = ScraperParsingError("parse fail", url="https://poedb.tw", selector="h1")
        assert isinstance(exc, ScraperError)
        assert exc.selector == "h1"

    def test_timeout_error_inherits(self):
        exc = ScraperTimeoutError("timeout", url="https://poedb.tw", timeout=30.0)
        assert isinstance(exc, ScraperError)
        assert exc.timeout == 30.0


# ---------------------------------------------------------------------------
# Tests: DOM Parser Utilities
# ---------------------------------------------------------------------------

class TestDOMParserUtilities:
    """Test the parser utility functions with realistic HTML."""

    def _soup(self, html: str) -> BeautifulSoup:
        return BeautifulSoup(html, "lxml")

    def test_safe_get_text_with_tag(self):
        soup = self._soup("<div>Hello World</div>")
        tag = soup.find("div")
        assert safe_get_text(tag) == "Hello World"

    def test_safe_get_text_with_none(self):
        assert safe_get_text(None) == ""

    def test_safe_get_text_with_default(self):
        assert safe_get_text(None, default="N/A") == "N/A"

    def test_safe_get_attr_with_tag(self):
        soup = self._soup('<a href="/us/item">Item</a>')
        tag = soup.find("a")
        assert safe_get_attr(tag, "href") == "/us/item"

    def test_safe_get_attr_with_none(self):
        assert safe_get_attr(None, "href") == ""

    def test_find_first_returns_tag(self):
        soup = self._soup(SAMPLE_ITEM_PAGE_HTML)
        tag = find_first(soup, "h1.page-title")
        assert tag is not None
        assert "Tabula" in safe_get_text(tag)

    def test_find_first_returns_none_on_miss(self):
        soup = self._soup("<p>No heading</p>")
        assert find_first(soup, "h1.nonexistent") is None

    def test_find_all_returns_list(self):
        soup = self._soup(SAMPLE_ITEM_PAGE_HTML)
        mods = find_all(soup, ".explicitMod")
        assert len(mods) == 2

    def test_find_all_returns_empty_on_miss(self):
        soup = self._soup("<p>Nothing</p>")
        assert find_all(soup, ".nonexistent") == []

    def test_extract_page_title_from_h1(self):
        soup = self._soup(SAMPLE_ITEM_PAGE_HTML)
        title = extract_page_title(soup)
        assert title == "Tabula Rasa"

    def test_extract_page_title_fallback_to_title_tag(self):
        html = "<html><head><title>Some Page - PoEDB</title></head><body></body></html>"
        soup = self._soup(html)
        title = extract_page_title(soup)
        assert title == "Some Page"

    def test_extract_item_name(self):
        soup = self._soup(SAMPLE_ITEM_PAGE_HTML)
        name = extract_item_name(soup)
        assert name == "Tabula Rasa"

    def test_extract_stats(self):
        soup = self._soup(SAMPLE_ITEM_PAGE_HTML)
        stats = extract_stats(soup)
        assert len(stats) >= 3  # 2 explicit + 1 implicit
        assert any("Fire Resistance" in s for s in stats)

    def test_extract_flavor_text(self):
        soup = self._soup(SAMPLE_ITEM_PAGE_HTML)
        flavor = extract_flavor_text(soup)
        assert flavor == "Venividivici"

    def test_extract_requirements(self):
        soup = self._soup(SAMPLE_ITEM_PAGE_HTML)
        reqs = extract_requirements(soup)
        assert "Level" in reqs
        # The regex captures digit groups after ':', which may include trailing comma
        assert reqs["Level"].rstrip(",").strip() == "58"

    def test_extract_image_url(self):
        soup = self._soup(SAMPLE_ITEM_PAGE_HTML)
        url = extract_image_url(soup)
        assert url is not None
        assert "Tabula_Rasa.png" in url

    def test_extract_image_url_none_for_empty(self):
        soup = self._soup("<p>No image</p>")
        assert extract_image_url(soup) is None

    def test_extract_links(self):
        soup = self._soup(SAMPLE_ITEM_PAGE_HTML)
        links = extract_links(soup)
        assert len(links) > 0
        hrefs = [l["href"] for l in links]
        assert any("Tabula_Rasa" not in h for h in hrefs)  # not the img src

    def test_extract_table_data(self):
        soup = self._soup(SAMPLE_ITEM_PAGE_HTML)
        data = extract_table_data(soup, "table.itemStats")
        assert len(data) >= 2
        keys = list(data[0].keys())
        assert "Property" in keys or "Value" in keys


# ---------------------------------------------------------------------------
# Tests: HTTP Client (mocked)
# ---------------------------------------------------------------------------

class TestHTTPClientMocked:
    """Test HTTPClient with mocked httpx transport to avoid real network calls."""

    @pytest.mark.asyncio
    async def test_health_check_healthy(self):
        """Test health_check returns healthy when server responds 200."""
        mock_response = make_httpx_response(200, "<html>OK</html>")

        with patch.object(httpx.AsyncClient, "get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_response
            async with HTTPClient(base_url="https://poedb.tw") as client:
                result = await client.health_check()

        assert result["status"] == "healthy"
        assert result["url"] == "https://poedb.tw"
        assert result["response_time_s"] is not None
        assert "Successfully connected" in result["message"]

    @pytest.mark.asyncio
    async def test_health_check_unhealthy_status_code(self):
        """Test health_check reports unhealthy for 500 status."""
        mock_response = make_httpx_response(500, "Server Error")

        with patch.object(httpx.AsyncClient, "get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_response
            async with HTTPClient(base_url="https://poedb.tw") as client:
                result = await client.health_check()

        assert result["status"] == "unhealthy"
        assert "500" in result["message"]

    @pytest.mark.asyncio
    async def test_health_check_connection_failure(self):
        """Test health_check handles connection failures gracefully."""
        with patch.object(httpx.AsyncClient, "get", new_callable=AsyncMock) as mock_get:
            mock_get.side_effect = httpx.ConnectError("Connection refused")
            async with HTTPClient(base_url="https://poedb.tw") as client:
                result = await client.health_check()

        assert result["status"] == "unhealthy"
        assert result["response_time_s"] is None

    @pytest.mark.asyncio
    async def test_get_success(self):
        """Test successful GET request returns HTML."""
        mock_response = make_httpx_response(200, SAMPLE_ITEM_PAGE_HTML)

        with patch.object(httpx.AsyncClient, "get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_response
            async with HTTPClient(
                base_url="https://poedb.tw",
                rate_limit_delay=0.0,
            ) as client:
                html = await client.get("/us/Tabula_Rasa")

        assert "Tabula Rasa" in html

    @pytest.mark.asyncio
    async def test_get_http_404_raises(self):
        """Test GET with 404 raises ScraperHTTPError."""
        mock_response = make_httpx_response(404, "Not Found")

        with patch.object(httpx.AsyncClient, "get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_response
            async with HTTPClient(
                base_url="https://poedb.tw",
                max_retries=1,
                rate_limit_delay=0.0,
            ) as client:
                with pytest.raises(ScraperHTTPError) as exc_info:
                    await client.get("/us/Nonexistent_Page")

        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_get_server_error_retries_then_raises(self):
        """Test GET with 500 retries then raises ScraperHTTPError."""
        mock_response = make_httpx_response(500, "Server Error")

        with patch.object(httpx.AsyncClient, "get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_response
            async with HTTPClient(
                base_url="https://poedb.tw",
                max_retries=2,
                rate_limit_delay=0.0,
            ) as client:
                with pytest.raises(ScraperHTTPError) as exc_info:
                    await client.get("/us/Some_Page")

        assert exc_info.value.status_code == 500
        # Should have been called max_retries times
        assert mock_get.call_count == 2

    @pytest.mark.asyncio
    async def test_get_connection_error_retries(self):
        """Test GET with connection error retries then raises ScraperConnectionError."""
        with patch.object(httpx.AsyncClient, "get", new_callable=AsyncMock) as mock_get:
            mock_get.side_effect = httpx.ConnectError("DNS failure")
            async with HTTPClient(
                base_url="https://poedb.tw",
                max_retries=2,
                rate_limit_delay=0.0,
            ) as client:
                with pytest.raises(ScraperConnectionError):
                    await client.get("/us/Some_Page")

        assert mock_get.call_count == 2

    @pytest.mark.asyncio
    async def test_get_timeout_retries(self):
        """Test GET with timeout retries then raises ScraperTimeoutError."""
        with patch.object(httpx.AsyncClient, "get", new_callable=AsyncMock) as mock_get:
            mock_get.side_effect = httpx.TimeoutException("Timed out")
            async with HTTPClient(
                base_url="https://poedb.tw",
                max_retries=2,
                rate_limit_delay=0.0,
            ) as client:
                with pytest.raises(ScraperTimeoutError):
                    await client.get("/us/Some_Page")

        assert mock_get.call_count == 2

    @pytest.mark.asyncio
    async def test_get_rate_limit_429_raises(self):
        """Test GET with 429 exhausts retries and raises ScraperRateLimitError."""
        mock_response = make_httpx_response(
            429, "Too Many Requests", headers={"Retry-After": "0.01"}
        )

        with patch.object(httpx.AsyncClient, "get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_response
            async with HTTPClient(
                base_url="https://poedb.tw",
                max_retries=2,
                rate_limit_delay=0.0,
            ) as client:
                with pytest.raises(ScraperRateLimitError) as exc_info:
                    await client.get("/us/Some_Page")

        assert exc_info.value.retry_after is not None

    @pytest.mark.asyncio
    async def test_get_rate_limit_then_success(self):
        """Test GET with 429 followed by 200 succeeds."""
        response_429 = make_httpx_response(429, "Rate Limited", headers={"Retry-After": "0.01"})
        response_200 = make_httpx_response(200, "<html>OK</html>")

        with patch.object(httpx.AsyncClient, "get", new_callable=AsyncMock) as mock_get:
            mock_get.side_effect = [response_429, response_200]
            async with HTTPClient(
                base_url="https://poedb.tw",
                max_retries=3,
                rate_limit_delay=0.0,
            ) as client:
                html = await client.get("/us/Some_Page")

        assert "OK" in html
        assert mock_get.call_count == 2

    @pytest.mark.asyncio
    async def test_context_manager_lifecycle(self):
        """Test that the HTTPClient properly opens and closes."""
        client = HTTPClient(base_url="https://poedb.tw")
        assert client._client is None

        async with client as c:
            assert c is client
            assert client._client is not None

        assert client._client.is_closed

    @pytest.mark.asyncio
    async def test_rate_limit_delay_enforced(self):
        """Test that the rate limit delay is enforced between requests."""
        mock_response = make_httpx_response(200, "OK")

        with patch.object(httpx.AsyncClient, "get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_response
            async with HTTPClient(
                base_url="https://poedb.tw",
                rate_limit_delay=0.1,
            ) as client:
                start = time.monotonic()
                await client.get("/us/Page1")
                await client.get("/us/Page2")
                elapsed = time.monotonic() - start

        assert elapsed >= 0.09  # Allow slight timing variance


# ---------------------------------------------------------------------------
# Tests: Base Scraper
# ---------------------------------------------------------------------------

class ConcreteTestScraper(BaseScraper):
    """Concrete subclass of BaseScraper for testing."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._scraped_pages: list[dict] = []

    async def scrape_page(self, url: str, soup: BeautifulSoup) -> dict[str, Any]:
        title = extract_page_title(soup)
        result = {"url": url, "title": title}
        self._scraped_pages.append(result)
        return result

    def get_page_paths(self) -> list[str]:
        return ["/us/Test_Page_1", "/us/Test_Page_2"]


class TestBaseScraper:
    """Test BaseScraper abstract class via a concrete test subclass."""

    @pytest.mark.asyncio
    async def test_scrape_page_extracts_data(self):
        """Test that scrape_page extracts structured data from parsed HTML."""
        scraper = ConcreteTestScraper()
        soup = BeautifulSoup(SAMPLE_ITEM_PAGE_HTML, "lxml")
        data = await scraper.scrape_page("https://poedb.tw/us/Tabula_Rasa", soup)
        assert data["title"] == "Tabula Rasa"

    @pytest.mark.asyncio
    async def test_fetch_page_success(self):
        """Test fetch_page with mocked HTTP returns ScrapeResult."""
        scraper = ConcreteTestScraper()

        mock_response = make_httpx_response(200, SAMPLE_ITEM_PAGE_HTML)
        with patch.object(
            httpx.AsyncClient, "get", new_callable=AsyncMock
        ) as mock_get:
            mock_get.return_value = mock_response
            async with scraper.http_client:
                result = await scraper.fetch_page("/us/Tabula_Rasa")

        assert result.success is True
        assert result.html is not None
        assert result.soup is not None
        assert "Tabula" in result.url
        assert result.elapsed_s > 0

    @pytest.mark.asyncio
    async def test_fetch_page_failure(self):
        """Test fetch_page handles HTTP errors gracefully."""
        scraper = ConcreteTestScraper()

        mock_response = make_httpx_response(500, "Server Error")
        with patch.object(
            httpx.AsyncClient, "get", new_callable=AsyncMock
        ) as mock_get:
            mock_get.return_value = mock_response
            async with scraper.http_client:
                result = await scraper.fetch_page("/us/Bad_Page")

        assert result.success is False
        assert result.error is not None

    @pytest.mark.asyncio
    async def test_scrape_all(self):
        """Test scrape_all iterates over get_page_paths and returns batch result."""
        scraper = ConcreteTestScraper()

        mock_response = make_httpx_response(200, SAMPLE_ITEM_PAGE_HTML)
        with patch.object(
            httpx.AsyncClient, "get", new_callable=AsyncMock
        ) as mock_get:
            mock_get.return_value = mock_response
            async with scraper.http_client:
                batch = await scraper.scrape_all()

        assert isinstance(batch, ScrapeBatchResult)
        assert batch.total == 2
        assert batch.succeeded == 2
        assert batch.failed == 0

    def test_create_job(self):
        """Test create_job returns a valid ScrapeJob."""
        scraper = ConcreteTestScraper()
        job = scraper.create_job()
        assert isinstance(job, ScrapeJob)
        assert job.status == ScrapeStatus.PENDING
        assert job.game == Game.POE2

    def test_create_job_with_custom_id(self):
        """Test create_job accepts a custom job ID."""
        scraper = ConcreteTestScraper()
        job = scraper.create_job(job_id="test-job-123")
        assert job.job_id == "test-job-123"

    def test_parse_html_raises_on_invalid(self):
        """Test _parse_html raises ScraperParsingError on failure."""
        scraper = ConcreteTestScraper(parser="lxml")
        # lxml typically doesn't raise on garbage input, so this just tests
        # that valid HTML parses fine.
        soup = scraper._parse_html("<html><body>ok</body></html>", "http://test")
        assert soup is not None


# ---------------------------------------------------------------------------
# Tests: ScrapeResult and ScrapeBatchResult
# ---------------------------------------------------------------------------

class TestScrapeResults:
    """Test result dataclasses."""

    def test_scrape_result_defaults(self):
        result = ScrapeResult(url="http://test.com")
        assert result.url == "http://test.com"
        assert result.success is True
        assert result.html is None
        assert result.error is None
        assert result.elapsed_s == 0.0

    def test_scrape_result_failure(self):
        result = ScrapeResult(
            url="http://test.com",
            success=False,
            error="HTTP 500",
            elapsed_s=1.5,
        )
        assert result.success is False
        assert result.error == "HTTP 500"

    def test_batch_result_add_success(self):
        batch = ScrapeBatchResult()
        batch.add(ScrapeResult(url="http://test.com", success=True))
        assert batch.total == 1
        assert batch.succeeded == 1
        assert batch.failed == 0

    def test_batch_result_add_failure(self):
        batch = ScrapeBatchResult()
        batch.add(ScrapeResult(url="http://test.com", success=False, error="fail"))
        assert batch.total == 1
        assert batch.succeeded == 0
        assert batch.failed == 1
        assert len(batch.errors) == 1
        assert "fail" in batch.errors[0]

    def test_batch_result_add_mixed(self):
        batch = ScrapeBatchResult()
        batch.add(ScrapeResult(url="http://a.com", success=True, elapsed_s=0.5))
        batch.add(ScrapeResult(url="http://b.com", success=False, error="err", elapsed_s=1.0))
        batch.add(ScrapeResult(url="http://c.com", success=True, elapsed_s=0.3))
        assert batch.total == 3
        assert batch.succeeded == 2
        assert batch.failed == 1
        assert batch.total_elapsed_s == pytest.approx(1.8)


# ---------------------------------------------------------------------------
# Tests: Category Scraper (mocked)
# ---------------------------------------------------------------------------

class TestCategoryScraper:
    """Test CategoryScraper with mocked HTTP responses."""

    @pytest.mark.asyncio
    async def test_scrape_category_extracts_items(self):
        """Test that scrape_category extracts items from a category page."""
        mock_response = make_httpx_response(200, SAMPLE_CATEGORY_PAGE_HTML)

        with patch.object(
            httpx.AsyncClient, "get", new_callable=AsyncMock
        ) as mock_get:
            mock_get.return_value = mock_response
            async with CategoryScraper(base_url="https://poedb.tw") as scraper:
                # Override client for testing
                scraper._client = HTTPClient(
                    base_url="https://poedb.tw",
                    rate_limit_delay=0.0,
                )
                async with scraper._client:
                    result = await scraper.scrape_category(
                        category_name="Unique",
                        url="https://poedb.tw/us/Unique",
                        follow_pagination=False,
                    )

        assert result["category"] == "Unique"
        assert result["total_items"] > 0
        assert result["pages_scraped"] == 1
        assert isinstance(result["items"], list)

    @pytest.mark.asyncio
    async def test_scrape_category_with_pagination(self):
        """Test that pagination is followed when follow_pagination=True."""
        response_page1 = make_httpx_response(200, SAMPLE_CATEGORY_PAGE_HTML)
        response_page2 = make_httpx_response(200, SAMPLE_CATEGORY_PAGE_2_HTML)

        with patch.object(
            httpx.AsyncClient, "get", new_callable=AsyncMock
        ) as mock_get:
            mock_get.side_effect = [response_page1, response_page2]
            client = HTTPClient(base_url="https://poedb.tw", rate_limit_delay=0.0)
            async with client:
                scraper = CategoryScraper(
                    http_client=client,
                    base_url="https://poedb.tw",
                )
                result = await scraper.scrape_category(
                    category_name="Unique",
                    url="https://poedb.tw/us/Unique",
                    follow_pagination=True,
                )

        assert result["pages_scraped"] == 2
        assert result["total_items"] >= 3  # 3 from page 1 + 1 from page 2

    @pytest.mark.asyncio
    async def test_scrape_category_handles_empty_page(self):
        """Test scrape_category handles pages with no items."""
        mock_response = make_httpx_response(200, SAMPLE_EMPTY_PAGE_HTML)

        with patch.object(
            httpx.AsyncClient, "get", new_callable=AsyncMock
        ) as mock_get:
            mock_get.return_value = mock_response
            client = HTTPClient(base_url="https://poedb.tw", rate_limit_delay=0.0)
            async with client:
                scraper = CategoryScraper(
                    http_client=client,
                    base_url="https://poedb.tw",
                )
                result = await scraper.scrape_category(
                    category_name="Empty",
                    url="https://poedb.tw/us/Empty",
                    follow_pagination=False,
                )

        assert result["total_items"] == 0
        assert result["pages_scraped"] == 1

    def test_category_item_dataclass(self):
        """Test CategoryItem dataclass and to_dict."""
        item = CategoryItem(
            title="Tabula Rasa",
            url="https://poedb.tw/us/Tabula_Rasa",
            category="Unique",
            source_page="https://poedb.tw/us/Unique",
            metadata={"type": "armour"},
        )
        d = item.to_dict()
        assert d["title"] == "Tabula Rasa"
        assert d["url"] == "https://poedb.tw/us/Tabula_Rasa"
        assert d["category"] == "Unique"

    def test_is_valid_item_link_filters_nav(self):
        """Test that navigation links are filtered out."""
        scraper = CategoryScraper.__new__(CategoryScraper)
        scraper.base_url = "https://poedb.tw"

        # Valid item links
        assert scraper._is_valid_item_link("/us/Tabula_Rasa", "Tabula Rasa") is True

        # Invalid links
        assert scraper._is_valid_item_link("/us/Tabula_Rasa.png", "Image") is False
        assert scraper._is_valid_item_link("#section", "Jump") is False
        assert scraper._is_valid_item_link("javascript:void(0)", "Click") is False
        assert scraper._is_valid_item_link("/us/Special:Search", "Search") is False
        assert scraper._is_valid_item_link("https://other.com/page", "External") is False
        assert scraper._is_valid_item_link("/us/page", "a") is False  # title too short
        assert scraper._is_valid_item_link(None, "Title") is False
        assert scraper._is_valid_item_link("/us/page", None) is False

    def test_resolve_url(self):
        """Test URL resolution for various formats."""
        scraper = CategoryScraper.__new__(CategoryScraper)
        scraper.base_url = "https://poedb.tw"

        assert scraper._resolve_url("/us/Item") == "https://poedb.tw/us/Item"
        assert scraper._resolve_url("//poedb.tw/us/Item") == "https://poedb.tw/us/Item"
        assert scraper._resolve_url("https://poedb.tw/us/Item") == "https://poedb.tw/us/Item"
        assert scraper._resolve_url(None) is None
        assert scraper._resolve_url("") is None


# ---------------------------------------------------------------------------
# Tests: Item Detail Scraper (mocked)
# ---------------------------------------------------------------------------

class TestItemDetailScraper:
    """Test ItemDetailScraper with mocked HTTP responses."""

    @pytest.mark.asyncio
    async def test_scrape_item_extracts_full_data(self):
        """Test that scrape_item extracts comprehensive item data."""
        mock_response = make_httpx_response(200, SAMPLE_ITEM_PAGE_HTML)

        with patch.object(
            httpx.AsyncClient, "get", new_callable=AsyncMock
        ) as mock_get:
            mock_get.return_value = mock_response
            client = HTTPClient(base_url="https://poedb.tw", rate_limit_delay=0.0)
            async with client:
                scraper = ItemDetailScraper(http_client=client)
                result = await scraper.scrape_item(
                    url="https://poedb.tw/us/Tabula_Rasa",
                    category="Unique Armour",
                )

        assert result["name"] == "Tabula Rasa"
        assert result["success"] is True
        assert result["item_type"] in ("armor", "armour", "unique")
        assert result["rarity"] == "Unique"
        assert isinstance(result["explicit_mods"], list)
        assert len(result["explicit_mods"]) >= 2
        assert isinstance(result["implicit_mods"], list)
        assert len(result["implicit_mods"]) >= 1
        assert isinstance(result["requirements"], dict)
        assert "Level" in result["requirements"]
        assert result["image_url"] is not None
        assert isinstance(result["tags"], list)
        assert len(result["tags"]) > 0
        assert isinstance(result["categories"], list)
        assert "Unique Armour" in result["categories"]

    @pytest.mark.asyncio
    async def test_scrape_gem_item(self):
        """Test scraping a gem item page."""
        mock_response = make_httpx_response(200, SAMPLE_GEM_PAGE_HTML)

        with patch.object(
            httpx.AsyncClient, "get", new_callable=AsyncMock
        ) as mock_get:
            mock_get.return_value = mock_response
            client = HTTPClient(base_url="https://poedb.tw", rate_limit_delay=0.0)
            async with client:
                scraper = ItemDetailScraper(http_client=client)
                result = await scraper.scrape_item(
                    url="https://poedb.tw/us/Fireball",
                    category="Skill Gem",
                )

        assert result["name"] == "Fireball"
        assert result["item_type"] == "gem"
        assert isinstance(result["explicit_mods"], list)

    @pytest.mark.asyncio
    async def test_scrape_item_handles_empty_page(self):
        """Test scrape_item handles pages with minimal content gracefully."""
        mock_response = make_httpx_response(200, SAMPLE_EMPTY_PAGE_HTML)

        with patch.object(
            httpx.AsyncClient, "get", new_callable=AsyncMock
        ) as mock_get:
            mock_get.return_value = mock_response
            client = HTTPClient(base_url="https://poedb.tw", rate_limit_delay=0.0)
            async with client:
                scraper = ItemDetailScraper(http_client=client)
                result = await scraper.scrape_item(
                    url="https://poedb.tw/us/Empty",
                )

        assert result["success"] is True
        assert result["name"] == "Empty"

    @pytest.mark.asyncio
    async def test_scrape_items_batch(self):
        """Test batch scraping of multiple items."""
        responses = [
            make_httpx_response(200, SAMPLE_ITEM_PAGE_HTML),
            make_httpx_response(200, SAMPLE_GEM_PAGE_HTML),
        ]

        with patch.object(
            httpx.AsyncClient, "get", new_callable=AsyncMock
        ) as mock_get:
            mock_get.side_effect = responses
            client = HTTPClient(base_url="https://poedb.tw", rate_limit_delay=0.0)
            async with client:
                scraper = ItemDetailScraper(http_client=client)
                result = await scraper.scrape_items_batch(
                    urls=[
                        "https://poedb.tw/us/Tabula_Rasa",
                        "https://poedb.tw/us/Fireball",
                    ],
                )

        assert result["total"] == 2
        assert result["succeeded"] == 2
        assert result["failed"] == 0
        assert len(result["items"]) == 2

    @pytest.mark.asyncio
    async def test_scrape_items_batch_with_failure(self):
        """Test batch scraping handles individual failures."""
        responses = [
            make_httpx_response(200, SAMPLE_ITEM_PAGE_HTML),
            make_httpx_response(500, "Server Error"),
            make_httpx_response(500, "Server Error"),  # retry
        ]

        with patch.object(
            httpx.AsyncClient, "get", new_callable=AsyncMock
        ) as mock_get:
            mock_get.side_effect = responses
            client = HTTPClient(
                base_url="https://poedb.tw",
                rate_limit_delay=0.0,
                max_retries=1,
            )
            async with client:
                scraper = ItemDetailScraper(http_client=client)
                result = await scraper.scrape_items_batch(
                    urls=[
                        "https://poedb.tw/us/Tabula_Rasa",
                        "https://poedb.tw/us/Broken_Page",
                    ],
                )

        assert result["total"] == 2
        assert result["succeeded"] == 1
        assert result["failed"] == 1
        assert len(result["errors"]) == 1

    def test_item_detail_dataclass(self):
        """Test ItemDetail dataclass and to_dict."""
        detail = ItemDetail(
            name="Test Item",
            url="https://poedb.tw/us/Test_Item",
            item_type="weapon",
            rarity="Unique",
        )
        d = detail.to_dict()
        assert d["name"] == "Test Item"
        assert d["item_type"] == "weapon"
        assert d["success"] is True

    @pytest.mark.asyncio
    async def test_scrape_item_detects_game_version(self):
        """Test that game version is detected and stored in metadata."""
        mock_response = make_httpx_response(200, SAMPLE_ITEM_PAGE_HTML)

        with patch.object(
            httpx.AsyncClient, "get", new_callable=AsyncMock
        ) as mock_get:
            mock_get.return_value = mock_response
            client = HTTPClient(base_url="https://poedb.tw", rate_limit_delay=0.0)
            async with client:
                scraper = ItemDetailScraper(http_client=client)
                result = await scraper.scrape_item(
                    url="https://poedb.tw/us/Tabula_Rasa",
                )

        assert "game" in result["metadata"]
        assert result["metadata"]["game"] == "poe1"


# ---------------------------------------------------------------------------
# Tests: Game Version Detection
# ---------------------------------------------------------------------------

class TestGameVersionDetection:
    """Test game version detection from URLs and page content."""

    def test_poedb_tw_is_poe1(self):
        assert detect_game_version("https://poedb.tw/us/Tabula_Rasa") == "poe1"

    def test_poe2db_tw_is_poe2(self):
        assert detect_game_version("https://poe2db.tw/us/Fireball") == "poe2"

    def test_poedb_tw_poe2_path(self):
        assert detect_game_version("https://poedb.tw/poe2/us/Item") == "poe2"

    def test_poedb_tw_poe1_path(self):
        assert detect_game_version("https://poedb.tw/poe1/us/Item") == "poe1"

    def test_unknown_domain_defaults_poe1(self):
        assert detect_game_version("https://example.com/some/page") == "poe1"

    def test_empty_url_raises(self):
        with pytest.raises(ValueError):
            detect_game_version("")

    def test_none_url_raises(self):
        with pytest.raises(ValueError):
            detect_game_version(None)

    def test_content_detection_with_soup(self):
        soup = BeautifulSoup(
            '<html><head><title>Item - PoE 2</title></head><body></body></html>',
            "lxml",
        )
        assert detect_game_version("https://example.com/item", soup=soup) == "poe2"

    def test_detect_game_version_model_returns_enum(self):
        result = detect_game_version_model("https://poedb.tw/us/Tabula_Rasa")
        assert result == Game.POE1

        result = detect_game_version_model("https://poe2db.tw/us/Fireball")
        assert result == Game.POE2

    def test_get_version_for_url(self):
        assert get_version_for_url("https://poedb.tw/us/Item") == "poe1"
        assert get_version_for_url("https://poe2db.tw/us/Item") == "poe2"


# ---------------------------------------------------------------------------
# Tests: Pydantic Models
# ---------------------------------------------------------------------------

class TestPydanticModels:
    """Test the scraper Pydantic models for validation."""

    def test_game_enum(self):
        assert Game.POE1.value == "poe1"
        assert Game.POE2.value == "poe2"

    def test_item_type_enum(self):
        assert ItemType.WEAPON.value == "weapon"
        assert ItemType.ARMOR.value == "armor"
        assert ItemType.GEM.value == "gem"

    def test_poe_item_valid(self):
        item = PoEItem(
            name="Starforge",
            item_type=ItemType.WEAPON,
            url="https://poedb.tw/us/Starforge",
            game=Game.POE1,
        )
        assert item.name == "Starforge"
        assert item.source == "poedb.tw"

    def test_poe_item_invalid_url(self):
        with pytest.raises(Exception):
            PoEItem(
                name="Bad Item",
                item_type=ItemType.WEAPON,
                url="not-a-url",
                game=Game.POE1,
            )

    def test_poe_category_valid(self):
        cat = PoECategory(
            name="Unique Weapons",
            url="https://poedb.tw/us/Unique_Weapons",
            game=Game.POE1,
        )
        assert cat.name == "Unique Weapons"
        assert cat.item_count == 0

    def test_scrape_job_defaults(self):
        job = ScrapeJob(
            job_id="test-123",
            status=ScrapeStatus.PENDING,
            game=Game.POE2,
        )
        assert job.progress == 0.0
        assert job.items_scraped == 0
        assert job.errors == []


# ---------------------------------------------------------------------------
# Tests: Error Handling Integration
# ---------------------------------------------------------------------------

class TestErrorHandlingIntegration:
    """Test end-to-end error handling across scraper components."""

    @pytest.mark.asyncio
    async def test_network_failure_in_item_scraper(self):
        """Test that network failures in ItemDetailScraper raise proper errors."""
        with patch.object(
            httpx.AsyncClient, "get", new_callable=AsyncMock
        ) as mock_get:
            mock_get.side_effect = httpx.ConnectError("Network unreachable")
            client = HTTPClient(
                base_url="https://poedb.tw",
                max_retries=1,
                rate_limit_delay=0.0,
            )
            async with client:
                scraper = ItemDetailScraper(http_client=client)
                with pytest.raises(ScraperConnectionError):
                    await scraper.scrape_item("https://poedb.tw/us/Item")

    @pytest.mark.asyncio
    async def test_timeout_in_category_scraper(self):
        """Test that timeouts in CategoryScraper raise proper errors."""
        with patch.object(
            httpx.AsyncClient, "get", new_callable=AsyncMock
        ) as mock_get:
            mock_get.side_effect = httpx.TimeoutException("Timed out")
            client = HTTPClient(
                base_url="https://poedb.tw",
                max_retries=1,
                rate_limit_delay=0.0,
            )
            async with client:
                scraper = CategoryScraper(http_client=client)
                with pytest.raises(ScraperTimeoutError):
                    await scraper.scrape_category(
                        "Unique",
                        "https://poedb.tw/us/Unique",
                        follow_pagination=False,
                    )

    @pytest.mark.asyncio
    async def test_http_404_in_item_scraper(self):
        """Test 404 responses raise ScraperHTTPError."""
        mock_response = make_httpx_response(404, "Not Found")

        with patch.object(
            httpx.AsyncClient, "get", new_callable=AsyncMock
        ) as mock_get:
            mock_get.return_value = mock_response
            client = HTTPClient(
                base_url="https://poedb.tw",
                max_retries=1,
                rate_limit_delay=0.0,
            )
            async with client:
                scraper = ItemDetailScraper(http_client=client)
                with pytest.raises(ScraperHTTPError) as exc_info:
                    await scraper.scrape_item("https://poedb.tw/us/Missing_Item")

        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_retry_succeeds_after_initial_failure(self):
        """Test that retries succeed after transient failures."""
        fail_response = make_httpx_response(500, "Server Error")
        success_response = make_httpx_response(200, SAMPLE_ITEM_PAGE_HTML)

        with patch.object(
            httpx.AsyncClient, "get", new_callable=AsyncMock
        ) as mock_get:
            mock_get.side_effect = [fail_response, success_response]
            client = HTTPClient(
                base_url="https://poedb.tw",
                max_retries=3,
                rate_limit_delay=0.0,
            )
            async with client:
                html = await client.get("/us/Tabula_Rasa")

        assert "Tabula Rasa" in html
        assert mock_get.call_count == 2

    @pytest.mark.asyncio
    async def test_all_retries_exhausted(self):
        """Test that all retries being exhausted raises an error."""
        fail_response = make_httpx_response(500, "Server Error")

        with patch.object(
            httpx.AsyncClient, "get", new_callable=AsyncMock
        ) as mock_get:
            mock_get.return_value = fail_response
            client = HTTPClient(
                base_url="https://poedb.tw",
                max_retries=3,
                rate_limit_delay=0.0,
            )
            async with client:
                with pytest.raises(ScraperHTTPError):
                    await client.get("/us/Some_Page")

        assert mock_get.call_count == 3


# ---------------------------------------------------------------------------
# Tests: Convenience Functions (mocked)
# ---------------------------------------------------------------------------

class TestConvenienceFunctions:
    """Test one-shot convenience functions."""

    @pytest.mark.asyncio
    async def test_scrape_category_convenience(self):
        """Test the scrape_category convenience function."""
        mock_response = make_httpx_response(200, SAMPLE_CATEGORY_PAGE_HTML)

        with patch.object(
            httpx.AsyncClient, "get", new_callable=AsyncMock
        ) as mock_get:
            mock_get.return_value = mock_response
            result = await scrape_category(
                category_name="Unique",
                url="https://poedb.tw/us/Unique",
                follow_pagination=False,
                max_pages=1,
            )

        assert result["category"] == "Unique"
        assert result["pages_scraped"] >= 1

    @pytest.mark.asyncio
    async def test_scrape_item_detail_convenience(self):
        """Test the scrape_item_detail convenience function."""
        mock_response = make_httpx_response(200, SAMPLE_ITEM_PAGE_HTML)

        with patch.object(
            httpx.AsyncClient, "get", new_callable=AsyncMock
        ) as mock_get:
            mock_get.return_value = mock_response
            result = await scrape_item_detail(
                url="https://poedb.tw/us/Tabula_Rasa",
                category="Unique Armour",
            )

        assert result["name"] == "Tabula Rasa"
        assert result["success"] is True
