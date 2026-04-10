/**
 * Citation types for displaying source citations in chat responses.
 *
 * These types model the citation data that originates from the RAG pipeline:
 *   - Backend model: Source (chat.py)
 *   - SSE event: SSESourcesEvent (streaming.ts)
 *   - Non-streaming: ChatResponse.sources
 *
 * The CitationData type normalises both pathways into a single structure
 * that the citation components can render.
 */

// ---------------------------------------------------------------------------
// Core citation data
// ---------------------------------------------------------------------------

/**
 * A single citation referencing a source document used in a RAG response.
 *
 * This mirrors the backend `Source` model but adds optional fields for
 * richer display (title, document type, page number, etc.).
 */
export interface CitationData {
  /** Unique identifier for this citation within the response (auto-generated) */
  id: string;
  /** Retrieved content snippet from the knowledge base */
  content: string;
  /** Original source URL or document name */
  source: string;
  /** Similarity score between 0 and 1 (higher = more relevant) */
  relevance_score: number;
  /** Optional human-readable title for the source */
  title?: string;
  /** Optional document type (e.g., "wiki", "forum", "official", "database") */
  doc_type?: CitationDocType;
  /** Optional page or section reference */
  page?: string;
}

// ---------------------------------------------------------------------------
// Document type classification
// ---------------------------------------------------------------------------

/**
 * Classification of the source document type.
 * Used to render different icons / styles for different kinds of sources.
 */
export type CitationDocType =
  | 'wiki'
  | 'forum'
  | 'official'
  | 'database'
  | 'guide'
  | 'video'
  | 'unknown';

// ---------------------------------------------------------------------------
// Citation display format
// ---------------------------------------------------------------------------

/**
 * Display format for the citation component.
 * - `compact`  -- small badge-style inline citations
 * - `detailed` -- expanded cards with content preview
 * - `list`     -- simple numbered list with links
 */
export type CitationDisplayFormat = 'compact' | 'detailed' | 'list';

// ---------------------------------------------------------------------------
// Component props (re-exported from component files as well)
// ---------------------------------------------------------------------------

/**
 * Props for the CitationCard component.
 */
export interface CitationCardProps {
  /** The citation data to display */
  citation: CitationData;
  /** 1-based index number for display */
  index: number;
  /** Whether the card is expanded showing the content preview */
  isExpanded?: boolean;
  /** Callback when the card is toggled open/closed */
  onToggle?: (id: string) => void;
  /** Optional additional CSS class names */
  className?: string;
}

/**
 * Props for the CitationList component.
 */
export interface CitationListProps {
  /** Array of citations to display */
  citations: CitationData[];
  /** Display format (defaults to 'compact') */
  format?: CitationDisplayFormat;
  /** Optional additional CSS class names */
  className?: string;
}
