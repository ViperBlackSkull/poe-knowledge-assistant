"""
Scraping job manager for the POE Knowledge Assistant.

Manages a priority-based job queue for scraping operations with rate limiting,
concurrency controls, status tracking, and job cancellation.

Usage::

    from src.services.job_manager import ScrapingJobManager, get_job_manager

    # Create a job manager
    manager = ScrapingJobManager()

    # Add a job to the queue
    job = manager.add_job(
        name="Scrape Unique Weapons",
        job_type="category",
        url="https://poedb.tw/us/Unique_Weapons",
        priority=5,
    )

    # Check job status
    status = manager.get_job_status(job["job_id"])

    # Cancel a job
    manager.cancel_job(job["job_id"])

    # Get all jobs
    all_jobs = manager.list_jobs()

    # Run the processing loop (typically in a background task)
    await manager.process_queue()
"""

import asyncio
import logging
import time
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional

from src.config import get_settings

logger = logging.getLogger(__name__)


# ------------------------------------------------------------------
# Enums
# ------------------------------------------------------------------


class JobStatus(str, Enum):
    """Status of a scraping job."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class JobType(str, Enum):
    """Type of scraping job."""
    CATEGORY = "category"
    ITEM_DETAIL = "item_detail"
    BATCH_ITEMS = "batch_items"
    FULL_CATEGORY = "full_category"


class JobPriority(int, Enum):
    """Job priority levels (lower number = higher priority)."""
    CRITICAL = 1
    HIGH = 3
    NORMAL = 5
    LOW = 7
    BACKGROUND = 10


# ------------------------------------------------------------------
# Job data structure
# ------------------------------------------------------------------


class ScrapingJob:
    """
    Represents a single scraping job in the queue.

    Attributes:
        job_id: Unique job identifier.
        name: Human-readable job name.
        job_type: Type of scraping job.
        url: Target URL or base URL for the job.
        priority: Priority level (lower = higher priority).
        status: Current job status.
        created_at: When the job was created.
        started_at: When the job started running.
        completed_at: When the job completed/failed/was cancelled.
        progress: Progress percentage (0-100).
        result: Result data from the job execution.
        error: Error message if the job failed.
        metadata: Additional metadata for the job.
        retries: Number of retry attempts so far.
        max_retries: Maximum number of retries allowed.
        urls: List of URLs for batch jobs.
        game: Game version (poe1 or poe2).
        category: Category name if applicable.
    """

    def __init__(
        self,
        job_id: str,
        name: str,
        job_type: JobType,
        url: Optional[str] = None,
        priority: int = JobPriority.NORMAL,
        max_retries: int = 3,
        metadata: Optional[Dict[str, Any]] = None,
        urls: Optional[List[str]] = None,
        game: Optional[str] = None,
        category: Optional[str] = None,
    ):
        self.job_id = job_id
        self.name = name
        self.job_type = job_type
        self.url = url
        self.priority = priority
        self.status = JobStatus.PENDING
        self.created_at = datetime.now(timezone.utc).isoformat()
        self.started_at: Optional[str] = None
        self.completed_at: Optional[str] = None
        self.progress: float = 0.0
        self.result: Optional[Dict[str, Any]] = None
        self.error: Optional[str] = None
        self.metadata = metadata or {}
        self.retries: int = 0
        self.max_retries = max_retries
        self.urls = urls or []
        self.game = game
        self.category = category
        self._cancel_event: asyncio.Event = asyncio.Event()

    def to_dict(self) -> Dict[str, Any]:
        """Convert job to a dictionary for API responses."""
        return {
            "job_id": self.job_id,
            "name": self.name,
            "job_type": self.job_type.value,
            "url": self.url,
            "priority": self.priority,
            "status": self.status.value,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "progress": self.progress,
            "result": self.result,
            "error": self.error,
            "metadata": self.metadata,
            "retries": self.retries,
            "max_retries": self.max_retries,
            "urls_count": len(self.urls),
            "game": self.game,
            "category": self.category,
        }

    def __lt__(self, other: "ScrapingJob") -> bool:
        """Compare jobs by priority for queue ordering."""
        if self.priority == other.priority:
            # Earlier created jobs have higher priority at same level
            return self.created_at < other.created_at
        return self.priority < other.priority


# ------------------------------------------------------------------
# Rate Limiter
# ------------------------------------------------------------------


class RateLimiter:
    """
    Token bucket rate limiter for controlling request frequency.

    Attributes:
        max_requests: Maximum number of requests in the time window.
        window_seconds: Time window in seconds.
    """

    def __init__(
        self,
        max_requests: int = 10,
        window_seconds: float = 60.0,
    ):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._timestamps: List[float] = []
        self._lock = asyncio.Lock()
        self._logger = logging.getLogger(self.__class__.__name__)

    async def acquire(self) -> float:
        """
        Acquire permission to make a request.

        Blocks until a request slot is available.

        Returns:
            Wait time in seconds (0 if no wait was needed).
        """
        async with self._lock:
            now = time.monotonic()
            # Remove timestamps outside the current window
            cutoff = now - self.window_seconds
            self._timestamps = [
                ts for ts in self._timestamps if ts > cutoff
            ]

            if len(self._timestamps) >= self.max_requests:
                # Calculate wait time until the oldest request expires
                oldest = self._timestamps[0]
                wait_time = oldest + self.window_seconds - now
                if wait_time > 0:
                    self._logger.debug(
                        "Rate limit reached. Waiting %.2fs", wait_time
                    )
                    await asyncio.sleep(wait_time)
                    return wait_time

            self._timestamps.append(time.monotonic())
            return 0.0

    def get_status(self) -> Dict[str, Any]:
        """Get current rate limiter status."""
        now = time.monotonic()
        cutoff = now - self.window_seconds
        active = [ts for ts in self._timestamps if ts > cutoff]
        return {
            "max_requests": self.max_requests,
            "window_seconds": self.window_seconds,
            "requests_in_window": len(active),
            "remaining_requests": max(0, self.max_requests - len(active)),
        }


# ------------------------------------------------------------------
# Scraping Job Manager
# ------------------------------------------------------------------


class ScrapingJobManager:
    """
    Manages a priority-based queue of scraping jobs with rate limiting,
    concurrency controls, and comprehensive status tracking.

    This class provides:
    - Priority-based job queue with FIFO ordering at same priority
    - Configurable rate limiting (token bucket algorithm)
    - Concurrent job execution limits
    - Job status tracking (pending, running, completed, failed, cancelled)
    - Job cancellation with graceful shutdown
    - Automatic retry on failure
    - Comprehensive logging of all job activities
    - Job history and statistics

    Usage::

        manager = ScrapingJobManager(
            max_concurrent_jobs=3,
            rate_limit_requests=10,
            rate_limit_window=60.0,
        )

        # Add a job
        job = manager.add_job(
            name="Scrape Weapons",
            job_type="category",
            url="https://poedb.tw/us/Unique_Weapons",
            priority=5,
        )

        # Start processing
        await manager.start()

        # Check status
        status = manager.get_job_status(job["job_id"])

        # Stop processing
        await manager.stop()
    """

    def __init__(
        self,
        max_concurrent_jobs: int = 0,
        rate_limit_requests: int = 0,
        rate_limit_window: float = 0.0,
        default_max_retries: int = 3,
        job_timeout_seconds: float = 300.0,
    ):
        """
        Initialize the scraping job manager.

        Args:
            max_concurrent_jobs: Maximum number of concurrent running jobs.
                Defaults to the scraper concurrent_requests setting.
            rate_limit_requests: Max requests per window. Defaults to config.
            rate_limit_window: Rate limit window in seconds. Defaults to config.
            default_max_retries: Default max retries for jobs.
            job_timeout_seconds: Timeout for individual job execution.
        """
        settings = get_settings()

        self.max_concurrent_jobs = (
            max_concurrent_jobs or settings.scraper.concurrent_requests
        )
        self.default_max_retries = default_max_retries
        self.job_timeout_seconds = job_timeout_seconds

        # Job storage
        self._jobs: Dict[str, ScrapingJob] = {}
        self._pending_queue: asyncio.PriorityQueue = asyncio.PriorityQueue()
        self._running_jobs: Dict[str, asyncio.Task] = {}

        # Rate limiter
        self.rate_limiter = RateLimiter(
            rate_limit_requests or 30,
            rate_limit_window or 60.0,
        )

        # Semaphore for concurrency control
        self._semaphore = asyncio.Semaphore(self.max_concurrent_jobs)

        # State
        self._running = False
        self._processing_task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()

        # Statistics
        self._stats = {
            "total_added": 0,
            "total_completed": 0,
            "total_failed": 0,
            "total_cancelled": 0,
        }

        self._logger = logging.getLogger(self.__class__.__name__)
        self._logger.info(
            "ScrapingJobManager initialized: max_concurrent=%d, "
            "rate_limit=%d/%.1fs",
            self.max_concurrent_jobs,
            self.rate_limiter.max_requests,
            self.rate_limiter.window_seconds,
        )

    # ------------------------------------------------------------------
    # Job lifecycle
    # ------------------------------------------------------------------

    def add_job(
        self,
        name: str,
        job_type: str = "category",
        url: Optional[str] = None,
        priority: int = JobPriority.NORMAL,
        max_retries: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None,
        urls: Optional[List[str]] = None,
        game: Optional[str] = None,
        category: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Add a new scraping job to the queue.

        Args:
            name: Human-readable name for the job.
            job_type: Type of scraping job ('category', 'item_detail',
                'batch_items', 'full_category').
            url: Target URL for the job.
            priority: Priority level (lower = higher priority).
            max_retries: Max retry attempts (uses default if not set).
            metadata: Additional metadata dictionary.
            urls: List of URLs for batch jobs.
            game: Game version ('poe1' or 'poe2').
            category: Category name.

        Returns:
            Dictionary with job_id and initial status.

        Raises:
            ValueError: If required parameters are missing.
        """
        if not name or not name.strip():
            raise ValueError("Job name cannot be empty")

        # Validate job_type
        try:
            job_type_enum = JobType(job_type)
        except ValueError:
            valid = [t.value for t in JobType]
            raise ValueError(
                f"Invalid job_type '{job_type}'. Must be one of: {valid}"
            )

        job_id = f"job-{job_type}-{uuid.uuid4().hex[:8]}"

        job = ScrapingJob(
            job_id=job_id,
            name=name.strip(),
            job_type=job_type_enum,
            url=url,
            priority=priority,
            max_retries=max_retries or self.default_max_retries,
            metadata=metadata,
            urls=urls or [],
            game=game,
            category=category,
        )

        self._jobs[job_id] = job
        self._pending_queue.put_nowait(job)
        self._stats["total_added"] += 1

        self._logger.info(
            "Job added: id=%s, name='%s', type=%s, priority=%d, url=%s",
            job_id,
            name,
            job_type,
            priority,
            url or "N/A",
        )

        return {
            "job_id": job_id,
            "status": job.status.value,
            "message": f"Job '{name}' added to queue",
        }

    def get_job_status(self, job_id: str) -> Optional[Dict[str, Any]]:
        """
        Get the status of a specific job.

        Args:
            job_id: The job identifier.

        Returns:
            Job status dictionary, or None if job not found.
        """
        job = self._jobs.get(job_id)
        if job is None:
            return None
        return job.to_dict()

    def list_jobs(
        self,
        status: Optional[str] = None,
        job_type: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """
        List jobs with optional filtering and pagination.

        Args:
            status: Filter by status (pending, running, completed, failed, cancelled).
            job_type: Filter by job type.
            limit: Maximum number of jobs to return.
            offset: Number of jobs to skip.

        Returns:
            Dictionary with jobs list, total count, and pagination info.
        """
        jobs = list(self._jobs.values())

        # Apply filters
        if status:
            try:
                status_enum = JobStatus(status)
            except ValueError:
                valid = [s.value for s in JobStatus]
                raise ValueError(
                    f"Invalid status '{status}'. Must be one of: {valid}"
                )
            jobs = [j for j in jobs if j.status == status_enum]

        if job_type:
            try:
                type_enum = JobType(job_type)
            except ValueError:
                valid = [t.value for t in JobType]
                raise ValueError(
                    f"Invalid job_type '{job_type}'. Must be one of: {valid}"
                )
            jobs = [j for j in jobs if j.job_type == type_enum]

        # Sort by creation time (newest first)
        jobs.sort(key=lambda j: j.created_at, reverse=True)

        total = len(jobs)
        paginated = jobs[offset : offset + limit]

        return {
            "jobs": [j.to_dict() for j in paginated],
            "total": total,
            "limit": limit,
            "offset": offset,
            "returned": len(paginated),
        }

    def cancel_job(self, job_id: str) -> Dict[str, Any]:
        """
        Cancel a pending or running job.

        For running jobs, this sets a cancellation flag that the job
        executor checks periodically. The job will transition to
        CANCELLED status once the current operation completes.

        Args:
            job_id: The job identifier.

        Returns:
            Dictionary with cancellation result.

        Raises:
            ValueError: If the job is not found or cannot be cancelled.
        """
        job = self._jobs.get(job_id)
        if job is None:
            raise ValueError(f"Job '{job_id}' not found")

        if job.status == JobStatus.COMPLETED:
            raise ValueError(f"Job '{job_id}' is already completed")

        if job.status == JobStatus.CANCELLED:
            raise ValueError(f"Job '{job_id}' is already cancelled")

        if job.status == JobStatus.PENDING:
            # Pending jobs can be cancelled immediately
            job.status = JobStatus.CANCELLED
            job.completed_at = datetime.now(timezone.utc).isoformat()
            job.error = "Job cancelled by user"
            self._stats["total_cancelled"] += 1

            self._logger.info("Job cancelled (was pending): id=%s", job_id)

        elif job.status == JobStatus.RUNNING:
            # Signal the running job to stop
            job._cancel_event.set()
            job.status = JobStatus.CANCELLED
            job.completed_at = datetime.now(timezone.utc).isoformat()
            job.error = "Job cancelled by user while running"
            self._stats["total_cancelled"] += 1

            # Cancel the asyncio task if it exists
            task = self._running_jobs.get(job_id)
            if task and not task.done():
                task.cancel()

            self._logger.info("Job cancelled (was running): id=%s", job_id)

        return {
            "job_id": job_id,
            "status": job.status.value,
            "message": f"Job '{job.name}' cancelled successfully",
        }

    def is_job_cancelled(self, job_id: str) -> bool:
        """
        Check if a job has been cancelled.

        This is used by job executors to check for cancellation.

        Args:
            job_id: The job identifier.

        Returns:
            True if the job's cancel event is set.
        """
        job = self._jobs.get(job_id)
        if job is None:
            return False
        return job._cancel_event.is_set()

    # ------------------------------------------------------------------
    # Queue processing
    # ------------------------------------------------------------------

    async def start(self) -> None:
        """
        Start the job processing loop.

        This creates a background task that continuously processes
        jobs from the priority queue.
        """
        if self._running:
            self._logger.warning("Job manager is already running")
            return

        self._running = True
        self._processing_task = asyncio.create_task(self._process_queue())
        self._logger.info("Job manager started")

    async def stop(self) -> None:
        """
        Stop the job processing loop gracefully.

        Running jobs are allowed to complete. Pending jobs remain
        in the queue.
        """
        if not self._running:
            return

        self._running = False

        if self._processing_task and not self._processing_task.done():
            self._processing_task.cancel()
            try:
                await self._processing_task
            except asyncio.CancelledError:
                pass

        self._logger.info("Job manager stopped")

    async def _process_queue(self) -> None:
        """
        Main processing loop that pulls jobs from the priority queue
        and dispatches them for execution.
        """
        self._logger.info("Queue processing started")

        while self._running:
            try:
                # Wait for a job from the queue
                try:
                    job = await asyncio.wait_for(
                        self._pending_queue.get(), timeout=1.0
                    )
                except asyncio.TimeoutError:
                    continue

                # Skip cancelled jobs
                if job.status == JobStatus.CANCELLED:
                    self._logger.debug(
                        "Skipping cancelled job: id=%s", job.job_id
                    )
                    continue

                # Acquire semaphore for concurrency control
                await self._semaphore.acquire()

                # Apply rate limiting
                await self.rate_limiter.acquire()

                # Create task for the job
                task = asyncio.create_task(self._execute_job(job))
                self._running_jobs[job.job_id] = task

                # Add callback to release semaphore when done
                task.add_done_callback(
                    lambda t, jid=job.job_id: self._on_job_done(jid)
                )

            except asyncio.CancelledError:
                self._logger.info("Queue processing cancelled")
                break
            except Exception as e:
                self._logger.error("Error in queue processing: %s", e)
                await asyncio.sleep(1.0)

        self._logger.info("Queue processing stopped")

    def _on_job_done(self, job_id: str) -> None:
        """Callback when a job task completes."""
        self._semaphore.release()
        self._running_jobs.pop(job_id, None)

    async def _execute_job(self, job: ScrapingJob) -> None:
        """
        Execute a single scraping job.

        Args:
            job: The job to execute.
        """
        job.status = JobStatus.RUNNING
        job.started_at = datetime.now(timezone.utc).isoformat()

        self._logger.info(
            "Executing job: id=%s, name='%s', type=%s",
            job.job_id,
            job.name,
            job.job_type.value,
        )

        try:
            # Execute with timeout
            result = await asyncio.wait_for(
                self._run_job_handler(job),
                timeout=self.job_timeout_seconds,
            )

            # Check if job was cancelled during execution
            if job._cancel_event.is_set():
                job.status = JobStatus.CANCELLED
                job.error = "Job cancelled during execution"
                self._stats["total_cancelled"] += 1
            else:
                job.status = JobStatus.COMPLETED
                job.progress = 100.0
                job.result = result
                self._stats["total_completed"] += 1

            job.completed_at = datetime.now(timezone.utc).isoformat()

            self._logger.info(
                "Job completed: id=%s, status=%s",
                job.job_id,
                job.status.value,
            )

        except asyncio.TimeoutError:
            job.status = JobStatus.FAILED
            job.error = f"Job timed out after {self.job_timeout_seconds}s"
            job.completed_at = datetime.now(timezone.utc).isoformat()
            self._stats["total_failed"] += 1

            self._logger.error(
                "Job timed out: id=%s, timeout=%ds",
                job.job_id,
                self.job_timeout_seconds,
            )

        except asyncio.CancelledError:
            job.status = JobStatus.CANCELLED
            job.error = "Job cancelled"
            job.completed_at = datetime.now(timezone.utc).isoformat()
            self._stats["total_cancelled"] += 1

            self._logger.info("Job cancelled: id=%s", job.job_id)

        except Exception as e:
            # Attempt retry if retries remain
            if job.retries < job.max_retries:
                job.retries += 1
                job.status = JobStatus.PENDING
                job.progress = 0.0
                job.started_at = None
                job.completed_at = None

                self._logger.warning(
                    "Job failed (retry %d/%d): id=%s, error=%s",
                    job.retries,
                    job.max_retries,
                    job.job_id,
                    str(e),
                )

                # Re-queue the job
                await self._pending_queue.put(job)
            else:
                job.status = JobStatus.FAILED
                job.error = str(e)
                job.completed_at = datetime.now(timezone.utc).isoformat()
                self._stats["total_failed"] += 1

                self._logger.error(
                    "Job failed permanently: id=%s, error=%s, retries=%d",
                    job.job_id,
                    str(e),
                    job.retries,
                )

    async def _run_job_handler(self, job: ScrapingJob) -> Dict[str, Any]:
        """
        Run the actual job handler based on job type.

        This method dispatches to the appropriate handler for each
        job type. In a production system, these handlers would invoke
        the actual scrapers. Here we provide a framework that simulates
        the scraping operation.

        Args:
            job: The job to execute.

        Returns:
            Result dictionary from the handler.
        """
        if job.job_type == JobType.CATEGORY:
            return await self._handle_category_job(job)
        elif job.job_type == JobType.ITEM_DETAIL:
            return await self._handle_item_detail_job(job)
        elif job.job_type == JobType.BATCH_ITEMS:
            return await self._handle_batch_items_job(job)
        elif job.job_type == JobType.FULL_CATEGORY:
            return await self._handle_full_category_job(job)
        else:
            raise ValueError(f"Unknown job type: {job.job_type}")

    async def _handle_category_job(self, job: ScrapingJob) -> Dict[str, Any]:
        """
        Handle a category scraping job.

        Args:
            job: The category job to execute.

        Returns:
            Result with scraped category data.
        """
        from src.services.scraper import CategoryScraper

        self._logger.info(
            "Starting category scrape: url=%s", job.url
        )

        async with CategoryScraper() as scraper:
            result = await scraper.scrape_category(
                category_name=job.category or job.name,
                url=job.url or "",
            )

        # Update progress
        job.progress = 100.0

        return {
            "items_found": result.get("total_items", 0),
            "pages_scraped": result.get("pages_scraped", 0),
            "category": result.get("category"),
        }

    async def _handle_item_detail_job(self, job: ScrapingJob) -> Dict[str, Any]:
        """
        Handle an item detail scraping job.

        Args:
            job: The item detail job to execute.

        Returns:
            Result with scraped item data.
        """
        from src.services.scraper import ItemDetailScraper

        self._logger.info(
            "Starting item detail scrape: url=%s", job.url
        )

        async with ItemDetailScraper() as scraper:
            result = await scraper.scrape_item(
                url=job.url or "",
                category=job.category,
            )

        job.progress = 100.0

        return {
            "item_name": result.get("name"),
            "item_type": result.get("item_type"),
        }

    async def _handle_batch_items_job(self, job: ScrapingJob) -> Dict[str, Any]:
        """
        Handle a batch item scraping job.

        Args:
            job: The batch job to execute.

        Returns:
            Result with aggregated batch data.
        """
        from src.services.scraper import ItemDetailScraper

        urls = job.urls
        if not urls and job.url:
            urls = [job.url]

        self._logger.info(
            "Starting batch item scrape: %d items", len(urls)
        )

        results = []
        errors = []

        async with ItemDetailScraper() as scraper:
            for i, url in enumerate(urls):
                # Check for cancellation
                if job._cancel_event.is_set():
                    job.error = "Cancelled during batch processing"
                    break

                try:
                    # Rate limit between items
                    await self.rate_limiter.acquire()

                    result = await scraper.scrape_item(
                        url=url,
                        category=job.category,
                    )
                    results.append(result)

                except Exception as e:
                    errors.append({"url": url, "error": str(e)})
                    self._logger.warning(
                        "Failed to scrape item %s: %s", url, e
                    )

                # Update progress
                job.progress = ((i + 1) / len(urls)) * 100.0

        return {
            "total": len(urls),
            "succeeded": len(results),
            "failed": len(errors),
            "errors": errors,
        }

    async def _handle_full_category_job(self, job: ScrapingJob) -> Dict[str, Any]:
        """
        Handle a full category scraping job (category + all item details).

        Args:
            job: The full category job to execute.

        Returns:
            Result with all scraped data.
        """
        from src.services.scraper import CategoryScraper, ItemDetailScraper

        self._logger.info(
            "Starting full category scrape: url=%s", job.url
        )

        # Step 1: Scrape category to get item URLs
        async with CategoryScraper() as cat_scraper:
            cat_result = await cat_scraper.scrape_category(
                category_name=job.category or job.name,
                url=job.url or "",
            )

        item_urls = [
            item.get("url", "")
            for item in cat_result.get("items", [])
            if item.get("url")
        ]

        job.progress = 30.0

        # Step 2: Scrape each item detail
        all_items = []
        errors = []

        async with ItemDetailScraper() as item_scraper:
            for i, url in enumerate(item_urls):
                # Check for cancellation
                if job._cancel_event.is_set():
                    job.error = "Cancelled during item detail scraping"
                    break

                try:
                    await self.rate_limiter.acquire()
                    result = await item_scraper.scrape_item(
                        url=url,
                        category=job.category,
                    )
                    all_items.append(result)

                except Exception as e:
                    errors.append({"url": url, "error": str(e)})

                # Update progress (30-100% range for items)
                item_progress = ((i + 1) / len(item_urls)) * 70.0
                job.progress = 30.0 + item_progress

        return {
            "category_items": cat_result.get("total_items", 0),
            "items_scraped": len(all_items),
            "items_failed": len(errors),
            "errors": errors,
        }

    # ------------------------------------------------------------------
    # Statistics and status
    # ------------------------------------------------------------------

    def get_stats(self) -> Dict[str, Any]:
        """
        Get job manager statistics.

        Returns:
            Dictionary with queue stats, rate limiter status, and counters.
        """
        pending_count = sum(
            1 for j in self._jobs.values() if j.status == JobStatus.PENDING
        )
        running_count = sum(
            1 for j in self._jobs.values() if j.status == JobStatus.RUNNING
        )
        completed_count = sum(
            1 for j in self._jobs.values() if j.status == JobStatus.COMPLETED
        )
        failed_count = sum(
            1 for j in self._jobs.values() if j.status == JobStatus.FAILED
        )
        cancelled_count = sum(
            1 for j in self._jobs.values() if j.status == JobStatus.CANCELLED
        )

        return {
            "is_running": self._running,
            "max_concurrent_jobs": self.max_concurrent_jobs,
            "queue_size": pending_count,
            "running_jobs": running_count,
            "completed_jobs": completed_count,
            "failed_jobs": failed_count,
            "cancelled_jobs": cancelled_count,
            "total_jobs": len(self._jobs),
            "rate_limiter": self.rate_limiter.get_status(),
            "stats": dict(self._stats),
            "job_timeout_seconds": self.job_timeout_seconds,
        }

    def clear_completed_jobs(self) -> Dict[str, int]:
        """
        Remove completed, failed, and cancelled jobs from history.

        Returns:
            Dictionary with the count of removed jobs.
        """
        to_remove = [
            jid
            for jid, j in self._jobs.items()
            if j.status in (JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED)
        ]

        for jid in to_remove:
            del self._jobs[jid]

        self._logger.info("Cleared %d finished jobs", len(to_remove))

        return {"cleared_count": len(to_remove)}

    def health_check(self) -> Dict[str, Any]:
        """
        Perform a health check on the job manager.

        Returns:
            Dictionary with health status information.
        """
        stats = self.get_stats()
        return {
            "status": "running" if self._running else "stopped",
            "queue_size": stats["queue_size"],
            "running_jobs": stats["running_jobs"],
            "total_processed": stats["stats"]["total_completed"],
            "rate_limiter_remaining": stats["rate_limiter"]["remaining_requests"],
            "message": (
                f"Job manager {'running' if self._running else 'stopped'}, "
                f"{stats['queue_size']} pending, "
                f"{stats['running_jobs']} running"
            ),
        }


# ------------------------------------------------------------------
# Global instance
# ------------------------------------------------------------------

_job_manager: Optional[ScrapingJobManager] = None


def get_job_manager() -> ScrapingJobManager:
    """
    Get the global ScrapingJobManager instance.

    Returns:
        ScrapingJobManager instance.
    """
    global _job_manager
    if _job_manager is None:
        _job_manager = ScrapingJobManager()
    return _job_manager


def check_job_manager_health() -> Dict[str, Any]:
    """
    Check job manager health status.

    Returns:
        Dictionary with health status information.
    """
    manager = get_job_manager()
    return manager.health_check()


__all__ = [
    "JobStatus",
    "JobType",
    "JobPriority",
    "ScrapingJob",
    "RateLimiter",
    "ScrapingJobManager",
    "get_job_manager",
    "check_job_manager_health",
]
