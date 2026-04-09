/**
 * Scraper types for data ingestion endpoints.
 * Mirrors backend Pydantic models from backend/src/models/scraper.py
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Supported Path of Exile games (scraper namespace). */
export type Game = 'poe1' | 'poe2';

/** Types of items in Path of Exile. */
export type ItemType =
  | 'weapon'
  | 'armor'
  | 'accessory'
  | 'flask'
  | 'gem'
  | 'jewel'
  | 'currency'
  | 'map'
  | 'divination_card'
  | 'unique'
  | 'skill'
  | 'passive'
  | 'ascendancy'
  | 'boss'
  | 'area'
  | 'mechanic'
  | 'other';

/** Status of a scraping job. */
export type ScrapeStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'cancelled';

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

/**
 * Model for Path of Exile item categories.
 *
 * Backend model: PoECategory (scraper.py)
 */
export interface PoECategory {
  /** Category name (1 - 200 chars) */
  name: string;
  /** Category URL on poedb.tw */
  url: string;
  /** Category description (max 1000 chars) */
  description?: string | null;
  /** Number of items in category (>= 0) */
  item_count: number;
  /** Which game this category belongs to */
  game: Game;
  /** Parent category name (if nested) */
  parent_category?: string | null;
  /** Sub-categories */
  children: PoECategory[];
}

/**
 * Model for Path of Exile items.
 *
 * Backend model: PoEItem (scraper.py)
 */
export interface PoEItem {
  /** Item name (1 - 200 chars) */
  name: string;
  /** Type of item */
  item_type: ItemType;
  /** Item URL on poedb.tw */
  url: string;
  /** Which game this item belongs to */
  game: Game;
  /** Item description or flavor text (max 5000 chars) */
  description?: string | null;
  /** Item requirements (level, stats, etc.) */
  requirements: Record<string, string>;
  /** Item properties (damage, defenses, etc.) */
  properties: Record<string, string>;
  /** Categories this item belongs to */
  categories: string[];
  /** Searchable tags */
  tags: string[];
  /** URL to item image */
  image_url?: string | null;
  /** Additional metadata */
  metadata: Record<string, string>;
  /** ISO 8601 timestamp when this data was scraped */
  scraped_at: string;
  /** Source website */
  source: string;
}

/**
 * Container for scraped data from poedb.tw.
 *
 * Backend model: ScrapedData (scraper.py)
 */
export interface ScrapedData {
  /** List of scraped items */
  items: PoEItem[];
  /** List of scraped categories */
  categories: PoECategory[];
  /** Which game this data is for */
  game: Game;
  /** Base source URL */
  source_url: string;
  /** ISO 8601 timestamp when the data was scraped */
  scraped_at: string;
  /** Total number of items (>= 0) */
  total_items: number;
  /** Total number of categories (>= 0) */
  total_categories: number;
  /** Errors encountered during scraping */
  errors: string[];
  /** Additional scraping metadata */
  metadata: Record<string, string>;
}

/**
 * Model for tracking scraping jobs.
 *
 * Backend model: ScrapeJob (scraper.py)
 */
export interface ScrapeJob {
  /** Unique job identifier */
  job_id: string;
  /** Current job status */
  status: ScrapeStatus;
  /** Which game is being scraped */
  game: Game;
  /** ISO 8601 timestamp when the job started */
  started_at: string;
  /** ISO 8601 timestamp when the job completed */
  completed_at?: string | null;
  /** Number of items scraped (>= 0) */
  items_scraped: number;
  /** Number of categories scraped (>= 0) */
  categories_scraped: number;
  /** Errors encountered */
  errors: string[];
  /** Progress percentage (0 - 100) */
  progress: number;
  /** Status message */
  message: string;
}

/**
 * Request body for triggering a scraping job.
 *
 * Backend model: ScrapeRequest (scraper.py)
 */
export interface ScrapeRequest {
  /** Which game to scrape */
  game: Game;
  /** Specific categories to scrape (scrapes all if not provided) */
  categories?: string[] | null;
  /** Force re-scrape even if data exists */
  force?: boolean;
  /** URL to notify when complete */
  callback_url?: string | null;
}
