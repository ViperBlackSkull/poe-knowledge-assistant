"""
Scraper models for data ingestion.
Handles scraped data from poedb.tw and other sources.
"""
from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel, Field, field_validator, HttpUrl


class Game(str, Enum):
    """Supported Path of Exile games."""
    POE1 = "poe1"
    POE2 = "poe2"


class ItemType(str, Enum):
    """Types of items in Path of Exile."""
    WEAPON = "weapon"
    ARMOR = "armor"
    ACCESSORY = "accessory"
    FLASK = "flask"
    GEM = "gem"
    JEWEL = "jewel"
    CURRENCY = "currency"
    MAP = "map"
    DIVINATION_CARD = "divination_card"
    UNIQUE = "unique"
    SKILL = "skill"
    PASSIVE = "passive"
    ASCENDANCY = "ascendancy"
    BOSS = "boss"
    AREA = "area"
    MECHANIC = "mechanic"
    OTHER = "other"


class PoECategory(BaseModel):
    """
    Model for Path of Exile item categories.

    Attributes:
        name: Category name
        url: Category URL on poedb.tw
        description: Category description
        item_count: Number of items in category
        game: Which game this category belongs to
        parent_category: Parent category name (if nested)
        children: Sub-categories (if any)
    """
    name: str = Field(
        ...,
        description="Category name",
        min_length=1,
        max_length=200
    )
    url: str = Field(
        ...,
        description="Category URL on poedb.tw"
    )
    description: Optional[str] = Field(
        default=None,
        description="Category description",
        max_length=1000
    )
    item_count: int = Field(
        default=0,
        description="Number of items in category",
        ge=0
    )
    game: Game = Field(
        ...,
        description="Which game this category belongs to"
    )
    parent_category: Optional[str] = Field(
        default=None,
        description="Parent category name (if nested)"
    )
    children: List["PoECategory"] = Field(
        default_factory=list,
        description="Sub-categories"
    )

    @field_validator("url")
    @classmethod
    def validate_url(cls, v):
        """Validate URL format."""
        if not v.startswith(("http://", "https://")):
            raise ValueError("URL must start with http:// or https://")
        return v

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "name": "Unique Weapons",
                    "url": "https://poedb.tw/us/Unique_Weapons",
                    "description": "All unique weapons in the game",
                    "item_count": 150,
                    "game": "poe2",
                    "parent_category": "Weapons",
                    "children": []
                }
            ]
        }
    }


class PoEItem(BaseModel):
    """
    Model for Path of Exile items.

    Represents items scraped from poedb.tw including
    weapons, armor, skills, and other game items.

    Attributes:
        name: Item name
        item_type: Type of item (weapon, armor, etc.)
        url: Item URL on poedb.tw
        game: Which game this item belongs to
        description: Item description or flavor text
        requirements: Item requirements (level, stats, etc.)
        properties: Item properties (damage, defenses, etc.)
        categories: Categories this item belongs to
        tags: Searchable tags
        image_url: URL to item image
        metadata: Additional metadata
        scraped_at: When this data was scraped
        source: Source website
    """
    name: str = Field(
        ...,
        description="Item name",
        min_length=1,
        max_length=200
    )
    item_type: ItemType = Field(
        ...,
        description="Type of item"
    )
    url: str = Field(
        ...,
        description="Item URL on poedb.tw"
    )
    game: Game = Field(
        ...,
        description="Which game this item belongs to"
    )
    description: Optional[str] = Field(
        default=None,
        description="Item description or flavor text",
        max_length=5000
    )
    requirements: Dict[str, str] = Field(
        default_factory=dict,
        description="Item requirements (level, stats, etc.)"
    )
    properties: Dict[str, str] = Field(
        default_factory=dict,
        description="Item properties (damage, defenses, etc.)"
    )
    categories: List[str] = Field(
        default_factory=list,
        description="Categories this item belongs to"
    )
    tags: List[str] = Field(
        default_factory=list,
        description="Searchable tags"
    )
    image_url: Optional[str] = Field(
        default=None,
        description="URL to item image"
    )
    metadata: Dict[str, str] = Field(
        default_factory=dict,
        description="Additional metadata"
    )
    scraped_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="When this data was scraped"
    )
    source: str = Field(
        default="poedb.tw",
        description="Source website"
    )

    @field_validator("url", "image_url")
    @classmethod
    def validate_urls(cls, v):
        """Validate URL format."""
        if v is None:
            return v
        if not v.startswith(("http://", "https://")):
            raise ValueError("URL must start with http:// or https://")
        return v

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "name": "Starforge",
                    "item_type": "weapon",
                    "url": "https://poedb.tw/us/Starforge",
                    "game": "poe1",
                    "description": "Two-Handed Sword with physical damage scaling",
                    "requirements": {
                        "Level": "67",
                        "Str": "113",
                        "Dex": "113"
                    },
                    "properties": {
                        "Physical Damage": "200-400",
                        "Attack Speed": "1.25"
                    },
                    "categories": ["Unique Weapons", "Two-Handed Swords"],
                    "tags": ["unique", "two_handed", "sword", "physical"],
                    "image_url": "https://poedb.tw/us/images/Starforge.png",
                    "metadata": {},
                    "scraped_at": "2024-01-15T10:30:00Z",
                    "source": "poedb.tw"
                }
            ]
        }
    }


class ScrapedData(BaseModel):
    """
    Container for scraped data from poedb.tw.

    Attributes:
        items: List of scraped items
        categories: List of scraped categories
        game: Which game this data is for
        source_url: Base source URL
        scraped_at: When the data was scraped
        total_items: Total number of items
        total_categories: Total number of categories
        errors: Any errors encountered during scraping
        metadata: Additional scraping metadata
    """
    items: List[PoEItem] = Field(
        default_factory=list,
        description="List of scraped items"
    )
    categories: List[PoECategory] = Field(
        default_factory=list,
        description="List of scraped categories"
    )
    game: Game = Field(
        ...,
        description="Which game this data is for"
    )
    source_url: str = Field(
        default="https://poedb.tw",
        description="Base source URL"
    )
    scraped_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="When the data was scraped"
    )
    total_items: int = Field(
        default=0,
        description="Total number of items",
        ge=0
    )
    total_categories: int = Field(
        default=0,
        description="Total number of categories",
        ge=0
    )
    errors: List[str] = Field(
        default_factory=list,
        description="Errors encountered during scraping"
    )
    metadata: Dict[str, str] = Field(
        default_factory=dict,
        description="Additional scraping metadata"
    )

    def __init__(self, **data):
        """Initialize and calculate totals."""
        super().__init__(**data)
        # Update totals based on actual lists
        if self.items:
            self.total_items = len(self.items)
        if self.categories:
            self.total_categories = len(self.categories)

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "items": [
                        {
                            "name": "Example Item",
                            "item_type": "weapon",
                            "url": "https://poedb.tw/us/Example_Item",
                            "game": "poe2"
                        }
                    ],
                    "categories": [
                        {
                            "name": "Weapons",
                            "url": "https://poedb.tw/us/Weapons",
                            "game": "poe2"
                        }
                    ],
                    "game": "poe2",
                    "source_url": "https://poedb.tw",
                    "scraped_at": "2024-01-15T10:30:00Z",
                    "total_items": 1,
                    "total_categories": 1,
                    "errors": [],
                    "metadata": {
                        "duration_seconds": "45",
                        "pages_scraped": "10"
                    }
                }
            ]
        }
    }


class ScrapeStatus(str, Enum):
    """Status of a scraping job."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ScrapeJob(BaseModel):
    """
    Model for tracking scraping jobs.

    Attributes:
        job_id: Unique job identifier
        status: Current job status
        game: Which game is being scraped
        started_at: When the job started
        completed_at: When the job completed
        items_scraped: Number of items scraped
        categories_scraped: Number of categories scraped
        errors: List of errors encountered
        progress: Progress percentage (0-100)
        message: Status message
    """
    job_id: str = Field(
        ...,
        description="Unique job identifier"
    )
    status: ScrapeStatus = Field(
        ...,
        description="Current job status"
    )
    game: Game = Field(
        ...,
        description="Which game is being scraped"
    )
    started_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="When the job started"
    )
    completed_at: Optional[datetime] = Field(
        default=None,
        description="When the job completed"
    )
    items_scraped: int = Field(
        default=0,
        description="Number of items scraped",
        ge=0
    )
    categories_scraped: int = Field(
        default=0,
        description="Number of categories scraped",
        ge=0
    )
    errors: List[str] = Field(
        default_factory=list,
        description="Errors encountered"
    )
    progress: float = Field(
        default=0.0,
        description="Progress percentage",
        ge=0.0,
        le=100.0
    )
    message: str = Field(
        default="",
        description="Status message"
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "job_id": "scrape-2024-01-15-001",
                    "status": "completed",
                    "game": "poe2",
                    "started_at": "2024-01-15T10:00:00Z",
                    "completed_at": "2024-01-15T10:15:00Z",
                    "items_scraped": 150,
                    "categories_scraped": 12,
                    "errors": [],
                    "progress": 100.0,
                    "message": "Scraping completed successfully"
                }
            ]
        }
    }


class ScrapeRequest(BaseModel):
    """
    Request model for triggering a scraping job.

    Attributes:
        game: Which game to scrape
        categories: Specific categories to scrape (optional)
        force: Force re-scrape even if data exists
        callback_url: URL to notify when complete (optional)
    """
    game: Game = Field(
        ...,
        description="Which game to scrape"
    )
    categories: Optional[List[str]] = Field(
        default=None,
        description="Specific categories to scrape (scrapes all if not provided)"
    )
    force: bool = Field(
        default=False,
        description="Force re-scrape even if data exists"
    )
    callback_url: Optional[str] = Field(
        default=None,
        description="URL to notify when complete"
    )

    @field_validator("callback_url")
    @classmethod
    def validate_callback_url(cls, v):
        """Validate callback URL format."""
        if v is None:
            return v
        if not v.startswith(("http://", "https://")):
            raise ValueError("Callback URL must start with http:// or https://")
        return v

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "game": "poe2",
                    "categories": ["Weapons", "Armor"],
                    "force": False,
                    "callback_url": None
                }
            ]
        }
    }


__all__ = [
    "Game",
    "ItemType",
    "PoECategory",
    "PoEItem",
    "ScrapedData",
    "ScrapeStatus",
    "ScrapeJob",
    "ScrapeRequest",
]
