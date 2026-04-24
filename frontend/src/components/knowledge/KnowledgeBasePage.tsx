import { useDataFreshness, deriveFreshnessStatus } from '@/hooks/useDataFreshness';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import type { FreshnessEntry, FreshnessStatus } from '@/types/freshness';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_DOT: Record<FreshnessStatus, { color: string; glow: string }> = {
  fresh: { color: 'bg-[#1BA29B]', glow: '0 0 6px rgba(27,162,155,0.4)' },
  needs_update: { color: 'bg-[#FFD700]', glow: '0 0 6px rgba(255,215,0,0.3)' },
  outdated: { color: 'bg-poe-fire', glow: '0 0 6px rgba(255,69,0,0.3)' },
  no_data: { color: 'bg-poe-text-muted', glow: 'none' },
};

const STATUS_LABEL: Record<FreshnessStatus, string> = {
  fresh: 'Fresh',
  needs_update: 'Stale',
  outdated: 'Outdated',
  no_data: 'No Data',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function GameCard({ entry }: { entry: FreshnessEntry }) {
  const status = deriveFreshnessStatus(entry);
  const dot = STATUS_DOT[status];
  const label = STATUS_LABEL[status];
  const gameName = entry.game === 'poe1' ? 'Path of Exile 1' : 'Path of Exile 2';

  return (
    <div className="bg-poe-bg-secondary border border-poe-border rounded-[3px] p-4 transition-colors hover:border-poe-border-light">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-poe-text-highlight text-xs font-semibold tracking-[0.6px] uppercase">
          {gameName}
        </h3>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full" style={{ boxShadow: dot.glow }}>
            <span className={`block w-full h-full rounded-full ${dot.color}`} />
          </span>
          <span className="text-[10px] text-poe-text-muted">{label}</span>
        </div>
      </div>

      <div className="space-y-2">
        {entry.has_data ? (
          <>
            <div className="flex justify-between">
              <span className="text-poe-text-muted text-xs uppercase tracking-[0.5px]">Items</span>
              <span className="text-poe-text-primary text-sm">{entry.items_scraped.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-poe-text-muted text-xs uppercase tracking-[0.5px]">Categories</span>
              <span className="text-poe-text-primary text-sm">{entry.categories_scraped.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-poe-text-muted text-xs uppercase tracking-[0.5px]">Last Scrape</span>
              <span className="text-poe-text-primary text-sm">{entry.relative_time ?? 'Unknown'}</span>
            </div>
          </>
        ) : (
          <p className="text-poe-text-muted text-sm italic">No data scraped yet</p>
        )}

        {entry.staleness_warning && (
          <div className="mt-2 pt-2 border-t border-poe-border">
            <p className="text-[10px] text-poe-gold-light leading-relaxed">{entry.staleness_warning}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function KnowledgeBasePage() {
  const { data, isLoading, error } = useDataFreshness(120_000);

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 sm:px-12 animate-poe-fade-in-up">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="font-[Cinzel,Georgia,serif] text-2xl font-semibold text-poe-gold-light tracking-[2px] uppercase">
          Knowledge Base
        </h1>
        <p className="text-poe-text-muted text-sm mt-1">
          Data freshness and knowledge sources
        </p>
      </div>

      {/* Loading state */}
      {isLoading && !data && (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="md" />
        </div>
      )}

      {/* Error state */}
      {error && !data && (
        <div className="bg-poe-bg-secondary border border-poe-border rounded-[3px] p-6 text-center">
          <p className="text-poe-text-muted text-sm">
            Unable to load data freshness. The backend may be unavailable.
          </p>
        </div>
      )}

      {/* Data loaded */}
      {data && (
        <>
          {/* Game version cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <GameCard entry={data.freshness.poe1} />
            <GameCard entry={data.freshness.poe2} />
          </div>

          {/* Data sources info */}
          <div className="bg-poe-bg-secondary border border-poe-border rounded-[3px] p-4">
            <h2 className="text-poe-text-highlight text-xs font-semibold tracking-[0.6px] uppercase mb-3">
              Data Sources
            </h2>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-poe-text-muted text-xs uppercase tracking-[0.5px]">Source</span>
                <span className="text-poe-text-primary text-sm">poedb.tw</span>
              </div>
              <div className="flex justify-between">
                <span className="text-poe-text-muted text-xs uppercase tracking-[0.5px]">Staleness Threshold</span>
                <span className="text-poe-text-primary text-sm">{data.summary.staleness_threshold_days} days</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
