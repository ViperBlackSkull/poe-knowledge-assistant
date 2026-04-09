"""
Game version detection for poedb.tw scraper.

Provides utilities to detect whether a URL or page belongs to Path of Exile 1
or Path of Exile 2.  The detection is based primarily on URL structure (the
poedb.tw domain hosts PoE1 content while poe2db.tw hosts PoE2 content) and
secondarily on page content signals such as the page title, meta tags, and
known CSS classes or text patterns.

The primary entry point is :func:`detect_game_version` which accepts a URL
string and an optional BeautifulSoup object and returns ``'poe1'`` or
``'poe2'``.

Usage::

    from src.services.scraper.game_version import detect_game_version

    # URL-only detection
    version = detect_game_version("https://poedb.tw/us/Tabula_Rasa")
    # -> 'poe1'

    version = detect_game_version("https://poe2db.tw/us/Fireball")
    # -> 'poe2'

    # URL + page content detection (more robust)
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "lxml")
    version = detect_game_version(url, soup=soup)

    # Asynchronous version that fetches the page if needed
    version = await detect_game_version_async("https://poedb.tw/us/Tabula_Rasa")
"""

import logging
import re
from typing import Optional
from urllib.parse import urlparse

from bs4 import BeautifulSoup

from src.models.scraper import Game

logger = logging.getLogger(__name__)

# ------------------------------------------------------------------
# URL patterns
# ------------------------------------------------------------------

# Domains that exclusively host PoE2 content.
_POE2_DOMAINS: frozenset[str] = frozenset({
    "poe2db.tw",
    "www.poe2db.tw",
})

# Domains that exclusively host PoE1 content.
_POE1_DOMAINS: frozenset[str] = frozenset({
    "poedb.tw",
    "www.poedb.tw",
})

# URL path prefixes that strongly indicate PoE2 content when present on
# poedb.tw (the primary PoE1 domain).  poedb.tw sometimes hosts PoE2 pages
# under these path prefixes.
_POE2_PATH_PREFIXES: tuple[str, ...] = (
    "/poe2/",
    "/poe2_",
    "/e/poe2/",
)

# URL path prefixes that strongly indicate PoE1 content.
_POE1_PATH_PREFIXES: tuple[str, ...] = (
    "/poe1/",
    "/e/poe1/",
)

# ------------------------------------------------------------------
# Page content patterns
# ------------------------------------------------------------------

# Patterns found in page titles, meta tags, or visible text that indicate
# the page is PoE2 content.
_POE2_CONTENT_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\bPoE\s*2\b", re.IGNORECASE),
    re.compile(r"\bPath of Exile\s*2\b", re.IGNORECASE),
    re.compile(r"\bPoE2DB\b", re.IGNORECASE),
    re.compile(r"\bpoe2db\b"),
    re.compile(r"\bpoe2\b", re.IGNORECASE),
)

# Patterns indicating PoE1 content.
_POE1_CONTENT_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\bPoE\s*1\b", re.IGNORECASE),
    re.compile(r"\bPath of Exile\s*1\b", re.IGNORECASE),
    re.compile(r"\bPoEDB\b"),           # Capitalised PoEDB is the PoE1 wiki
    re.compile(r"\bpoedb\.tw\b"),
)

# CSS selectors to search for version indicators in the page.
_VERSION_INDICATOR_SELECTORS: tuple[str, ...] = (
    "title",
    "meta[name='description']",
    "meta[name='keywords']",
    "meta[property='og:title']",
    "meta[property='og:site_name']",
    ".game-version",
    "[data-game]",
    "link[rel='canonical']",
)


def detect_game_version(
    url: str,
    soup: BeautifulSoup | None = None,
) -> str:
    """
    Detect whether a URL (and optionally its page content) belongs to PoE1 or PoE2.

    The detection strategy proceeds in order of reliability:

    1. **URL domain check**: ``poe2db.tw`` domains are PoE2; ``poedb.tw``
       domains are PoE1 (unless a path override applies).
    2. **URL path check**: Paths containing ``/poe2/`` or similar prefixes
       indicate PoE2; paths containing ``/poe1/`` indicate PoE1.
    3. **Page content check** (requires *soup*): Searches the page title,
       meta tags, and other elements for known PoE1/PoE2 text patterns.
    4. **Default fallback**: Returns ``'poe1'`` if no PoE2 indicators are
       found, since poedb.tw is primarily a PoE1 resource.

    Args:
        url: The full URL of the page being checked.
        soup: Optional pre-parsed BeautifulSoup object.  When provided,
            page content analysis is performed to validate the URL-based
            detection.

    Returns:
        ``'poe1'`` or ``'poe2'``.

    Raises:
        ValueError: If *url* is empty or ``None``.

    Examples::

        >>> detect_game_version("https://poedb.tw/us/Tabula_Rasa")
        'poe1'
        >>> detect_game_version("https://poe2db.tw/us/Fireball")
        'poe2'
        >>> detect_game_version("https://poedb.tw/poe2/us/Item")
        'poe2'
    """
    if not url:
        raise ValueError("URL must not be empty or None")

    parsed = urlparse(url)
    hostname = (parsed.hostname or "").lower()
    path = parsed.path.lower()

    # --- Strategy 1: Domain-based detection ---
    if hostname in _POE2_DOMAINS:
        logger.debug("Detected PoE2 from domain: %s", hostname)
        version = "poe2"
        # Validate against page content if available
        if soup is not None:
            content_version = _detect_from_content(soup)
            if content_version and content_version != version:
                logger.warning(
                    "URL domain suggests %s but page content suggests %s for %s",
                    version,
                    content_version,
                    url,
                )
        return version

    if hostname in _POE1_DOMAINS:
        # --- Strategy 2: Path-based override on poedb.tw ---
        for prefix in _POE2_PATH_PREFIXES:
            if path.startswith(prefix):
                logger.debug(
                    "Detected PoE2 from path prefix '%s' on poedb.tw: %s",
                    prefix,
                    url,
                )
                return "poe2"

        for prefix in _POE1_PATH_PREFIXES:
            if path.startswith(prefix):
                logger.debug("Detected PoE1 from path prefix: %s", prefix)
                return "poe1"

        # Default poedb.tw = PoE1
        logger.debug("Detected PoE1 from poedb.tw domain: %s", hostname)
        return "poe1"

    # --- Strategy 3: Unknown domain -- rely on content ---
    if soup is not None:
        content_version = _detect_from_content(soup)
        if content_version:
            logger.debug(
                "Detected %s from page content for unknown domain: %s",
                content_version,
                url,
            )
            return content_version

    # --- Strategy 4: URL text patterns for unknown domains ---
    url_version = _detect_from_url_text(url)
    if url_version:
        return url_version

    # Default fallback: poe1 (the original game)
    logger.warning(
        "Could not determine game version for %s -- defaulting to poe1",
        url,
    )
    return "poe1"


def _detect_from_content(soup: BeautifulSoup) -> str | None:
    """
    Analyze page content to determine the game version.

    Searches the title, meta tags, and other elements for known patterns.

    Args:
        soup: Pre-parsed BeautifulSoup object.

    Returns:
        ``'poe1'``, ``'poe2'``, or ``None`` if no conclusion can be drawn.
    """
    poe2_score = 0
    poe1_score = 0

    for selector in _VERSION_INDICATOR_SELECTORS:
        tags = soup.select(selector)
        for tag in tags:
            text = ""

            # For <meta> tags, check the content attribute
            if tag.name == "meta":
                text = tag.get("content", "") or ""
                # Also check data-game attribute if present
                data_game = tag.get("data-game", "")
                if data_game:
                    text += " " + data_game
            elif tag.name == "link":
                text = tag.get("href", "") or ""
            else:
                text = tag.get_text(separator=" ") or ""

            if not text:
                continue

            for pattern in _POE2_CONTENT_PATTERNS:
                if pattern.search(text):
                    poe2_score += 1
                    break  # one match per tag per category

            for pattern in _POE1_CONTENT_PATTERNS:
                if pattern.search(text):
                    poe1_score += 1
                    break

    # Also check data-game attributes on any element
    for elem in soup.select("[data-game]"):
        game_val = elem.get("data-game", "").lower()
        if "poe2" in game_val or "2" == game_val.strip():
            poe2_score += 2  # strong signal
        elif "poe1" in game_val or "1" == game_val.strip():
            poe1_score += 2

    if poe2_score > poe1_score:
        return "poe2"
    if poe1_score > poe2_score:
        return "poe1"
    return None


def _detect_from_url_text(url: str) -> str | None:
    """
    Check URL string for PoE1/PoE2 text patterns.

    This is used as a fallback when the domain is not recognized.

    Args:
        url: Full URL string.

    Returns:
        ``'poe1'``, ``'poe2'``, or ``None``.
    """
    url_lower = url.lower()

    # Check for PoE2 indicators
    poe2_indicators = [
        "poe2db",
        "poe2",
        "pathofexile2",
        "path-of-exile-2",
    ]
    for indicator in poe2_indicators:
        if indicator in url_lower:
            return "poe2"

    # Check for PoE1 indicators
    poe1_indicators = [
        "poedb.tw",
        "poe1",
        "pathofexile1",
        "path-of-exile-1",
    ]
    for indicator in poe1_indicators:
        if indicator in url_lower:
            return "poe1"

    return None


async def detect_game_version_async(
    url: str,
    soup: BeautifulSoup | None = None,
) -> str:
    """
    Async wrapper around :func:`detect_game_version`.

    If *soup* is not provided and the URL is from a known poedb.tw domain,
    this function will fetch the page and parse it to perform content-based
    detection.  If *soup* is already provided, it delegates directly to the
    synchronous :func:`detect_game_version`.

    Args:
        url: The full URL of the page.
        soup: Optional pre-parsed BeautifulSoup object.

    Returns:
        ``'poe1'`` or ``'poe2'``.
    """
    if soup is not None:
        return detect_game_version(url, soup=soup)

    parsed = urlparse(url)
    hostname = (parsed.hostname or "").lower()

    # Fast path: domain-based detection does not need page content
    if hostname in _POE2_DOMAINS:
        return "poe2"
    if hostname in _POE1_DOMAINS:
        path = parsed.path.lower()
        for prefix in _POE2_PATH_PREFIXES:
            if path.startswith(prefix):
                return "poe2"
        return "poe1"

    # Slow path: need to fetch the page for content-based detection
    try:
        from src.services.scraper.http_client import HTTPClient

        async with HTTPClient() as client:
            html = await client.get(parsed.path)
            page_soup = BeautifulSoup(html, "lxml")
            return detect_game_version(url, soup=page_soup)
    except Exception as exc:
        logger.warning(
            "Failed to fetch page for version detection of %s: %s -- "
            "falling back to URL-only detection",
            url,
            exc,
        )
        return detect_game_version(url)


def detect_game_version_model(
    url: str,
    soup: BeautifulSoup | None = None,
) -> Game:
    """
    Detect game version and return the typed :class:`Game` enum.

    This is a convenience wrapper around :func:`detect_game_version` that
    returns a :class:`Game` enum member instead of a string.

    Args:
        url: The full URL of the page.
        soup: Optional pre-parsed BeautifulSoup object.

    Returns:
        :class:`Game` enum (``Game.POE1`` or ``Game.POE2``).
    """
    version_str = detect_game_version(url, soup=soup)
    if version_str == "poe2":
        return Game.POE2
    return Game.POE1


def get_version_for_url(url: str) -> str:
    """
    Quick URL-only detection without page content.

    Convenience function that calls :func:`detect_game_version` without
    a soup argument.  Useful when you only have a URL and do not want to
    fetch the page.

    Args:
        url: The full URL.

    Returns:
        ``'poe1'`` or ``'poe2'``.
    """
    return detect_game_version(url)


__all__ = [
    "detect_game_version",
    "detect_game_version_async",
    "detect_game_version_model",
    "get_version_for_url",
]
