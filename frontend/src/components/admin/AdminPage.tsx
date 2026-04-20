import { useState, useEffect, useCallback } from 'react';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { PerformanceDashboard } from '@/components/common/PerformanceDashboard';
import { useDataFreshness, deriveFreshnessStatus } from '@/hooks/useDataFreshness';
import type { FreshnessEntry } from '@/types/freshness';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HealthResponse {
  status: string;
  chromadb: { status: string; message?: string };
  embeddings: { status: string; message?: string };
  vector_store: { status: string; message?: string };
}

type AdminTab = 'health' | 'performance' | 'scraper';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const isHealthy = status === 'healthy' || status === 'ok';
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${isHealthy ? 'bg-[#1BA29B]/10 text-[#1BA29B]' : 'bg-poe-fire/10 text-poe-fire'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${isHealthy ? 'bg-[#1BA29B]' : 'bg-poe-fire'}`} />
      {isHealthy ? 'Healthy' : 'Error'}
    </span>
  );
}

function ServiceCard({ name, status, message }: { name: string; status: string; message?: string }) {
  return (
    <div className="bg-poe-bg-secondary border border-poe-border rounded-[3px] p-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <StatusBadge status={status} />
        <span className="text-poe-text-primary text-sm font-medium">{name}</span>
      </div>
      {message && (
        <span className="text-poe-text-muted text-xs truncate max-w-[200px]">{message}</span>
      )}
    </div>
  );
}

function ScraperGameRow({ entry }: { entry: FreshnessEntry }) {
  const status = deriveFreshnessStatus(entry);
  const gameName = entry.game === 'poe1' ? 'PoE 1' : 'PoE 2';
  const hasData = entry.has_data;

  return (
    <div className="flex items-center justify-between py-2 border-b border-poe-border last:border-b-0">
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full ${status === 'fresh' ? 'bg-[#1BA29B]' : status === 'outdated' ? 'bg-poe-fire' : 'bg-poe-text-muted'}`} />
        <span className="text-poe-text-secondary text-sm">{gameName}</span>
      </div>
      <div className="flex items-center gap-3 text-xs text-poe-text-muted">
        {hasData ? (
          <>
            <span>{entry.items_scraped.toLocaleString()} items</span>
            <span>{entry.relative_time ?? 'Unknown'}</span>
          </>
        ) : (
          <span className="italic">Never scraped</span>
        )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 text-xs font-medium tracking-[0.8px] uppercase transition-all duration-200 border-b-2 ${
        active
          ? 'text-poe-gold-light border-poe-gold'
          : 'text-poe-text-muted border-transparent hover:text-poe-text-secondary hover:border-poe-border/50'
      }`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AdminPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>('health');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);
  const { data: freshnessData, isLoading: freshnessLoading } = useDataFreshness(120_000);

  const fetchHealth = useCallback(async () => {
    setHealthLoading(true);
    setHealthError(null);
    try {
      const res = await fetch('/api/health');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setHealth(json);
    } catch {
      setHealthError('Unable to reach the server.');
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 sm:px-12 animate-poe-fade-in-up">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="font-[Cinzel,Georgia,serif] text-2xl font-semibold text-poe-gold-light tracking-[2px] uppercase">
          Admin Dashboard
        </h1>
        <p className="text-poe-text-muted text-sm mt-1">
          System monitoring and management
        </p>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 border-b border-poe-border mb-6">
        <TabButton active={activeTab === 'health'} onClick={() => setActiveTab('health')}>
          Health
        </TabButton>
        <TabButton active={activeTab === 'performance'} onClick={() => setActiveTab('performance')}>
          Performance
        </TabButton>
        <TabButton active={activeTab === 'scraper'} onClick={() => setActiveTab('scraper')}>
          Scraper
        </TabButton>
      </div>

      {/* Tab content */}
      {activeTab === 'health' && (
        <div className="space-y-3 animate-poe-fade-in">
          {healthLoading && !health && (
            <div className="flex justify-center py-12">
              <LoadingSpinner size="md" />
            </div>
          )}
          {healthError && (
            <div className="bg-poe-bg-secondary border border-poe-border rounded-[3px] p-6 text-center">
              <p className="text-poe-text-muted text-sm">{healthError}</p>
              <button
                type="button"
                onClick={fetchHealth}
                className="mt-3 poe-button text-xs py-1.5 px-4"
              >
                Retry
              </button>
            </div>
          )}
          {health && (
            <div className="space-y-3">
              <ServiceCard name="ChromaDB" status={health.chromadb?.status ?? 'unknown'} message={health.chromadb?.message} />
              <ServiceCard name="Embeddings" status={health.embeddings?.status ?? 'unknown'} message={health.embeddings?.message} />
              <ServiceCard name="Vector Store" status={health.vector_store?.status ?? 'unknown'} message={health.vector_store?.message} />
              <div className="flex items-center gap-2 mt-3">
                <span className={`w-2 h-2 rounded-full ${health.status === 'healthy' ? 'bg-[#1BA29B]' : 'bg-poe-fire'}`} />
                <span className="text-xs text-poe-text-muted">
                  Overall: {health.status}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'performance' && (
        <div className="animate-poe-fade-in">
          <PerformanceDashboard apiUrl="/api" refreshInterval={5000} />
        </div>
      )}

      {activeTab === 'scraper' && (
        <div className="animate-poe-fade-in">
          {freshnessLoading && !freshnessData && (
            <div className="flex justify-center py-12">
              <LoadingSpinner size="md" />
            </div>
          )}
          {freshnessData && (
            <div className="bg-poe-bg-secondary border border-poe-border rounded-[3px] p-4">
              <h2 className="text-poe-text-highlight text-xs font-semibold tracking-[0.6px] uppercase mb-3">
                Data Freshness
              </h2>
              <ScraperGameRow entry={freshnessData.freshness.poe1} />
              <ScraperGameRow entry={freshnessData.freshness.poe2} />
              <div className="mt-3 pt-3 border-t border-poe-border">
                <p className="text-[10px] text-poe-text-muted">
                  Staleness threshold: {freshnessData.summary.staleness_threshold_days} days
                </p>
              </div>
            </div>
          )}
          {!freshnessLoading && !freshnessData && (
            <div className="bg-poe-bg-secondary border border-poe-border rounded-[3px] p-6 text-center">
              <p className="text-poe-text-muted text-sm">Unable to load scraper data.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
