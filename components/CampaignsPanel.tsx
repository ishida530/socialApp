'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';

type Campaign = {
  id: string;
  name: string;
  startedAt: string;
  endedAt: string | null;
};

type CampaignReport = {
  id: string;
  name: string;
  startedAt: string;
  endedAt: string | null;
  postsCount: number;
  platforms: string[];
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  engagementRate: number | null;
  newFans: number;
  salesCents: number;
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatPLN(cents: number) {
  return `${(cents / 100).toFixed(2)} PLN`;
}

// Web equivalent of the Telegram /campaign, /campaign-end, /campaigns, /campaign-report commands
// - the SAME Campaign model and lib/server/campaigns.ts functions, so starting/ending a campaign
// here has an identical effect on the Telegram side (and vice versa): the "active campaign"
// auto-attaches every new post regardless of which channel uploaded it.
export function CampaignsPanel() {
  const [active, setActive] = useState<Campaign | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [reportFor, setReportFor] = useState<CampaignReport | null>(null);
  const [loadingReportId, setLoadingReportId] = useState<string | null>(null);

  const load = async () => {
    try {
      const response = await apiClient.get<{ active: Campaign | null; campaigns: Campaign[] }>('/account-campaigns');
      setActive(response.data.active);
      setCampaigns(response.data.campaigns);
    } catch {
      toast.error('Nie udało się pobrać kampanii.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const startCampaign = async () => {
    const name = newName.trim();
    if (!name) {
      return;
    }

    try {
      setIsStarting(true);
      await apiClient.post('/account-campaigns', { name });
      setNewName('');
      toast.success(`Kampania "${name}" rozpoczęta.`);
      await load();
    } catch {
      toast.error('Nie udało się rozpocząć kampanii.');
    } finally {
      setIsStarting(false);
    }
  };

  const endCampaign = async () => {
    try {
      setIsEnding(true);
      await apiClient.post('/account-campaigns/end');
      toast.success('Kampania zakończona.');
      await load();
    } catch {
      toast.error('Nie udało się zakończyć kampanii.');
    } finally {
      setIsEnding(false);
    }
  };

  const openReport = async (campaign: Campaign) => {
    try {
      setLoadingReportId(campaign.id);
      const response = await apiClient.get<{ report: CampaignReport }>(`/account-campaigns/${campaign.id}/report`);
      setReportFor(response.data.report);
    } catch {
      toast.error('Nie udało się pobrać raportu kampanii.');
    } finally {
      setLoadingReportId(null);
    }
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Ładowanie kampanii...</p>;
  }

  return (
    <div className="space-y-6">
      <section className="bg-card border border-border rounded-xl p-6 space-y-4 max-w-2xl">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Aktywna kampania</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Kiedy kampania jest aktywna, każdy nowy post (z web albo z Telegrama) trafia do niej automatycznie -
            bez dodatkowego kroku. Rozpoczęcie nowej kampanii automatycznie kończy poprzednią.
          </p>
        </div>

        {active ? (
          <div className="flex items-center justify-between bg-secondary/30 border border-border rounded-lg p-4">
            <div>
              <p className="text-sm font-medium text-foreground">🎯 {active.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Rozpoczęta {formatDate(active.startedAt)}</p>
            </div>
            <button
              type="button"
              onClick={endCampaign}
              disabled={isEnding}
              className="px-4 py-2 rounded-lg border border-border text-foreground hover:bg-secondary/40 transition-colors text-sm font-medium disabled:opacity-50"
            >
              {isEnding ? 'Kończenie...' : 'Zakończ kampanię'}
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Nazwa kampanii, np. Premiera singla"
              className="flex-1 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm text-foreground"
            />
            <button
              type="button"
              onClick={startCampaign}
              disabled={isStarting || !newName.trim()}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
            >
              {isStarting ? 'Startowanie...' : 'Rozpocznij'}
            </button>
          </div>
        )}
      </section>

      <section className="bg-card border border-border rounded-xl p-6 space-y-3 max-w-2xl">
        <h2 className="text-lg font-semibold text-foreground">Historia kampanii</h2>

        {campaigns.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak kampanii - rozpocznij pierwszą powyżej.</p>
        ) : (
          <ul className="divide-y divide-border">
            {campaigns.map((campaign) => (
              <li key={campaign.id} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{campaign.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(campaign.startedAt)}
                    {campaign.endedAt ? ` – ${formatDate(campaign.endedAt)}` : ' – w trakcie'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openReport(campaign)}
                  disabled={loadingReportId === campaign.id}
                  className="px-3 py-1.5 rounded-lg border border-border text-xs text-foreground hover:bg-secondary/40 transition-colors disabled:opacity-50"
                >
                  {loadingReportId === campaign.id ? 'Ładowanie...' : 'Raport'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {reportFor && (
        <section className="bg-card border border-primary/30 rounded-xl p-6 space-y-3 max-w-2xl">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Raport: {reportFor.name}</h2>
            <button type="button" onClick={() => setReportFor(null)} className="text-xs text-muted-foreground hover:text-foreground">
              Zamknij
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Posty</p>
              <p className="text-foreground font-medium">{reportFor.postsCount}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Platformy</p>
              <p className="text-foreground font-medium">{reportFor.platforms.join(', ') || '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Wyświetlenia</p>
              <p className="text-foreground font-medium">{reportFor.totalViews}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Zaangażowanie</p>
              <p className="text-foreground font-medium">
                {reportFor.engagementRate !== null ? `${(reportFor.engagementRate * 100).toFixed(1)}%` : 'brak danych'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Nowi fani</p>
              <p className="text-foreground font-medium">{reportFor.newFans}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Sprzedaże</p>
              <p className="text-foreground font-medium">{formatPLN(reportFor.salesCents)}</p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
