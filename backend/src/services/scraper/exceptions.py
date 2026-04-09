"""
Custom exceptions for the poedb.tw scraper module.

Provides a hierarchy of exceptions for different scraper failure modes,
enabling callers to handle specific error types appropriately.
"""


class ScraperError(Exception):
    """
    Base exception for all scraper-related errors.

    All other scraper exceptions inherit from this class, so catching
    ScraperError will handle any scraper failure.
    """

    def __init__(self, message: str, url: str | None = None):
        self.url = url
        super().__init__(message)


class ScraperConnectionError(ScraperError):
    """
    Raised when the scraper cannot establish a connection to the target.

    This typically indicates network-level failures such as DNS resolution
    errors, connection refused, or timeout before a response is received.
    """

    def __init__(
        self,
        message: str,
        url: str | None = None,
        status_code: int | None = None,
    ):
        self.status_code = status_code
        super().__init__(message, url)


class ScraperHTTPError(ScraperError):
    """
    Raised when the server responds with an unsuccessful HTTP status code.

    Common codes include 429 (rate-limited), 403 (forbidden), and
    5xx (server error).
    """

    def __init__(
        self,
        message: str,
        url: str | None = None,
        status_code: int | None = None,
    ):
        self.status_code = status_code
        super().__init__(message, url)


class ScraperRateLimitError(ScraperHTTPError):
    """
    Raised specifically when a 429 Too Many Requests response is received.

    The scraper HTTP client handles retries with exponential back-off, but
    if all retries are exhausted this error is raised.
    """

    def __init__(
        self,
        message: str,
        url: str | None = None,
        retry_after: float | None = None,
    ):
        self.retry_after = retry_after
        super().__init__(message, url, status_code=429)


class ScraperParsingError(ScraperError):
    """
    Raised when the scraper cannot parse the HTML response.

    This usually means the page structure has changed or the response
    body is not valid HTML.
    """

    def __init__(
        self,
        message: str,
        url: str | None = None,
        selector: str | None = None,
    ):
        self.selector = selector
        super().__init__(message, url)


class ScraperTimeoutError(ScraperError):
    """
    Raised when a request exceeds the configured timeout.
    """

    def __init__(self, message: str, url: str | None = None, timeout: float | None = None):
        self.timeout = timeout
        super().__init__(message, url)


__all__ = [
    "ScraperError",
    "ScraperConnectionError",
    "ScraperHTTPError",
    "ScraperRateLimitError",
    "ScraperParsingError",
    "ScraperTimeoutError",
]
