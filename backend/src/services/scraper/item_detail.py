"""
Item detail page scraper for poedb.tw.

Scrapes individual item/skill detail pages and extracts comprehensive
structured data including item name, type, base type, stats, modifiers,
requirements, properties, flavour text, image URL, tags, categories,
and related items.

Usage::

    from src.services.scraper.item_detail import ItemDetailScraper

    async with ItemDetailScraper() as scraper:
        result = await scraper.scrape_item(
            url="https://poedb.tw/us/Tabula_Rasa",
            category="Unique Armour",
        )
        print(result["name"], result["item_type"])
"""

import logging
import re
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup, Tag

from src.models.scraper import Game, ItemType
from src.services.scraper.exceptions import ScraperError, ScraperParsingError
from src.services.scraper.game_version import detect_game_version
from src.services.scraper.http_client import DEFAULT_BASE_URL, HTTPClient
from src.services.scraper.parsers import (
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
    SELECTORS,
)

logger = logging.getLogger(__name__)

# ------------------------------------------------------------------
# Constants
# ------------------------------------------------------------------

# Mapping from poedb.tw URL path segments to ItemType enum values.
# Used to auto-detect the item type from the URL or page content.
_PATH_TO_ITEM_TYPE: dict[str, ItemType] = {
    "weapon": ItemType.WEAPON,
    "weapons": ItemType.WEAPON,
    "unique_weapon": ItemType.WEAPON,
    "sword": ItemType.WEAPON,
    "axe": ItemType.WEAPON,
    "mace": ItemType.WEAPON,
    "bow": ItemType.WEAPON,
    "staff": ItemType.WEAPON,
    "wand": ItemType.WEAPON,
    "dagger": ItemType.WEAPON,
    "claw": ItemType.WEAPON,
    "sceptre": ItemType.WEAPON,
    "armour": ItemType.ARMOR,
    "armor": ItemType.ARMOR,
    "unique_armour": ItemType.ARMOR,
    "body_armour": ItemType.ARMOR,
    "helmet": ItemType.ARMOR,
    "gloves": ItemType.ARMOR,
    "boots": ItemType.ARMOR,
    "shield": ItemType.ARMOR,
    "accessory": ItemType.ACCESSORY,
    "unique_accessory": ItemType.ACCESSORY,
    "ring": ItemType.ACCESSORY,
    "amulet": ItemType.ACCESSORY,
    "belt": ItemType.ACCESSORY,
    "flask": ItemType.FLASK,
    "flasks": ItemType.FLASK,
    "unique_flask": ItemType.FLASK,
    "gem": ItemType.GEM,
    "gems": ItemType.GEM,
    "skill_gem": ItemType.GEM,
    "support_gem": ItemType.GEM,
    "jewel": ItemType.JEWEL,
    "jewels": ItemType.JEWEL,
    "unique_jewel": ItemType.JEWEL,
    "currency": ItemType.CURRENCY,
    "map": ItemType.MAP,
    "maps": ItemType.MAP,
    "divination_card": ItemType.DIVINATION_CARD,
    "divination_cards": ItemType.DIVINATION_CARD,
    "unique": ItemType.UNIQUE,
    "passive_skill": ItemType.PASSIVE,
    "skill": ItemType.SKILL,
    "boss": ItemType.BOSS,
    "area": ItemType.AREA,
}

# CSS selectors for item detail page sections on poedb.tw.
_ITEM_DETAIL_SELECTORS = {
    "item_header": ".itemHeader, .item-header, .infobox",
    "item_name": ".itemHeader .name, .item-name, h1.page-title",
    "base_type": ".itemHeader .base, .base-type, .baseType",
    "rarity": ".itemHeader .rarity, .rarity",
    "properties_table": "table.itemStats, table.item-table, table.properties",
    "implicit_mods": ".implicitMod, .implicit, [data-mod-type='implicit']",
    "explicit_mods": ".explicitMod, .explicit, [data-mod-type='explicit']",
    "crafted_mods": ".craftedMod, .crafted, [data-mod-type='crafted']",
    "enchant_mods": ".enchantMod, .enchant, [data-mod-type='enchant']",
    "flavor_text": ".flavour, .flavour-text, .flavor",
    "requirements": ".requirements, .item-requirements",
    "image": ".item-image img, .infobox img, img.item-image",
    "tags": ".item-tag, .tag, .tags span",
    "category_breadcrumb": ".breadcrumb a, .categories a",
    "related_items": ".related a[href]",
    "main_content": "#content, .mw-parser-output, #mw-content-text, main, article",
}

# Patterns for detecting item type from page content or URL.
_UNIQUE_PATTERN = re.compile(r"\bunique\b", re.IGNORECASE)
_RARITY_PATTERN = re.compile(r"rarity[:\s]*(normal|magic|rare|unique)", re.IGNORECASE)


# ------------------------------------------------------------------
# Dataclass for item detail results
# ------------------------------------------------------------------


@dataclass
class ItemDetail:
    """
    Structured data extracted from a single item detail page.

    Attributes:
        name: Item display name.
        url: Source URL of the item page.
        item_type: Detected or specified ItemType.
        base_type: Base item type (e.g. "Sacrificial Garb" for Tabula Rasa).
        rarity: Item rarity (Normal, Magic, Rare, Unique, Currency, Gem).
        description: Item description or flavour text.
        requirements: Dict of requirement names to values.
        properties: Dict of item property names to values.
        implicit_mods: List of implicit modifier strings.
        explicit_mods: List of explicit modifier strings.
        crafted_mods: List of crafted modifier strings.
        enchant_mods: List of enchant modifier strings.
        tags: List of item tags.
        categories: List of category names the item belongs to.
        image_url: URL of the item image.
        related_items: List of related item names/URLs.
        metadata: Additional metadata dict.
        source_page: URL of the page this data was scraped from.
        success: Whether scraping succeeded.
        error: Error message if scraping failed.
    """

    name: str = ""
    url: str = ""
    item_type: str = "other"
    base_type: str = ""
    rarity: str = ""
    description: str = ""
    requirements: dict[str, str] = field(default_factory=dict)
    properties: dict[str, str] = field(default_factory=dict)
    implicit_mods: list[str] = field(default_factory=list)
    explicit_mods: list[str] = field(default_factory=list)
    crafted_mods: list[str] = field(default_factory=list)
    enchant_mods: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    categories: list[str] = field(default_factory=list)
    image_url: str | None = None
    related_items: list[dict[str, str]] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)
    source_page: str = ""
    success: bool = True
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Return a plain dict representation."""
        return {
            "name": self.name,
            "url": self.url,
            "item_type": self.item_type,
            "base_type": self.base_type,
            "rarity": self.rarity,
            "description": self.description,
            "requirements": self.requirements,
            "properties": self.properties,
            "implicit_mods": self.implicit_mods,
            "explicit_mods": self.explicit_mods,
            "crafted_mods": self.crafted_mods,
            "enchant_mods": self.enchant_mods,
            "tags": self.tags,
            "categories": self.categories,
            "image_url": self.image_url,
            "related_items": self.related_items,
            "metadata": self.metadata,
            "source_page": self.source_page,
            "success": self.success,
            "error": self.error,
        }


# ------------------------------------------------------------------
# ItemDetailScraper
# ------------------------------------------------------------------


class ItemDetailScraper:
    """
    Scraper for poedb.tw item detail pages.

    An *item detail page* is any page that describes a single item, skill,
    gem, or other game entity (e.g. ``/us/Tabula_Rasa``, ``/us/Fireball``).
    This scraper extracts comprehensive structured data from such pages.

    Design notes:
        - Uses the shared :class:`HTTPClient` for rate-limited, retrying
          HTTP requests.
        - Leverages the existing parser utilities from ``parsers.py``.
        - Can be used as an async context manager for clean resource
          management.
        - Supports specifying an explicit category for metadata enrichment
          and item type detection.

    Usage::

        async with ItemDetailScraper() as scraper:
            result = await scraper.scrape_item(
                url="https://poedb.tw/us/Tabula_Rasa",
                category="Unique Armour",
            )
    """

    def __init__(
        self,
        http_client: HTTPClient | None = None,
        base_url: str | None = None,
        game: Game = Game.POE2,
    ) -> None:
        """
        Initialise the item detail scraper.

        Args:
            http_client: Optional pre-configured :class:`HTTPClient`.
                If ``None`` a default one is created (and owned).
            base_url: Override for the poedb.tw base URL.
            game: Which game this scraper targets.
        """
        self._client = http_client or HTTPClient()
        self._owns_client = http_client is None
        self.base_url = base_url or DEFAULT_BASE_URL
        self.game = game
        self._logger = logging.getLogger(self.__class__.__name__)

    # ------------------------------------------------------------------
    # Context manager
    # ------------------------------------------------------------------

    async def __aenter__(self) -> "ItemDetailScraper":
        if self._owns_client:
            await self._client.__aenter__()
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        if self._owns_client:
            await self._client.close()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def scrape_item(
        self,
        url: str,
        *,
        category: str | None = None,
    ) -> dict[str, Any]:
        """
        Scrape a single item detail page and extract structured data.

        Args:
            url: Full URL of the item detail page.
            category: Optional category name for metadata enrichment
                (e.g. ``"Unique Armour"``, ``"Skill Gem"``).

        Returns:
            A dict with comprehensive item data including name, type,
            stats, requirements, properties, mods, flavour text, image,
            tags, categories, and related items.

        Raises:
            ScraperParsingError: If the page HTML cannot be parsed.
            ScraperError: On HTTP or network failures.
        """
        self._logger.info("Scraping item detail from %s (category=%s)", url, category)
        start_time = __import__("time").monotonic()

        path = self._url_to_path(url)
        html = await self._client.get(path)
        soup = self._parse_html(html, url)

        # Build the structured item detail
        detail = ItemDetail()
        detail.url = url
        detail.source_page = url

        # 1. Extract name
        detail.name = self._extract_name(soup)

        # 2. Detect item type
        detail.item_type = self._detect_item_type(url, soup, category)

        # 3. Extract base type
        detail.base_type = self._extract_base_type(soup)

        # 4. Extract rarity
        detail.rarity = self._extract_rarity(soup, category)

        # 5. Extract properties from tables
        detail.properties = self._extract_properties(soup)

        # 6. Extract requirements
        detail.requirements = self._extract_requirements(soup)

        # 7. Extract modifier lists
        detail.implicit_mods = self._extract_mods(soup, "implicit")
        detail.explicit_mods = self._extract_mods(soup, "explicit")
        detail.crafted_mods = self._extract_mods(soup, "crafted")
        detail.enchant_mods = self._extract_mods(soup, "enchant")

        # 8. Extract flavour text / description
        detail.description = extract_flavor_text(soup)

        # 9. Extract image URL
        detail.image_url = extract_image_url(soup, self.base_url)

        # 10. Extract tags
        detail.tags = self._extract_tags(soup)

        # 11. Extract categories / breadcrumbs
        detail.categories = self._extract_categories(soup, category)

        # 12. Extract related items
        detail.related_items = self._extract_related_items(soup)

        # 13. Additional metadata
        elapsed = __import__("time").monotonic() - start_time

        # 14. Auto-detect game version from URL and page content
        detected_version = detect_game_version(url, soup=soup)

        detail.metadata = {
            "page_title": extract_page_title(soup),
            "html_length": len(html),
            "scrape_elapsed_s": round(elapsed, 3),
            "game": detected_version,
            "game_source": self.game.value,
        }

        self._logger.info(
            "Scraped item '%s' from %s in %.2fs (type=%s, %d properties, %d mods)",
            detail.name,
            url,
            elapsed,
            detail.item_type,
            len(detail.properties),
            len(detail.implicit_mods) + len(detail.explicit_mods),
        )

        return detail.to_dict()

    async def scrape_items_batch(
        self,
        urls: list[str],
        *,
        category: str | None = None,
    ) -> dict[str, Any]:
        """
        Scrape multiple item detail pages sequentially.

        Args:
            urls: List of item page URLs to scrape.
            category: Optional category name applied to all items.

        Returns:
            A dict with ``items`` (list of item dicts), ``total``,
            ``succeeded``, ``failed``, and ``errors``.
        """
        self._logger.info("Starting batch scrape of %d items", len(urls))

        results: list[dict[str, Any]] = []
        errors: list[str] = []
        succeeded = 0
        failed = 0

        for url in urls:
            try:
                item_data = await self.scrape_item(url, category=category)
                results.append(item_data)
                succeeded += 1
            except Exception as exc:
                failed += 1
                error_msg = f"{url}: {exc}"
                errors.append(error_msg)
                results.append({
                    "url": url,
                    "success": False,
                    "error": str(exc),
                })
                self._logger.warning("Failed to scrape %s: %s", url, exc)

        return {
            "items": results,
            "total": len(urls),
            "succeeded": succeeded,
            "failed": failed,
            "errors": errors,
        }

    # ------------------------------------------------------------------
    # Internal: URL and HTML helpers
    # ------------------------------------------------------------------

    def _url_to_path(self, url: str) -> str:
        """Convert a full URL to a relative path for the HTTPClient."""
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

    def _find_content_area(self, soup: BeautifulSoup) -> Tag:
        """Locate the main content area of a poedb.tw page."""
        for selector in (
            "#mw-content-text",
            ".mw-parser-output",
            "#content",
            ".page-content",
            "main",
            "article",
        ):
            tag = find_first(soup, selector)
            if tag is not None:
                return tag
        return soup

    # ------------------------------------------------------------------
    # Internal: Data extraction methods
    # ------------------------------------------------------------------

    def _extract_name(self, soup: BeautifulSoup) -> str:
        """
        Extract the item name from the detail page.

        Tries multiple selectors in order of specificity.
        """
        # Strategy 1: specific item header selectors
        for selector in (
            _ITEM_DETAIL_SELECTORS["item_name"],
            ".itemHeader .name",
            "h1.page-title",
            "h1.firstHeading",
        ):
            tag = find_first(soup, selector)
            if tag:
                name = safe_get_text(tag)
                if name:
                    return name

        # Strategy 2: general h1
        h1 = find_first(soup, "h1")
        if h1:
            name = safe_get_text(h1)
            if name:
                return name

        # Strategy 3: fallback to page title parser
        return extract_item_name(soup)

    def _detect_item_type(
        self,
        url: str,
        soup: BeautifulSoup,
        category: str | None,
    ) -> str:
        """
        Detect the item type from URL, page content, or category.

        Checks URL path segments, page breadcrumbs, and category name
        to determine the most specific ItemType.
        """
        # Check URL path segments
        url_lower = url.lower()
        for segment, item_type in _PATH_TO_ITEM_TYPE.items():
            if segment in url_lower:
                return item_type.value

        # Check category name
        if category:
            cat_lower = category.lower()
            for segment, item_type in _PATH_TO_ITEM_TYPE.items():
                if segment in cat_lower:
                    return item_type.value

        # Check page breadcrumbs for type hints
        breadcrumb_links = find_all(soup, ".breadcrumb a, .categories a")
        for link in breadcrumb_links:
            link_text = safe_get_text(link).lower()
            link_href = safe_get_attr(link, "href").lower()
            for segment, item_type in _PATH_TO_ITEM_TYPE.items():
                if segment in link_text or segment in link_href:
                    return item_type.value

        # Check page content for rarity keywords
        page_text = safe_get_text(soup).lower()
        if "unique" in page_text and any(
            kw in page_text for kw in ("weapon", "armour", "armor", "ring", "amulet", "belt", "flask", "jewel")
        ):
            return ItemType.UNIQUE.value

        if "gem" in page_text:
            return ItemType.GEM.value

        return ItemType.OTHER.value

    def _extract_base_type(self, soup: BeautifulSoup) -> str:
        """Extract the base item type (e.g. the white item name)."""
        for selector in (
            _ITEM_DETAIL_SELECTORS["base_type"],
            ".base-type",
            ".baseType",
        ):
            tag = find_first(soup, selector)
            if tag:
                text = safe_get_text(tag)
                if text:
                    return text

        # Try to find base type from properties table
        tables = find_all(soup, "table.itemStats, table.item-table, table.wikitable")
        for table in tables:
            rows = find_all(table, "tr")
            for row in rows:
                cells = row.find_all(["th", "td"])
                if len(cells) >= 2:
                    key = safe_get_text(cells[0]).lower().strip()
                    if key in ("base type", "basetype", "type", "item base"):
                        return safe_get_text(cells[1])

        return ""

    def _extract_rarity(self, soup: BeautifulSoup, category: str | None = None) -> str:
        """Extract item rarity from the page."""
        # Strategy 1: explicit rarity element
        for selector in (_ITEM_DETAIL_SELECTORS["rarity"], ".rarity"):
            tag = find_first(soup, selector)
            if tag:
                text = safe_get_text(tag)
                if text:
                    return text.strip()

        # Strategy 2: search page content for rarity pattern
        page_text = safe_get_text(soup)
        match = _RARITY_PATTERN.search(page_text)
        if match:
            return match.group(1).title()

        # Strategy 3: infer from category
        if category:
            cat_lower = category.lower()
            if "unique" in cat_lower:
                return "Unique"
            if "gem" in cat_lower:
                return "Gem"
            if "currency" in cat_lower:
                return "Currency"
            if "divination" in cat_lower:
                return "Divination Card"

        # Strategy 4: check URL for unique
        page_title = extract_page_title(soup).lower()
        if "unique" in page_title:
            return "Unique"

        return ""

    def _extract_properties(self, soup: BeautifulSoup) -> dict[str, str]:
        """
        Extract item properties from tables on the page.

        Looks for key-value pairs in tables that represent item
        properties like damage, attack speed, armour, evasion, etc.
        """
        properties: dict[str, str] = {}

        content = self._find_content_area(soup)

        # Find all tables in the content area
        tables = find_all(
            content,
            "table.itemStats, table.item-table, table.properties, table.wikitable",
        )

        # If no specific tables found, try any table
        if not tables:
            tables = find_all(content, "table")

        _PROPERTY_KEYS = {
            "physical damage",
            "elemental damage",
            "fire damage",
            "cold damage",
            "lightning damage",
            "chaos damage",
            "attack speed",
            "critical strike chance",
            "critical strike multiplier",
            "range",
            "armour",
            "evasion rating",
            "energy shield",
            "block",
            "life",
            "mana",
            "damage",
            "attacks per second",
            "weapon range",
            "quality",
            "level",
            "experience",
            "base type",
            "basetype",
            "class",
            "tags",
            "storage tab",
            "stack size",
            "drop level",
            "drop restrictions",
            "purchase costs",
            "sell price",
        }

        for table in tables:
            rows = find_all(table, "tr")
            for row in rows:
                cells = row.find_all(["th", "td"])
                if len(cells) >= 2:
                    key = safe_get_text(cells[0]).strip()
                    value = safe_get_text(cells[1]).strip()
                    key_lower = key.lower()

                    # Match known property keys
                    if key_lower in _PROPERTY_KEYS:
                        if key not in properties and value:
                            properties[key] = value
                    # Also match partial keys
                    elif any(pk in key_lower for pk in ("damage", "speed", "armour", "armor", "shield", "evasion", "block", "quality", "critical")):
                        if key not in properties and value:
                            properties[key] = value

        return properties

    def _extract_requirements(self, soup: BeautifulSoup) -> dict[str, str]:
        """
        Extract item requirements.

        Extends the base parser's extract_requirements with
        additional strategies specific to item detail pages.
        """
        requirements = extract_requirements(soup)

        # Also try to find requirements from tables
        content = self._find_content_area(soup)
        tables = find_all(content, "table")
        for table in tables:
            rows = find_all(table, "tr")
            for row in rows:
                cells = row.find_all(["th", "td"])
                if len(cells) >= 2:
                    key = safe_get_text(cells[0]).lower().strip()
                    value = safe_get_text(cells[1]).strip()
                    if key in ("level", "requires level", "req. level", "req level"):
                        if "Level" not in requirements and value:
                            requirements["Level"] = value
                    elif key in ("str", "strength"):
                        if "Strength" not in requirements and value:
                            requirements["Strength"] = value
                    elif key in ("dex", "dexterity"):
                        if "Dexterity" not in requirements and value:
                            requirements["Dexterity"] = value
                    elif key in ("int", "intelligence"):
                        if "Intelligence" not in requirements and value:
                            requirements["Intelligence"] = value

        return requirements

    def _extract_mods(self, soup: BeautifulSoup, mod_type: str) -> list[str]:
        """
        Extract modifier lines of a specific type.

        Args:
            soup: Parsed HTML tree.
            mod_type: One of "implicit", "explicit", "crafted", "enchant".

        Returns:
            List of modifier text strings.
        """
        selector_key = f"{mod_type}_mods"
        selector = _ITEM_DETAIL_SELECTORS.get(selector_key, "")

        mods: list[str] = []
        seen: set[str] = set()

        # Try the specific selector
        if selector:
            tags = find_all(soup, selector)
            for tag in tags:
                text = safe_get_text(tag)
                if text and text not in seen:
                    seen.add(text)
                    mods.append(text)

        # Also try CSS class-based approach
        class_patterns = {
            "implicit": (".implicitMod", ".implicit"),
            "explicit": (".explicitMod", ".explicit"),
            "crafted": (".craftedMod", ".crafted"),
            "enchant": (".enchantMod", ".enchant"),
        }

        if mod_type in class_patterns:
            for pattern in class_patterns[mod_type]:
                tags = find_all(soup, pattern)
                for tag in tags:
                    text = safe_get_text(tag)
                    if text and text not in seen:
                        seen.add(text)
                        mods.append(text)

        # Try data-attribute based approach
        data_attr_tags = find_all(soup, f"[data-mod-type='{mod_type}']")
        for tag in data_attr_tags:
            text = safe_get_text(tag)
            if text and text not in seen:
                seen.add(text)
                mods.append(text)

        return mods

    def _extract_tags(self, soup: BeautifulSoup) -> list[str]:
        """Extract item tags from the detail page."""
        tags: list[str] = []
        seen: set[str] = set()

        # Strategy 1: explicit tag elements
        for selector in (
            _ITEM_DETAIL_SELECTORS["tags"],
            ".item-tag",
            ".tag",
            ".tags span",
        ):
            tag_elements = find_all(soup, selector)
            for elem in tag_elements:
                text = safe_get_text(elem).strip()
                if text and text not in seen:
                    seen.add(text)
                    tags.append(text)

        # Strategy 2: tags from table rows
        content = self._find_content_area(soup)
        tables = find_all(content, "table")
        for table in tables:
            rows = find_all(table, "tr")
            for row in rows:
                cells = row.find_all(["th", "td"])
                if len(cells) >= 2:
                    key = safe_get_text(cells[0]).lower().strip()
                    if key == "tags":
                        tag_text = safe_get_text(cells[1])
                        # Tags are often comma-separated
                        for tag in tag_text.split(","):
                            tag = tag.strip()
                            if tag and tag not in seen:
                                seen.add(tag)
                                tags.append(tag)

        return tags

    def _extract_categories(
        self,
        soup: BeautifulSoup,
        explicit_category: str | None,
    ) -> list[str]:
        """Extract categories from breadcrumbs and page metadata."""
        categories: list[str] = []
        seen: set[str] = set()

        # Add explicit category if provided
        if explicit_category:
            categories.append(explicit_category)
            seen.add(explicit_category.lower())

        # Strategy 1: breadcrumb links
        breadcrumb_links = find_all(soup, ".breadcrumb a")
        for link in breadcrumb_links:
            text = safe_get_text(link).strip()
            if text and text.lower() not in seen:
                seen.add(text.lower())
                categories.append(text)

        # Strategy 2: category links at bottom of page
        cat_links = find_all(soup, ".categories a, #catlinks a, .mw-normal-catlinks a")
        for link in cat_links:
            text = safe_get_text(link).strip()
            if text and text.lower() not in seen:
                seen.add(text.lower())
                categories.append(text)

        return categories

    def _extract_related_items(self, soup: BeautifulSoup) -> list[dict[str, str]]:
        """Extract related item links from the detail page."""
        related: list[dict[str, str]] = []
        seen_urls: set[str] = set()

        # Look for related items section
        for selector in (
            _ITEM_DETAIL_SELECTORS["related_items"],
            ".related a[href]",
            ".see-also a[href]",
        ):
            links = find_all(soup, selector)
            for link in links:
                text = safe_get_text(link).strip()
                href = safe_get_attr(link, "href")

                if not text or not href:
                    continue

                # Resolve URL
                if href.startswith("/"):
                    full_url = urljoin(self.base_url, href)
                elif href.startswith("//"):
                    full_url = f"https:{href}"
                else:
                    full_url = href

                # Skip non-item links
                if any(
                    skip in href.lower()
                    for skip in ("special:", "file:", "help:", "template:", "category:", "user:", "#")
                ):
                    continue

                if full_url not in seen_urls and len(text) >= 2:
                    seen_urls.add(full_url)
                    related.append({"title": text, "url": full_url})

        return related[:20]  # Limit to 20 related items


# ------------------------------------------------------------------
# Convenience function
# ------------------------------------------------------------------


async def scrape_item_detail(
    url: str,
    *,
    category: str | None = None,
    game: Game = Game.POE2,
) -> dict[str, Any]:
    """
    One-shot function to scrape an item detail page.

    Creates an :class:`ItemDetailScraper`, scrapes the item, and cleans
    up automatically.

    Args:
        url: Full URL of the item detail page.
        category: Optional category name for metadata enrichment.
        game: Which game this item belongs to.

    Returns:
        Dict with comprehensive item data (same as
        :meth:`ItemDetailScraper.scrape_item`).
    """
    async with ItemDetailScraper(game=game) as scraper:
        return await scraper.scrape_item(url, category=category)


__all__ = [
    "ItemDetail",
    "ItemDetailScraper",
    "scrape_item_detail",
]
