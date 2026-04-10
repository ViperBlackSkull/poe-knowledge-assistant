import { useState } from 'react';
import { CitationList, CitationCard } from '@/components';
import type { CitationData, CitationDisplayFormat } from '@/types/citation';

// ---------------------------------------------------------------------------
// Mock citation data for testing
// ---------------------------------------------------------------------------

const MOCK_CITATIONS: CitationData[] = [
  {
    id: 'cit-demo-1',
    content:
      'The Blood Mage ascendancy focuses on life and blood magic, converting skills to use life instead of mana. Key nodes include Sanguimancy and Crimson Ace.',
    source: 'https://poedb.tw/us/Blood_Mage',
    relevance_score: 0.95,
    title: 'Blood Mage',
    doc_type: 'database',
  },
  {
    id: 'cit-demo-2',
    content:
      'For a Witch build in Path of Exile 2, prioritize intelligence and life nodes early, then branch into your chosen ascendancy specializations.',
    source: 'https://www.pathofexile.com/forum/view-thread/witch-builds-2024',
    relevance_score: 0.82,
    title: 'witch builds 2024',
    doc_type: 'forum',
  },
  {
    id: 'cit-demo-3',
    content:
      'Skeletal warriors are the primary minion for Necromancer builds, scaling well with minion damage and attack speed support gems.',
    source: 'https://www.poe2wiki.com/Necromancer',
    relevance_score: 0.71,
    title: 'Necromancer',
    doc_type: 'wiki',
  },
  {
    id: 'cit-demo-4',
    content:
      'The official Path of Exile 2 patch notes from December 2024 introduced major changes to the passive skill tree.',
    source: 'https://www.pathofexile.com/patch-notes/2.0',
    relevance_score: 0.58,
    title: 'patch notes 2.0',
    doc_type: 'official',
  },
  {
    id: 'cit-demo-5',
    content:
      'This video guide covers advanced minion management techniques for PoE2 Witch builds.',
    source: 'https://www.youtube.com/watch?v=example123',
    relevance_score: 0.45,
    title: 'watch?v=example123',
    doc_type: 'video',
  },
];

// ---------------------------------------------------------------------------
// Demo component
// ---------------------------------------------------------------------------

/**
 * CitationDemo renders all citation formats with sample data for testing.
 * Navigate to /#/citations to view.
 */
export function CitationDemo() {
  const [selectedFormat, setSelectedFormat] = useState<CitationDisplayFormat>('compact');

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
      {/* Page header */}
      <div>
        <h1 className="poe-header text-2xl mb-2">Citation Component Demo</h1>
        <p className="text-poe-text-secondary text-sm">
          Demonstrates the citation display component with mock source data from the PoE knowledge base.
        </p>
      </div>

      {/* Format selector */}
      <div className="space-y-2">
        <label className="text-poe-text-secondary text-sm font-medium block">
          Display Format
        </label>
        <div className="flex gap-2">
          {(['compact', 'detailed', 'list'] as CitationDisplayFormat[]).map((fmt) => (
            <button
              key={fmt}
              onClick={() => setSelectedFormat(fmt)}
              className={`poe-button text-sm capitalize ${
                selectedFormat === fmt
                  ? 'bg-poe-gold/20 border-poe-gold text-poe-gold'
                  : ''
              }`}
              data-testid={`format-btn-${fmt}`}
            >
              {fmt}
            </button>
          ))}
        </div>
      </div>

      {/* Citation list in selected format */}
      <div className="poe-card space-y-4" data-testid="citation-demo-list">
        <h2 className="poe-header text-lg">
          {selectedFormat.charAt(0).toUpperCase() + selectedFormat.slice(1)} Format
        </h2>
        <CitationList citations={MOCK_CITATIONS} format={selectedFormat} />
      </div>

      {/* Individual card demo */}
      <div className="poe-card space-y-4" data-testid="citation-demo-cards">
        <h2 className="poe-header text-lg">Individual Cards (Expanded)</h2>
        <div className="space-y-3">
          {MOCK_CITATIONS.map((citation, index) => (
            <CitationCard
              key={citation.id}
              citation={citation}
              index={index + 1}
              isExpanded={true}
            />
          ))}
        </div>
      </div>

      {/* Inline chat message with citations */}
      <div className="poe-card space-y-4" data-testid="citation-demo-chat">
        <h2 className="poe-header text-lg">Chat Message with Citations</h2>
        <div className="bg-poe-bg-primary rounded-lg p-4 border border-poe-border">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-poe-gold text-xs font-medium">Assistant</span>
            <span className="text-poe-text-muted text-xs">12:34 PM</span>
          </div>
          <p className="text-poe-text-highlight text-sm leading-relaxed mb-3">
            For a Witch build in PoE2, the Blood Mage ascendancy is currently very strong.
            It focuses on life and blood magic, converting skills to use life instead of mana.
            You should prioritize intelligence and life nodes early, then branch into your
            chosen ascendancy specializations.
          </p>
          <CitationList
            citations={MOCK_CITATIONS.slice(0, 3)}
            format="compact"
            className="pt-2 border-t border-poe-border"
          />
        </div>
      </div>

      {/* Empty state */}
      <div className="poe-card space-y-4" data-testid="citation-demo-empty">
        <h2 className="poe-header text-lg">Empty State (no citations)</h2>
        <div className="bg-poe-bg-primary rounded-lg p-4 border border-poe-border">
          <p className="text-poe-text-muted text-sm italic">
            (CitationList returns null when no citations are provided)
          </p>
          <CitationList citations={[]} format="compact" />
        </div>
      </div>
    </div>
  );
}
