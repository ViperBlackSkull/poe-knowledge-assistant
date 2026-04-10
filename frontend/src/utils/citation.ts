/**
 * Utility functions for working with citation data.
 *
 * Provides helpers to convert raw Source data from the backend API
 * (both streaming and non-streaming) into the CitationData format
 * used by the citation display components.
 */

import type { CitationData, CitationDocType } from '@/types/citation';
import type { Source } from '@/types/chat';
import type { SSESource } from '@/types/streaming';

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

let _citationCounter = 0;

/**
 * Generate a unique citation ID.
 * Uses a counter combined with a timestamp fragment.
 */
function generateCitationId(): string {
  _citationCounter += 1;
  return `cit-${Date.now().toString(36)}-${_citationCounter}`;
}

// ---------------------------------------------------------------------------
// Source type detection
// ---------------------------------------------------------------------------

/**
 * Known URL patterns and their document type classification.
 */
const URL_TYPE_PATTERNS: Array<{ pattern: RegExp; docType: CitationDocType }> = [
  { pattern: /poedb\.tw/i, docType: 'database' },
  { pattern: /wiki/i, docType: 'wiki' },
  { pattern: /pathofexile\.com/i, docType: 'official' },
  { pattern: /poe2\.com/i, docType: 'official' },
  { pattern: /forum/i, docType: 'forum' },
  { pattern: /reddit\.com/i, docType: 'forum' },
  { pattern: /youtube\.com/i, docType: 'video' },
  { pattern: /guide/i, docType: 'guide' },
];

/**
 * Detect the document type from a source URL or name.
 */
function detectDocType(source: string): CitationDocType {
  for (const { pattern, docType } of URL_TYPE_PATTERNS) {
    if (pattern.test(source)) {
      return docType;
    }
  }
  return 'unknown';
}

/**
 * Extract a human-readable title from a source URL or name.
 */
function extractTitle(source: string): string | undefined {
  try {
    const url = new URL(source);
    // Use the last path segment, cleaned up
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length > 0) {
      const last = segments[segments.length - 1];
      // Replace dashes/underscores with spaces, decode URI
      return decodeURIComponent(last.replace(/[-_]/g, ' '));
    }
    return url.hostname;
  } catch {
    // Not a URL -- return undefined (use source as-is)
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Conversion functions
// ---------------------------------------------------------------------------

/**
 * Convert a backend Source object to a CitationData object.
 *
 * @param source - Source from non-streaming ChatResponse
 * @returns CitationData ready for display
 */
export function sourceToCitation(source: Source): CitationData {
  const docType = detectDocType(source.source);
  return {
    id: generateCitationId(),
    content: source.content,
    source: source.source,
    relevance_score: source.relevance_score,
    title: extractTitle(source.source),
    doc_type: docType,
  };
}

/**
 * Convert an SSESource (from streaming) to a CitationData object.
 *
 * @param sseSource - Source from the SSE sources event
 * @returns CitationData ready for display
 */
export function sseSourceToCitation(sseSource: SSESource): CitationData {
  const docType = detectDocType(sseSource.source);
  return {
    id: generateCitationId(),
    content: sseSource.content,
    source: sseSource.source,
    relevance_score: sseSource.relevance_score,
    title: extractTitle(sseSource.source),
    doc_type: docType,
  };
}

/**
 * Convert an array of Source objects (non-streaming) to CitationData[].
 */
export function sourcesToCitations(sources: Source[]): CitationData[] {
  return sources.map(sourceToCitation);
}

/**
 * Convert an array of SSESource objects (streaming) to CitationData[].
 */
export function sseSourcesToCitations(sseSources: SSESource[]): CitationData[] {
  return sseSources.map(sseSourceToCitation);
}

/**
 * Extract citations from a ChatMessage's metadata.sources field.
 * Returns an empty array if no sources are present.
 */
export function extractCitationsFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): CitationData[] {
  if (!metadata || !metadata.sources || !Array.isArray(metadata.sources)) {
    return [];
  }

  // The sources in metadata may be raw Source objects or already CitationData
  return (metadata.sources as Array<Source | CitationData>).map((s) => {
    if ('id' in s && typeof s.id === 'string') {
      return s as CitationData;
    }
    return sourceToCitation(s as Source);
  });
}
