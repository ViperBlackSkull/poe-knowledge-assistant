"""
DOM parsing utilities for the poedb.tw scraper.

Provides reusable helper functions for extracting structured data from
poedb.tw HTML pages.  These utilities handle the common patterns found
across item pages, skill pages, category listings, etc.

All functions accept a :class:`bs4.BeautifulSoup` object (or a tag) so
they can be composed freely by concrete scraper implementations.
"""

import logging
import re
from typing import Any, Optional
from urllib.parse import urljoin

from bs4 import BeautifulSoup, Tag

from src.services.scraper.exceptions import ScraperParsingError

logger = logging.getLogger(__name__)

# ------------------------------------------------------------------
# Constants
# ------------------------------------------------------------------

# Common CSS selectors used across poedb.tw pages
SELECTORS = {
    "page_title": "h1.page-title, h1.firstHeading, h1",
    "item_table": "table.item-table, table.wikitable",
    "item_name": ".item-name, .itemHeader .name, h1",
    "item_details": ".item-details, .itemStats",
    "stat_line": ".stat, .explicitMod, .implicitMod",
    "flavor_text": ".flavour, .flavour-text, .flavor",
    "requirements": ".requirements, .item-requirements",
    "image": ".item-image img, .infobox img, img.item-image",
    "links": "a[href]",
    "category_list": ".category-list li, .item-category li",
    "tab_content": ".tab-content, .tab-pane",
    "table_rows": "tr",
    "table_header": "th",
    "table_cell": "td",
}


# ------------------------------------------------------------------
# Generic helpers
# ------------------------------------------------------------------


def safe_get_text(
    tag: Tag | None,
    *,
    strip: bool = True,
    separator: str = " ",
    default: str = "",
) -> str:
    """
    Extract text from a BeautifulSoup tag, returning *default* on failure.

    Args:
        tag: A BeautifulSoup Tag (or ``None``).
        strip: Strip whitespace from the result.
        separator: Separator used when joining child strings.
        default: Value to return when *tag* is ``None`` or has no text.

    Returns:
        Extracted text string.
    """
    if tag is None:
        return default
    try:
        text = tag.get_text(separator=separator)
        if strip:
            text = text.strip()
        return text or default
    except Exception:
        return default


def safe_get_attr(
    tag: Tag | None,
    attr: str,
    *,
    default: str = "",
) -> str:
    """
    Safely extract an attribute from a tag.

    Args:
        tag: A BeautifulSoup Tag (or ``None``).
        attr: The attribute name (e.g. ``"href"``, ``"src"``).
        default: Fallback value.

    Returns:
        The attribute value or *default*.
    """
    if tag is None:
        return default
    try:
        value = tag.get(attr, default)
        if isinstance(value, list):
            return " ".join(str(v) for v in value)
        return str(value) if value else default
    except Exception:
        return default


def find_first(soup: BeautifulSoup | Tag, selector: str) -> Tag | None:
    """
    Find the first element matching *selector*, returning ``None`` on failure.

    Uses BeautifulSoup ``select_one()`` which supports CSS selectors.

    Args:
        soup: Parsed HTML tree or tag.
        selector: CSS selector string.

    Returns:
        The first matching Tag, or ``None``.
    """
    try:
        return soup.select_one(selector)
    except Exception:
        return None


def find_all(soup: BeautifulSoup | Tag, selector: str) -> list[Tag]:
    """
    Find all elements matching *selector*, returning an empty list on failure.

    Args:
        soup: Parsed HTML tree or tag.
        selector: CSS selector string.

    Returns:
        A list of matching Tags.
    """
    try:
        return soup.select(selector)
    except Exception:
        return []


# ------------------------------------------------------------------
# poedb.tw-specific extractors
# ------------------------------------------------------------------


def extract_page_title(soup: BeautifulSoup) -> str:
    """
    Extract the page title from a poedb.tw page.

    Tries several common heading selectors used on poedb.tw.

    Args:
        soup: Parsed HTML tree.

    Returns:
        The page title string, or an empty string if not found.
    """
    for selector_key in ("page_title",):
        selector = SELECTORS[selector_key]
        tag = find_first(soup, selector)
        if tag:
            title = safe_get_text(tag)
            if title:
                return title

    # Fallback: use <title> tag
    title_tag = soup.find("title")
    if title_tag:
        text = safe_get_text(title_tag)
        # poedb.tw titles often include " - PoEDB" suffix
        return text.split(" - ")[0].strip()
    return ""


def extract_item_name(soup: BeautifulSoup) -> str:
    """
    Extract the item name from a poedb.tw item page.

    Args:
        soup: Parsed HTML tree.

    Returns:
        Item name string.
    """
    for selector in (SELECTORS["item_name"], "h1", "h2"):
        tag = find_first(soup, selector)
        if tag:
            name = safe_get_text(tag)
            if name:
                return name
    return ""


def extract_stats(soup: BeautifulSoup | Tag) -> list[str]:
    """
    Extract stat / modifier lines from an item or skill page.

    Args:
        soup: Parsed HTML tree or tag subset.

    Returns:
        A list of stat strings (e.g. ``["+150% increased Physical Damage"]``).
    """
    stats: list[str] = []
    for selector in (
        SELECTORS["stat_line"],
        ".explicitMod",
        ".implicitMod",
        ".enchantMod",
        ".craftedMod",
    ):
        tags = find_all(soup, selector)
        for tag in tags:
            text = safe_get_text(tag)
            if text:
                stats.append(text)

    # Deduplicate while preserving order
    seen: set[str] = set()
    unique_stats: list[str] = []
    for s in stats:
        if s not in seen:
            seen.add(s)
            unique_stats.append(s)
    return unique_stats


def extract_flavor_text(soup: BeautifulSoup) -> str:
    """
    Extract flavour / lore text from a poedb.tw page.

    Args:
        soup: Parsed HTML tree.

    Returns:
        Flavour text string (empty string if not found).
    """
    for selector in (
        SELECTORS["flavor_text"],
        ".flavour",
        ".flavor",
        ".flavour-text",
    ):
        tag = find_first(soup, selector)
        if tag:
            text = safe_get_text(tag)
            if text:
                return text
    return ""


def extract_requirements(soup: BeautifulSoup | Tag) -> dict[str, str]:
    """
    Extract item/skill requirements as a key-value mapping.

    Looks for common patterns such as ``Level``, ``Str``, ``Dex``, ``Int``.

    Args:
        soup: Parsed HTML tree or tag subset.

    Returns:
        Dict mapping requirement names to values.
    """
    requirements: dict[str, str] = {}

    # Try structured requirement blocks first
    req_section = find_first(soup, SELECTORS["requirements"])
    if req_section is not None:
        text = safe_get_text(req_section)
        _parse_requirement_text(text, requirements)

    # Fallback: scan table rows for requirement patterns
    rows = find_all(soup, "tr")
    for row in rows:
        cells = row.find_all(["th", "td"])
        if len(cells) >= 2:
            key = safe_get_text(cells[0]).lower()
            val = safe_get_text(cells[1])
            if key in ("level", "str", "dex", "int", "strength", "dexterity", "intelligence"):
                requirements[key.title()] = val

    return requirements


def extract_image_url(soup: BeautifulSoup, base_url: str = "https://poedb.tw") -> str | None:
    """
    Extract the primary item image URL from a poedb.tw page.

    Args:
        soup: Parsed HTML tree.
        base_url: Base URL for resolving relative paths.

    Returns:
        Absolute image URL or ``None``.
    """
    for selector in (SELECTORS["image"], ".infobox img", "img"):
        tag = find_first(soup, selector)
        if tag:
            src = safe_get_attr(tag, "src") or safe_get_attr(tag, "data-src")
            if src and not src.startswith("data:"):
                # Make relative URLs absolute
                if src.startswith("//"):
                    return f"https:{src}"
                if src.startswith("/"):
                    return urljoin(base_url, src)
                return src
    return None


def extract_links(soup: BeautifulSoup | Tag, base_url: str = "https://poedb.tw") -> list[dict[str, str]]:
    """
    Extract all links from a page, resolving relative URLs.

    Args:
        soup: Parsed HTML tree or tag subset.
        base_url: Base URL for resolving relative paths.

    Returns:
        A list of dicts with ``text`` and ``href`` keys.
    """
    links: list[dict[str, str]] = []
    seen_hrefs: set[str] = set()

    for a_tag in find_all(soup, "a[href]"):
        href = safe_get_attr(a_tag, "href")
        text = safe_get_text(a_tag)
        if not href or not text:
            continue

        # Resolve relative URLs
        if href.startswith("/"):
            href = urljoin(base_url, href)
        elif href.startswith("//"):
            href = f"https:{href}"

        # Skip anchors and javascript
        if href.startswith("#") or href.startswith("javascript:"):
            continue

        if href not in seen_hrefs:
            seen_hrefs.add(href)
            links.append({"text": text, "href": href})

    return links


def extract_table_data(
    soup: BeautifulSoup | Tag,
    table_selector: str | None = None,
) -> list[dict[str, str]]:
    """
    Extract data from an HTML table as a list of row dicts.

    The first row is treated as the header.  Each subsequent row becomes
    a dict mapping header text to cell text.

    Args:
        soup: Parsed HTML tree or tag subset.
        table_selector: Optional CSS selector for the target table.
            Defaults to ``"table"``.

    Returns:
        A list of dicts, one per table body row.
    """
    selector = table_selector or "table"
    table = find_first(soup, selector)
    if table is None:
        return []

    rows = find_all(table, "tr")
    if not rows:
        return []

    # Extract headers from the first row
    header_cells = rows[0].find_all(["th", "td"])
    headers = [safe_get_text(cell) for cell in header_cells]

    # If no explicit <th>, try to detect from the first row
    data_rows = rows[1:] if any(cell.name == "th" for cell in header_cells) else rows

    result: list[dict[str, str]] = []
    for row in data_rows:
        cells = row.find_all("td")
        if not cells:
            continue
        row_data: dict[str, str] = {}
        for i, cell in enumerate(cells):
            key = headers[i] if i < len(headers) else f"col_{i}"
            row_data[key] = safe_get_text(cell)
        if row_data:
            result.append(row_data)

    return result


# ------------------------------------------------------------------
# Internal helpers
# ------------------------------------------------------------------


# Pattern for parsing "Level: 60, Str: 113" style text
_REQ_PATTERN = re.compile(r"(\w[\w\s]*?)\s*[:=]\s*([\d,]+)", re.IGNORECASE)


def _parse_requirement_text(text: str, out: dict[str, str]) -> None:
    """Parse requirement key-value pairs from free-form text."""
    for match in _REQ_PATTERN.finditer(text):
        key = match.group(1).strip().title()
        value = match.group(2).strip()
        if key and value:
            out[key] = value


__all__ = [
    # Constants
    "SELECTORS",
    # Generic helpers
    "safe_get_text",
    "safe_get_attr",
    "find_first",
    "find_all",
    # poedb.tw extractors
    "extract_page_title",
    "extract_item_name",
    "extract_stats",
    "extract_flavor_text",
    "extract_requirements",
    "extract_image_url",
    "extract_links",
    "extract_table_data",
]
