import { useState, useCallback } from 'react';
import type { CitationListProps } from '@/types/citation';
import { CitationCard } from './CitationCard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Truncate content to a maximum length for compact display.
 */
function truncateContent(content: string, maxLen: number): string {
  if (content.length <= maxLen) return content;
  return content.slice(0, maxLen - 3) + '...';
}

// ---------------------------------------------------------------------------
// Sub-components for different display formats
// ---------------------------------------------------------------------------

/**
 * Compact format: small numbered badges that link to sources.
 */
function CompactCitationList({ citations }: { citations: CitationListProps['citations'] }) {
  return (
    <div className="flex flex-wrap gap-1.5" data-testid="citation-list-compact">
      {citations.map((citation, index) => {
        const isUrl = citation.source.startsWith('http://') || citation.source.startsWith('https://');
        const Wrapper = isUrl ? 'a' : 'span';
        const wrapperProps = isUrl
          ? {
              href: citation.source,
              target: '_blank' as const,
              rel: 'noopener noreferrer' as const,
              title: `Source: ${citation.source} (Relevance: ${Math.round(citation.relevance_score * 100)}%)`,
            }
          : {
              title: `Source: ${citation.source} (Relevance: ${Math.round(citation.relevance_score * 100)}%)`,
            };

        return (
          <Wrapper
            key={citation.id}
            {...wrapperProps}
            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors ${
              isUrl
                ? 'text-poe-gold-light bg-poe-gold/10 border-poe-gold/20 hover:bg-poe-gold/20 hover:border-poe-gold/40'
                : 'text-poe-text-secondary bg-poe-bg-tertiary border-poe-border'
            }`}
            data-testid={`citation-badge-${index + 1}`}
          >
            <span className="font-bold">{index + 1}</span>
            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </Wrapper>
        );
      })}
    </div>
  );
}

/**
 * List format: simple numbered list with source links and short previews.
 */
function ListCitationList({ citations }: { citations: CitationListProps['citations'] }) {
  return (
    <ul className="space-y-1.5" data-testid="citation-list-list">
      {citations.map((citation, index) => {
        const isUrl = citation.source.startsWith('http://') || citation.source.startsWith('https://');
        return (
          <li key={citation.id} className="flex items-start gap-2 text-xs">
            <span className="shrink-0 text-poe-text-muted font-mono w-4 text-right">
              {index + 1}.
            </span>
            <div className="min-w-0 flex-1">
              {isUrl ? (
                <a
                  href={citation.source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-poe-gold-light hover:text-poe-gold hover:underline"
                  data-testid={`citation-link-${index + 1}`}
                >
                  {citation.title ?? truncateContent(citation.source, 60)}
                </a>
              ) : (
                <span className="text-poe-text-secondary">
                  {citation.title ?? citation.source}
                </span>
              )}
              <p className="text-poe-text-muted text-[11px] leading-snug mt-0.5">
                {truncateContent(citation.content, 100)}
              </p>
            </div>
            <span className="shrink-0 text-[10px] text-poe-text-muted font-mono">
              {Math.round(citation.relevance_score * 100)}%
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Detailed format: expandable citation cards.
 */
function DetailedCitationList({ citations }: { citations: CitationListProps['citations'] }) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const handleToggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  return (
    <div className="space-y-1.5" data-testid="citation-list-detailed">
      {citations.map((citation, index) => (
        <CitationCard
          key={citation.id}
          citation={citation}
          index={index + 1}
          isExpanded={expandedIds.has(citation.id)}
          onToggle={handleToggle}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main CitationList component
// ---------------------------------------------------------------------------

/**
 * CitationList renders a collection of source citations in the chosen format.
 *
 * Supports three display formats:
 * - `compact`  -- small numbered badges with links (ideal for inline display)
 * - `detailed` -- expandable cards with content previews and metadata
 * - `list`     -- simple numbered list with source links
 *
 * The component is reusable throughout the application and integrates with
 * the chat interface to display RAG source citations under assistant messages.
 */
export function CitationList({
  citations,
  format = 'compact',
  className = '',
}: CitationListProps) {
  if (!citations || citations.length === 0) {
    return null;
  }

  return (
    <div
      className={`citation-list ${className}`}
      data-testid="citation-list"
      data-format={format}
      role="list"
      aria-label={`${citations.length} source citation${citations.length !== 1 ? 's' : ''}`}
    >
      {/* Section header */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <svg
          className="w-3.5 h-3.5 text-poe-text-muted"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
          />
        </svg>
        <span className="text-poe-text-muted text-[11px] font-medium uppercase tracking-wider">
          Sources ({citations.length})
        </span>
      </div>

      {/* Citations in chosen format */}
      {format === 'compact' && <CompactCitationList citations={citations} />}
      {format === 'list' && <ListCitationList citations={citations} />}
      {format === 'detailed' && <DetailedCitationList citations={citations} />}
    </div>
  );
}
