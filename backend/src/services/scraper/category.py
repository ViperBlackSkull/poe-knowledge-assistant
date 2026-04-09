"""
Category page scraper for poedb.tw.

Scrapes category index pages (e.g. Unique, Gem, Passive_Skill) and extracts
all item/skill links along with metadata.  Supports pagination so that
large category listings spanning multiple pages are fully collected.

Usage::

    from src.services.scraper.category import CategoryScraper

    async with CategoryScraper() as scraper:
        result = await scraper.scrape_category(
            category_name="Unique",
            url="https://poedb.tw/us/Unique",
        )
        for item in result["items"]:
            print(item["title"], item["url"])
"""

import logging
import re
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup, Tag

from src.services.scraper.exceptions import ScraperError, ScraperParsingError
from src.services.scraper.http_client import DEFAULT_BASE_URL, HTTPClient
from src.services.scraper.parsers import (
    extract_page_title,
    find_all,
    find_first,
    safe_get_attr,
    safe_get_text,
)

logger = logging.getLogger(__name__)

# ------------------------------------------------------------------
# Constants
# ------------------------------------------------------------------

# Path prefixes on poedb.tw that indicate a valid item / skill detail page.
# Used to filter out navigation, images, and other non-item links.
_VALID_ITEM_PATH_PREFIXES: tuple[str, ...] = (
    "/us/",
    "/e/us/",
)

# File extensions and path segments to **exclude** from item links.
_EXCLUDE_EXTENSIONS: tuple[str, ...] = (
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".svg",
    ".css",
    ".js",
    ".ico",
    ".woff",
    ".woff2",
    ".ttf",
    ".eot",
)

_EXCLUDE_PATH_SEGMENTS: tuple[str, ...] = (
    "Special:",
    "File:",
    "Help:",
    "Template:",
    "Category:",
    "User:",
    "Talk:",
    "edit",
    "action=",
    "oldid=",
    "printable",
    "index.php",
    "/privacy",
    "/General_disclaimer",
    "/patreon",
    "/news",
    "/League#",
    "/Ruthless_mode",
    "/login",
    "/register",
    "/search",
)

# Known non-item link titles to filter out (navigation, footer, etc.)
_EXCLUDE_TITLES: frozenset[str] = frozenset({
    "GGG Tracker",
    "Concurrent Players",
    "Ruthless mode",
    "Privacy",
    "Disclaimers",
    "Patreon",
    "Login",
    "Register",
    "Search",
    "Recent changes",
    "Random page",
    "Related changes",
    "What links here",
    "Printable version",
    "Permanent link",
    "Page information",
})

# Maximum number of pagination pages to follow (safety limit).
_MAX_PAGINATION_PAGES = 50


# ------------------------------------------------------------------
# Dataclass for individual category link entries
# ------------------------------------------------------------------


@dataclass
class CategoryItem:
    """
    A single item/skill link extracted from a category page.

    Attributes:
        title: Display text of the link.
        url: Fully-qualified URL of the item page.
        category: Name of the category this link belongs to.
        source_page: URL of the page from which this link was extracted.
        metadata: Additional metadata (e.g. item sub-type, row index).
    """

    title: str
    url: str
    category: str
    source_page: str
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Return a plain dict representation."""
        return {
            "title": self.title,
            "url": self.url,
            "category": self.category,
            "source_page": self.source_page,
            "metadata": self.metadata,
        }


# ------------------------------------------------------------------
# CategoryScraper
# ------------------------------------------------------------------


class CategoryScraper:
    """
    Scraper for poedb.tw category index pages.

    A *category page* is any listing page that contains links to multiple
    items or skills (e.g. ``/us/Unique``, ``/us/Gem``, ``/us/Passive_Skill``).
    This scraper extracts every valid item/skill link, follows pagination,
    and returns structured data.

    Design notes:
        - Uses the shared :class:`HTTPClient` for rate-limited, retrying
          HTTP requests.
        - Does **not** inherit from :class:`BaseScraper` because category
          scraping has a fundamentally different interface (accepts
          arbitrary URLs rather than a fixed set of game paths).
        - Can be used as an async context manager for clean resource
          management.

    Usage::

        async with CategoryScraper() as scraper:
            result = await scraper.scrape_category("Unique", "https://poedb.tw/us/Unique")
    """

    def __init__(
        self,
        http_client: HTTPClient | None = None,
        base_url: str | None = None,
        max_pages: int = _MAX_PAGINATION_PAGES,
    ) -> None:
        """
        Initialise the category scraper.

        Args:
            http_client: Optional pre-configured :class:`HTTPClient`.
                If ``None`` a default one is created (and owned).
            base_url: Override for the poedb.tw base URL.
            max_pages: Safety cap on pagination depth.
        """
        self._client = http_client or HTTPClient()
        self._owns_client = http_client is None
        self.base_url = base_url or DEFAULT_BASE_URL
        self.max_pages = max_pages
        self._logger = logging.getLogger(self.__class__.__name__)

    # ------------------------------------------------------------------
    # Context manager
    # ------------------------------------------------------------------

    async def __aenter__(self) -> "CategoryScraper":
        if self._owns_client:
            await self._client.__aenter__()
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        if self._owns_client:
            await self._client.close()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def scrape_category(
        self,
        category_name: str,
        url: str,
        *,
        follow_pagination: bool = True,
    ) -> dict[str, Any]:
        """
        Scrape a category index page and extract all item/skill links.

        Args:
            category_name: Human-readable name of the category
                (e.g. ``"Unique"``, ``"Gem"``).
            url: Full URL of the category page.
            follow_pagination: If ``True``, follow pagination links
                to collect items from all pages.

        Returns:
            A dict with the following keys:

            - ``category``: The category name.
            - ``url``: The starting URL.
            - ``page_title``: Title of the first page.
            - ``items``: List of dicts, each with ``title``, ``url``,
              ``category``, ``source_page``, and ``metadata``.
            - ``total_items``: Total number of items extracted.
            - ``pages_scraped``: Number of pagination pages visited.
            - ``has_more_pages``: Whether more pagination pages exist
              (``True`` only when pagination was not fully followed).

        Raises:
            ScraperParsingError: If the page HTML cannot be parsed.
            ScraperError: On HTTP or network failures.
        """
        self._logger.info(
            "Scraping category '%s' from %s (follow_pagination=%s)",
            category_name,
            url,
            follow_pagination,
        )

        all_items: list[CategoryItem] = []
        page_title: str = ""
        pages_scraped: int = 0
        has_more_pages: bool = False

        current_url = url
        visited_urls: set[str] = set()

        while current_url and pages_scraped < self.max_pages:
            if current_url in visited_urls:
                self._logger.warning("Pagination loop detected at %s", current_url)
                break
            visited_urls.add(current_url)

            path = self._url_to_path(current_url)
            html = await self._client.get(path)
            soup = self._parse_html(html, current_url)

            if pages_scraped == 0:
                page_title = extract_page_title(soup)

            page_items = self._extract_category_links(soup, category_name, current_url)
            all_items.extend(page_items)
            pages_scraped += 1

            self._logger.info(
                "Page %d: extracted %d items from %s",
                pages_scraped,
                len(page_items),
                current_url,
            )

            if not follow_pagination:
                break

            next_url = self._find_next_page_url(soup, current_url)
            if next_url:
                current_url = next_url
            else:
                break

        # Check if there could be more pages beyond our limit
        if pages_scraped >= self.max_pages and current_url:
            has_more_pages = True

        # Deduplicate by URL while preserving order
        seen_urls: set[str] = set()
        unique_items: list[dict[str, Any]] = []
        for item in all_items:
            if item.url not in seen_urls:
                seen_urls.add(item.url)
                unique_items.append(item.to_dict())

        result: dict[str, Any] = {
            "category": category_name,
            "url": url,
            "page_title": page_title,
            "items": unique_items,
            "total_items": len(unique_items),
            "pages_scraped": pages_scraped,
            "has_more_pages": has_more_pages,
        }

        self._logger.info(
            "Category '%s' scrape complete: %d unique items across %d pages",
            category_name,
            len(unique_items),
            pages_scraped,
        )

        return result

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _url_to_path(self, url: str) -> str:
        """
        Convert a full URL to a relative path for the HTTPClient.

        Args:
            url: Full URL (e.g. ``https://poedb.tw/us/Unique``).

        Returns:
            Relative path (e.g. ``/us/Unique``).
        """
        parsed = urlparse(url)
        path = parsed.path
        if parsed.query:
            path = f"{path}?{parsed.query}"
        return path

    def _parse_html(self, html: str, url: str) -> BeautifulSoup:
        """Parse raw HTML, raising ScraperParsingError on failure."""
        try:
            return BeautifulSoup(html, "lxml")
        except Exception as exc:
            raise ScraperParsingError(
                f"Failed to parse HTML from {url}: {exc}",
                url=url,
            )

    def _extract_category_links(
        self,
        soup: BeautifulSoup,
        category_name: str,
        source_url: str,
    ) -> list[CategoryItem]:
        """
        Extract all valid item/skill links from a category page.

        The strategy is to:
        1. Find all ``<a>`` tags with ``href`` attributes.
        2. Filter out non-item links (navigation, images, special pages).
        3. Return structured CategoryItem objects.

        Args:
            soup: Parsed HTML tree.
            category_name: Category name for metadata.
            source_url: URL of the page being scraped.

        Returns:
            List of CategoryItem instances.
        """
        items: list[CategoryItem] = []

        # Strategy 1: Look for links inside table structures (common on poedb.tw)
        items.extend(self._extract_table_links(soup, category_name, source_url))

        # Strategy 2: Look for links in list structures
        items.extend(self._extract_list_links(soup, category_name, source_url))

        # Strategy 3: Fallback -- look for links in the main content area
        if not items:
            items.extend(self._extract_content_links(soup, category_name, source_url))

        return items

    def _extract_table_links(
        self,
        soup: BeautifulSoup,
        category_name: str,
        source_url: str,
    ) -> list[CategoryItem]:
        """Extract links from table rows (the most structured format)."""
        items: list[CategoryItem] = []

        # poedb.tw uses tables like table.wikitable, table.item-table
        tables = find_all(soup, "table.wikitable, table.item-table, table[data-sort]")
        if not tables:
            # Fallback: look for any table with more than a few rows
            tables = find_all(soup, "table")

        for table in tables:
            rows = find_all(table, "tr")
            for row in rows:
                cells = row.find_all(["td", "th"])
                for cell in cells:
                    link = cell.find("a", href=True)
                    if link is None:
                        continue

                    href = safe_get_attr(link, "href")
                    title = safe_get_text(link)

                    if not self._is_valid_item_link(href, title):
                        continue

                    full_url = self._resolve_url(href)
                    if not full_url:
                        continue

                    # Try to extract the table header as metadata
                    row_metadata = self._extract_row_metadata(row, table)

                    items.append(
                        CategoryItem(
                            title=title,
                            url=full_url,
                            category=category_name,
                            source_page=source_url,
                            metadata=row_metadata,
                        )
                    )

        return items

    def _extract_list_links(
        self,
        soup: BeautifulSoup,
        category_name: str,
        source_url: str,
    ) -> list[CategoryItem]:
        """Extract links from list structures (ul/ol)."""
        items: list[CategoryItem] = []

        # Look for lists within the main content area
        content_area = self._find_content_area(soup)
        if content_area is None:
            content_area = soup

        lists = find_all(content_area, "ul, ol")
        for lst in lists:
            list_items = find_all(lst, "li")
            for li in list_items:
                link = li.find("a", href=True)
                if link is None:
                    continue

                href = safe_get_attr(link, "href")
                title = safe_get_text(link)

                if not self._is_valid_item_link(href, title):
                    continue

                full_url = self._resolve_url(href)
                if not full_url:
                    continue

                # Capture surrounding text as description
                description = safe_get_text(li).strip()
                if description.startswith(title):
                    description = description[len(title):].strip(" :;-")

                items.append(
                    CategoryItem(
                        title=title,
                        url=full_url,
                        category=category_name,
                        source_page=source_url,
                        metadata={"description": description} if description else {},
                    )
                )

        return items

    def _extract_content_links(
        self,
        soup: BeautifulSoup,
        category_name: str,
        source_url: str,
    ) -> list[CategoryItem]:
        """Fallback: extract links from the main content area."""
        items: list[CategoryItem] = []

        content_area = self._find_content_area(soup)
        if content_area is None:
            content_area = soup

        # Avoid re-scraping links we already got from tables/lists
        # by only running this when the other strategies yielded nothing.
        for link in find_all(content_area, "a[href]"):
            href = safe_get_attr(link, "href")
            title = safe_get_text(link)

            if not self._is_valid_item_link(href, title):
                continue

            full_url = self._resolve_url(href)
            if not full_url:
                continue

            items.append(
                CategoryItem(
                    title=title,
                    url=full_url,
                    category=category_name,
                    source_page=source_url,
                    metadata={},
                )
            )

        return items

    # ------------------------------------------------------------------
    # Link validation & URL helpers
    # ------------------------------------------------------------------

    def _is_valid_item_link(self, href: str | None, title: str | None) -> bool:
        """
        Determine whether a link points to an item/skill detail page.

        Filters out:
        - Empty or missing href/title
        - External links (non-poedb.tw)
        - Navigation / special pages
        - Media files (images, CSS, JS)
        - Fragment-only links
        - Links with very short titles (likely nav elements)

        Args:
            href: The href attribute value.
            title: The link text.

        Returns:
            ``True`` if the link is a valid item link.
        """
        if not href or not title:
            return False

        # Must have meaningful text (at least 2 characters)
        title_stripped = title.strip()
        if len(title_stripped) < 2:
            return False

        # Filter out known non-item titles (navigation, footer links, etc.)
        if title_stripped in _EXCLUDE_TITLES:
            return False

        # Skip fragment-only and javascript links
        if href.startswith("#") or href.startswith("javascript:"):
            return False

        # Skip external links
        if href.startswith("http") and not self._is_same_domain(href):
            return False

        # Check for excluded extensions
        lower_href = href.lower()
        for ext in _EXCLUDE_EXTENSIONS:
            if lower_href.endswith(ext):
                return False

        # Check for excluded path segments
        for segment in _EXCLUDE_PATH_SEGMENTS:
            if segment in href:
                return False

        # Must start with a known valid path prefix
        if href.startswith("/"):
            for prefix in _VALID_ITEM_PATH_PREFIXES:
                if href.startswith(prefix):
                    return True
            return False

        # Relative paths without leading slash are ok if they don't look
        # like file downloads
        if not href.startswith("/") and not href.startswith("http"):
            return True

        return False

    def _is_same_domain(self, url: str) -> bool:
        """Check if a URL belongs to the same domain as base_url."""
        base_parsed = urlparse(self.base_url)
        url_parsed = urlparse(url)
        return url_parsed.netloc == base_parsed.netloc or url_parsed.netloc == ""

    def _resolve_url(self, href: str) -> str | None:
        """
        Resolve a relative or protocol-relative URL to a full URL.

        Args:
            href: Raw href attribute value.

        Returns:
            Fully qualified URL or ``None`` if it cannot be resolved.
        """
        if not href:
            return None

        if href.startswith("//"):
            return f"https:{href}"

        if href.startswith("/"):
            return urljoin(self.base_url, href)

        if href.startswith("http"):
            return href

        # Relative path
        return urljoin(self.base_url, href)

    # ------------------------------------------------------------------
    # DOM helpers
    # ------------------------------------------------------------------

    def _find_content_area(self, soup: BeautifulSoup) -> Tag | None:
        """
        Locate the main content area of a poedb.tw page.

        Returns the first matching content container, or ``None``.
        """
        for selector in (
            "#content",
            ".mw-parser-output",
            "#mw-content-text",
            ".page-content",
            "main",
            "article",
        ):
            tag = find_first(soup, selector)
            if tag is not None:
                return tag
        return None

    def _extract_row_metadata(self, row: Tag, table: Tag) -> dict[str, Any]:
        """
        Extract metadata from a table row and its parent table.

        Looks for column headers to build key-value pairs from the row cells.
        """
        metadata: dict[str, Any] = {}

        # Try to get the table's class as context
        table_classes = safe_get_attr(table, "class")
        if table_classes:
            metadata["table_class"] = table_classes

        # Get all cells in the row
        cells = row.find_all(["td", "th"])

        # Try to find header row to map column names
        header_row = table.find("tr")
        if header_row:
            headers = header_row.find_all(["th"])
            header_texts = [safe_get_text(h) for h in headers]

            # Map header -> cell value for data rows
            data_cells = [c for c in cells if c.name == "td"]
            for i, cell in enumerate(data_cells):
                if i < len(header_texts) and header_texts[i]:
                    cell_text = safe_get_text(cell)
                    if cell_text and cell_text not in header_texts[i]:
                        metadata[header_texts[i]] = cell_text

        return metadata

    # ------------------------------------------------------------------
    # Pagination
    # ------------------------------------------------------------------

    def _find_next_page_url(self, soup: BeautifulSoup, current_url: str) -> str | None:
        """
        Find the URL of the next page in a paginated listing.

        Looks for common pagination patterns:
        - ``a.next``, ``a[rel="next"]``
        - Links containing "next", "Next", ">", ">>"
        - ``.pagination`` links

        Args:
            soup: Parsed HTML of the current page.
            current_url: URL of the current page.

        Returns:
            Full URL of the next page, or ``None`` if there is no next page.
        """
        # Strategy 1: explicit next link
        for selector in (
            "a.next",
            "a[rel='next']",
            ".pagination a.next",
            ".pager a.next",
            "li.next a",
            "a.next-page",
        ):
            tag = find_first(soup, selector)
            if tag is not None:
                href = safe_get_attr(tag, "href")
                if href:
                    return self._resolve_url(href)

        # Strategy 2: pagination container with numbered links
        pagination = find_first(soup, ".pagination, .pager, ul.pagination")
        if pagination is not None:
            links = find_all(pagination, "a[href]")
            for link in links:
                text = safe_get_text(link).strip().lower()
                href = safe_get_attr(link, "href")
                if text in ("next", ">", ">>", "next page", "next >>") and href:
                    return self._resolve_url(href)

        # Strategy 3: look for "page=" query parameter pattern
        current_parsed = urlparse(current_url)
        if "page=" in current_parsed.query:
            # Try to increment the page parameter
            return self._increment_page_param(current_url, soup)

        return None

    def _increment_page_param(self, url: str, soup: BeautifulSoup) -> str | None:
        """
        Attempt to find the next page by incrementing the page query param.

        This checks if the current page number can be incremented by looking
        at available pagination links.
        """
        import re as _re

        # Find all links with page= parameter
        page_links: list[tuple[int, str]] = []
        for a_tag in find_all(soup, "a[href]"):
            href = safe_get_attr(a_tag, "href")
            if not href or "page=" not in href:
                continue
            match = _re.search(r"page=(\d+)", href)
            if match:
                page_num = int(match.group(1))
                resolved = self._resolve_url(href)
                if resolved:
                    page_links.append((page_num, resolved))

        if not page_links:
            return None

        # Find the current page number
        current_match = _re.search(r"page=(\d+)", url)
        current_page = int(current_match.group(1)) if current_match else 1

        # Look for a link with page = current + 1
        next_page = current_page + 1
        for page_num, page_url in page_links:
            if page_num == next_page:
                return page_url

        return None


# ------------------------------------------------------------------
# Convenience function
# ------------------------------------------------------------------


async def scrape_category(
    category_name: str,
    url: str,
    *,
    follow_pagination: bool = True,
    max_pages: int = _MAX_PAGINATION_PAGES,
) -> dict[str, Any]:
    """
    One-shot function to scrape a category page.

    Creates a :class:`CategoryScraper`, scrapes the category, and cleans
    up automatically.

    Args:
        category_name: Human-readable category name.
        url: Full URL of the category page.
        follow_pagination: Whether to follow pagination links.
        max_pages: Maximum number of pages to scrape.

    Returns:
        Dict with items and metadata (same as
        :meth:`CategoryScraper.scrape_category`).
    """
    async with CategoryScraper(max_pages=max_pages) as scraper:
        return await scraper.scrape_category(
            category_name,
            url,
            follow_pagination=follow_pagination,
        )


__all__ = [
    "CategoryItem",
    "CategoryScraper",
    "scrape_category",
]
