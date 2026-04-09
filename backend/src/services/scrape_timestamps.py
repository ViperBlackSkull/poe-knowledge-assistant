"""
Last scrape timestamp storage for the POE Knowledge Assistant.

Provides file-based persistence of the last successful scrape timestamp
for each game version (PoE1 and PoE2).  The timestamps are stored in a
JSON file under the ``data/`` directory and survive application restarts.

The module is designed to be called from the job manager whenever a scrape
job completes successfully so that the front-end and other consumers can
determine data freshness without querying the job history.

Usage::

    from src.services.scrape_timestamps import get_scrape_timestamps, update_timestamp

    # Record a successful scrape
    update_timestamp("poe1")

    # Read timestamps
    ts = get_scrape_timestamps()
    # {"poe1": {"last_scraped_at": "2026-04-09T12:34:56.789000+00:00", ...}, ...}

    # Read a single game version
    ts = get_scrape_timestamp("poe2")
"""

import json
import logging
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# ------------------------------------------------------------------
# Constants
# ------------------------------------------------------------------

_DEFAULT_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
_TIMESTAMP_FILE_NAME = "scrape_timestamps.json"

_VALID_GAME_VERSIONS = ("poe1", "poe2")


# ------------------------------------------------------------------
# Exceptions
# ------------------------------------------------------------------


class TimestampStorageError(Exception):
    """Base exception for timestamp storage errors."""


class TimestampReadError(TimestampStorageError):
    """Raised when timestamp data cannot be read."""


class TimestampWriteError(TimestampStorageError):
    """Raised when timestamp data cannot be written."""


# ------------------------------------------------------------------
# Internal helpers
# ------------------------------------------------------------------


def _default_timestamps() -> Dict[str, Any]:
    """
    Return the default (empty) timestamp structure.

    Returns:
        Dictionary with an entry for each supported game version.
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    return {
        "poe1": {
            "last_scraped_at": None,
            "last_successful_job_id": None,
            "items_scraped": 0,
            "categories_scraped": 0,
            "created_at": now_iso,
            "updated_at": None,
        },
        "poe2": {
            "last_scraped_at": None,
            "last_successful_job_id": None,
            "items_scraped": 0,
            "categories_scraped": 0,
            "created_at": now_iso,
            "updated_at": None,
        },
        "metadata": {
            "version": 1,
            "created_at": now_iso,
        },
    }


def _resolve_file_path(data_dir: Optional[str] = None) -> Path:
    """
    Resolve the full path to the timestamp JSON file.

    Args:
        data_dir: Optional override for the data directory.  When
            ``None`` the default ``data/`` directory relative to the
            project root is used.

    Returns:
        Absolute ``Path`` to the timestamp file.
    """
    base = Path(data_dir) if data_dir else _DEFAULT_DATA_DIR
    return base / _TIMESTAMP_FILE_NAME


def _read_file(path: Path) -> Dict[str, Any]:
    """
    Read and parse the timestamp JSON file.

    If the file does not exist or is corrupt, the default structure is
    returned so that callers always receive a valid dictionary.

    Args:
        path: Path to the JSON file.

    Returns:
        Parsed timestamp dictionary.
    """
    if not path.exists():
        logger.debug("Timestamp file not found at %s -- returning defaults", path)
        return _default_timestamps()

    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except json.JSONDecodeError as exc:
        logger.warning("Corrupt timestamp file at %s: %s -- returning defaults", path, exc)
        return _default_timestamps()
    except OSError as exc:
        logger.warning("Cannot read timestamp file at %s: %s -- returning defaults", path, exc)
        return _default_timestamps()

    # Ensure all game keys exist (handles forward-compat additions).
    defaults = _default_timestamps()
    for game in _VALID_GAME_VERSIONS:
        if game not in data:
            data[game] = defaults[game]
    if "metadata" not in data:
        data["metadata"] = defaults["metadata"]

    return data


def _write_file(path: Path, data: Dict[str, Any]) -> None:
    """
    Atomically write the timestamp data to a JSON file.

    The file is written to a temporary file first and then renamed so
    that concurrent readers never see a partially-written file.

    Args:
        path: Destination path.
        data: Timestamp dictionary to persist.

    Raises:
        TimestampWriteError: If the file cannot be written.
    """
    try:
        path.parent.mkdir(parents=True, exist_ok=True)

        tmp_path = path.with_suffix(".tmp")
        with open(tmp_path, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2, ensure_ascii=False, sort_keys=False)

        # Atomic rename (same filesystem).
        os.replace(tmp_path, path)
        logger.debug("Timestamps written to %s", path)
    except OSError as exc:
        raise TimestampWriteError(
            f"Failed to write timestamp file at {path}: {exc}"
        ) from exc


# ------------------------------------------------------------------
# Public API
# ------------------------------------------------------------------


class ScrapeTimestampStore:
    """
    Thread-safe, file-backed store for last-scrape timestamps.

    A thin wrapper around the module-level helper functions that
    serialises concurrent access using a ``threading.Lock``.  This
    ensures correctness when multiple async coroutines or threads
    attempt to read/write timestamps simultaneously.

    Args:
        data_dir: Optional override for the data directory.
    """

    def __init__(self, data_dir: Optional[str] = None):
        self._file_path = _resolve_file_path(data_dir)
        self._lock = threading.Lock()
        self._logger = logging.getLogger(self.__class__.__name__)
        self._logger.info("ScrapeTimestampStore initialized: file=%s", self._file_path)

    # -- Read operations --------------------------------------------------

    def get_all_timestamps(self) -> Dict[str, Any]:
        """
        Return timestamps for all game versions.

        Returns:
            Full timestamp dictionary including metadata.
        """
        with self._lock:
            return _read_file(self._file_path)

    def get_timestamp(self, game: str) -> Optional[Dict[str, Any]]:
        """
        Return the timestamp data for a single game version.

        Args:
            game: Game version identifier (``'poe1'`` or ``'poe2'``).

        Returns:
            Timestamp dictionary for the requested game, or ``None``
            if the game version is not recognised.

        Raises:
            ValueError: If *game* is not a valid game version.
        """
        game = self._validate_game(game)
        with self._lock:
            data = _read_file(self._file_path)
            return data.get(game)

    def get_last_scraped_at(self, game: str) -> Optional[str]:
        """
        Return the ISO-8601 timestamp of the last successful scrape.

        Args:
            game: Game version (``'poe1'`` or ``'poe2'``).

        Returns:
            ISO-8601 datetime string, or ``None`` if never scraped.
        """
        entry = self.get_timestamp(game)
        if entry is None:
            return None
        return entry.get("last_scraped_at")

    # -- Write operations -------------------------------------------------

    def update_timestamp(
        self,
        game: str,
        job_id: Optional[str] = None,
        items_scraped: int = 0,
        categories_scraped: int = 0,
        scraped_at: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Record a successful scrape for the given game version.

        Args:
            game: Game version (``'poe1'`` or ``'poe2'``).
            job_id: Optional job identifier that completed.
            items_scraped: Number of items scraped in this run.
            categories_scraped: Number of categories scraped in this run.
            scraped_at: Optional ISO-8601 timestamp.  When ``None``,
                the current UTC time is used.

        Returns:
            Updated timestamp entry for the game version.

        Raises:
            ValueError: If *game* is not a valid game version.
            TimestampWriteError: If the data cannot be persisted.
        """
        game = self._validate_game(game)

        now_iso = scraped_at or datetime.now(timezone.utc).isoformat()

        with self._lock:
            data = _read_file(self._file_path)

            existing = data.get(game, {})
            previous_items = existing.get("items_scraped", 0)
            previous_categories = existing.get("categories_scraped", 0)

            data[game] = {
                "last_scraped_at": now_iso,
                "last_successful_job_id": job_id,
                "items_scraped": previous_items + items_scraped,
                "categories_scraped": previous_categories + categories_scraped,
                "created_at": existing.get("created_at", now_iso),
                "updated_at": now_iso,
            }

            data["metadata"]["updated_at"] = now_iso

            _write_file(self._file_path, data)

        self._logger.info(
            "Updated scrape timestamp for %s: scraped_at=%s, job_id=%s",
            game,
            now_iso,
            job_id,
        )
        return data[game]

    def reset_timestamp(self, game: str) -> Dict[str, Any]:
        """
        Reset the timestamp for a specific game version.

        Args:
            game: Game version (``'poe1'`` or ``'poe2'``).

        Returns:
            Reset timestamp entry.

        Raises:
            ValueError: If *game* is not a valid game version.
            TimestampWriteError: If the data cannot be persisted.
        """
        game = self._validate_game(game)
        now_iso = datetime.now(timezone.utc).isoformat()

        with self._lock:
            data = _read_file(self._file_path)
            data[game] = {
                "last_scraped_at": None,
                "last_successful_job_id": None,
                "items_scraped": 0,
                "categories_scraped": 0,
                "created_at": now_iso,
                "updated_at": None,
            }
            data["metadata"]["updated_at"] = now_iso
            _write_file(self._file_path, data)

        self._logger.info("Reset scrape timestamp for %s", game)
        return data[game]

    def reset_all_timestamps(self) -> Dict[str, Any]:
        """
        Reset timestamps for all game versions.

        Returns:
            Fresh default timestamp dictionary.
        """
        with self._lock:
            data = _default_timestamps()
            _write_file(self._file_path, data)

        self._logger.info("Reset all scrape timestamps")
        return data

    # -- Health check -----------------------------------------------------

    def health_check(self) -> Dict[str, Any]:
        """
        Check the health of the timestamp storage.

        Returns:
            Dictionary with health status and file information.
        """
        try:
            file_exists = self._file_path.exists()
            file_size = self._file_path.stat().st_size if file_exists else 0

            data = self.get_all_timestamps()
            poe1_scraped = data.get("poe1", {}).get("last_scraped_at") is not None
            poe2_scraped = data.get("poe2", {}).get("last_scraped_at") is not None

            return {
                "status": "healthy",
                "file_path": str(self._file_path),
                "file_exists": file_exists,
                "file_size_bytes": file_size,
                "poe1_has_data": poe1_scraped,
                "poe2_has_data": poe2_scraped,
                "message": "Timestamp storage is operational",
            }
        except Exception as exc:
            return {
                "status": "error",
                "error": str(exc),
                "message": f"Timestamp storage health check failed: {exc}",
            }

    # -- Validation -------------------------------------------------------

    @staticmethod
    def _validate_game(game: str) -> str:
        """
        Validate and normalise a game version string.

        Args:
            game: Raw game version string.

        Returns:
            Lowercased, validated game version.

        Raises:
            ValueError: If *game* is not recognised.
        """
        if not game:
            raise ValueError("Game version must not be empty")
        normalised = game.lower().strip()
        if normalised not in _VALID_GAME_VERSIONS:
            raise ValueError(
                f"Invalid game version '{game}'. Must be one of: {list(_VALID_GAME_VERSIONS)}"
            )
        return normalised


# ------------------------------------------------------------------
# Singleton / module-level convenience
# ------------------------------------------------------------------

_store: Optional[ScrapeTimestampStore] = None


def get_timestamp_store() -> ScrapeTimestampStore:
    """
    Get the global :class:`ScrapeTimestampStore` instance.

    Returns:
        Cached ``ScrapeTimestampStore`` singleton.
    """
    global _store
    if _store is None:
        _store = ScrapeTimestampStore()
    return _store


def get_scrape_timestamps() -> Dict[str, Any]:
    """
    Retrieve timestamps for all game versions.

    Convenience function that delegates to the global store.

    Returns:
        Full timestamp dictionary.
    """
    return get_timestamp_store().get_all_timestamps()


def get_scrape_timestamp(game: str) -> Optional[Dict[str, Any]]:
    """
    Retrieve the timestamp data for a single game version.

    Args:
        game: ``'poe1'`` or ``'poe2'``.

    Returns:
        Timestamp dictionary for the game, or ``None``.
    """
    return get_timestamp_store().get_timestamp(game)


def update_timestamp(
    game: str,
    job_id: Optional[str] = None,
    items_scraped: int = 0,
    categories_scraped: int = 0,
    scraped_at: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Record a successful scrape for the given game version.

    Convenience function that delegates to the global store.

    Args:
        game: ``'poe1'`` or ``'poe2'``.
        job_id: Optional job identifier.
        items_scraped: Items scraped in this run.
        categories_scraped: Categories scraped in this run.
        scraped_at: Optional ISO-8601 timestamp string.

    Returns:
        Updated timestamp entry.
    """
    return get_timestamp_store().update_timestamp(
        game=game,
        job_id=job_id,
        items_scraped=items_scraped,
        categories_scraped=categories_scraped,
        scraped_at=scraped_at,
    )


def check_timestamp_storage_health() -> Dict[str, Any]:
    """
    Check the health of the timestamp storage.

    Returns:
        Health status dictionary.
    """
    return get_timestamp_store().health_check()


__all__ = [
    "ScrapeTimestampStore",
    "TimestampStorageError",
    "TimestampReadError",
    "TimestampWriteError",
    "get_timestamp_store",
    "get_scrape_timestamps",
    "get_scrape_timestamp",
    "update_timestamp",
    "check_timestamp_storage_health",
]
