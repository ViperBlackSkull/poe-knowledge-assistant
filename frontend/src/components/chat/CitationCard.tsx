import { useState, useCallback } from 'react';
import type { CitationCardProps, CitationDocType } from '@/types/citation';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive a short label from the source string for compact display.
 * If the source is a URL, show just the hostname + path tail.
 * Otherwise truncate to 40 characters.
 */
function getSourceLabel(source: string): string {
  try {
    const url = new URL(source);
    const path = url.pathname === '/' ? '' : url.pathname.split('/').filter(Boolean).pop() ?? '';
    return path ? `${url.hostname}/${path}` : url.hostname;
  } catch {
    // Not a URL -- return as-is, truncated
    return source.length > 40 ? source.slice(0, 37) + '...' : source;
  }
}

/**
 * Get icon and color for a document type.
 */
function getDocTypeStyle(docType?: CitationDocType): { icon: string; colorClass: string } {
  switch (docType) {
    case 'wiki':
      return { icon: 'W', colorClass: 'text-poe-rarity-magic bg-poe-rarity-magic/10 border-poe-rarity-magic/30' };
    case 'official':
      return { icon: '!', colorClass: 'text-poe-gold bg-poe-gold/10 border-poe-gold/30' };
    case 'forum':
      return { icon: 'F', colorClass: 'text-poe-rarity-rare bg-poe-rarity-rare/10 border-poe-rarity-rare/30' };
    case 'database':
      return { icon: 'D', colorClass: 'text-poe-rarity-gem bg-poe-rarity-gem/10 border-poe-rarity-gem/30' };
    case 'guide':
      return { icon: 'G', colorClass: 'text-poe-rarity-currency bg-poe-rarity-currency/10 border-poe-rarity-currency/30' };
    case 'video':
      return { icon: 'V', colorClass: 'text-red-400 bg-red-400/10 border-red-400/30' };
    default:
      return { icon: 'S', colorClass: 'text-poe-text-secondary bg-poe-bg-tertiary border-poe-border' };
  }
}

/**
 * Format a relevance score as a percentage string.
 */
function formatScore(score: number): string {
  return `${Math.round(score * 100)}%`;
}

/**
 * Get a relevance level label and color.
 */
function getRelevanceLevel(score: number): { label: string; colorClass: string } {
  if (score >= 0.85) return { label: 'High', colorClass: 'text-green-400' };
  if (score >= 0.6) return { label: 'Medium', colorClass: 'text-yellow-400' };
  return { label: 'Low', colorClass: 'text-poe-text-muted' };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * CitationCard renders a single source citation with expandable content.
 *
 * Features:
 *  - Clickable card with expand/collapse for content preview
 *  - Source link that opens the original document in a new tab
 *  - Relevance score badge
 *  - Document type indicator
 *  - Animated expand/collapse transition
 */
export function CitationCard({
  citation,
  index,
  isExpanded: controlledExpanded,
  onToggle,
  className = '',
}: CitationCardProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = controlledExpanded ?? internalExpanded;

  const docTypeStyle = getDocTypeStyle(citation.doc_type);
  const relevance = getRelevanceLevel(citation.relevance_score);
  const sourceLabel = getSourceLabel(citation.source);

  const isUrl = citation.source.startsWith('http://') || citation.source.startsWith('https://');

  const handleToggle = useCallback(() => {
    if (onToggle) {
      onToggle(citation.id);
    } else {
      setInternalExpanded((prev) => !prev);
    }
  }, [onToggle, citation.id]);

  return (
    <div
      className={`border rounded-lg overflow-hidden transition-colors ${
        isExpanded
          ? 'bg-poe-bg-tertiary border-poe-gold/30'
          : 'bg-poe-bg-card border-poe-border hover:border-poe-border-light'
      } ${className}`}
      data-testid={`citation-card-${index}`}
    >
      {/* Header row -- always visible */}
      <button
        type="button"
        onClick={handleToggle}
        className="w-full text-left px-3 py-2 flex items-center gap-2 group"
        aria-expanded={isExpanded}
        aria-label={`Citation ${index}: ${citation.title ?? sourceLabel}`}
        data-testid={`citation-toggle-${index}`}
      >
        {/* Index badge */}
        <span
          className={`shrink-0 w-5 h-5 rounded border text-[10px] font-bold flex items-center justify-center ${docTypeStyle.colorClass}`}
          title={`Source type: ${citation.doc_type ?? 'unknown'}`}
        >
          {docTypeStyle.icon}
        </span>

        {/* Source info */}
        <span className="flex-1 min-w-0">
          <span className="text-poe-text-highlight text-xs font-medium">
            {index}.{' '}
          </span>
          <span className="text-poe-text-secondary text-xs truncate">
            {citation.title ?? sourceLabel}
          </span>
        </span>

        {/* Relevance score */}
        <span
          className={`shrink-0 text-[10px] font-mono ${relevance.colorClass}`}
          title={`Relevance: ${formatScore(citation.relevance_score)}`}
        >
          {formatScore(citation.relevance_score)}
        </span>

        {/* Expand/collapse chevron */}
        <svg
          className={`shrink-0 w-3 h-3 text-poe-text-muted transition-transform ${
            isExpanded ? 'rotate-180' : ''
          }`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {/* Expanded content preview */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-2" data-testid={`citation-detail-${index}`}>
          {/* Content snippet */}
          <div className="bg-poe-bg-primary rounded border border-poe-border p-2">
            <p className="text-poe-text-secondary text-xs leading-relaxed italic">
              &ldquo;{citation.content}&rdquo;
            </p>
          </div>

          {/* Source link and metadata */}
          <div className="flex items-center justify-between gap-2">
            {isUrl ? (
              <a
                href={citation.source}
                target="_blank"
                rel="noopener noreferrer"
                className="text-poe-gold-light text-xs hover:text-poe-gold hover:underline truncate max-w-[80%] flex items-center gap-1"
                data-testid={`citation-link-${index}`}
              >
                <svg
                  className="w-3 h-3 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                  />
                </svg>
                {sourceLabel}
              </a>
            ) : (
              <span className="text-poe-text-muted text-xs truncate max-w-[80%]">
                {citation.source}
              </span>
            )}

            {/* Relevance badge */}
            <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded border ${relevance.colorClass} border-current/20`}>
              {relevance.label}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
