'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';

type Fan = { id: string; email: string; name: string | null; createdAt: string };
type Sale = { id: string; product: string; amountCents: number; createdAt: string };
type RevenueSummary = {
  fanCount: number;
  allTimeSalesCount: number;
  allTimeRevenueCents: number;
  thisMonthSalesCount: number;
  thisMonthRevenueCents: number;
};

type SocialComment = {
  id: string;
  platform: string;
  authorName: string | null;
  text: string;
  suggestedReply: string | null;
  detectedAt: string;
};

function formatPLN(cents: number) {
  return `${(cents / 100).toFixed(2)} PLN`;
}

// Web equivalent of the Telegram /fan, /fans, /sale, /revenue commands, plus the detected-comment
// moderation queue (EPIC 11 Sprint 11.2) - "Wyślij / Napisz własną / Ignoruj" here, same as on
// Telegram, reusing the same lib/server/social-comments.ts functions.
export function CommunityPanel() {
  const [fans, setFans] = useState<Fan[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [summary, setSummary] = useState<RevenueSummary | null>(null);
  const [comments, setComments] = useState<SocialComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [fanEmail, setFanEmail] = useState('');
  const [fanName, setFanName] = useState('');
  const [isAddingFan, setIsAddingFan] = useState(false);
  const [showAddFan, setShowAddFan] = useState(false);

  const [saleProduct, setSaleProduct] = useState('');
  const [saleAmount, setSaleAmount] = useState('');
  const [isAddingSale, setIsAddingSale] = useState(false);
  const [showAddSale, setShowAddSale] = useState(false);

  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});
  const [actingCommentId, setActingCommentId] = useState<string | null>(null);

  const load = async () => {
    try {
      const [fansResponse, salesResponse, commentsResponse] = await Promise.all([
        apiClient.get<{ count: number; fans: Fan[] }>('/fans'),
        apiClient.get<{ summary: RevenueSummary; sales: Sale[] }>('/sales'),
        apiClient.get<{ comments: SocialComment[] }>('/comments'),
      ]);
      setFans(fansResponse.data.fans);
      setSales(salesResponse.data.sales);
      setSummary(salesResponse.data.summary);
      setComments(commentsResponse.data.comments);
    } catch {
      toast.error('Nie udało się pobrać danych społeczności.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const addFan = async () => {
    const email = fanEmail.trim();
    if (!email) {
      return;
    }

    try {
      setIsAddingFan(true);
      await apiClient.post('/fans', { email, name: fanName.trim() || undefined });
      setFanEmail('');
      setFanName('');
      setShowAddFan(false);
      toast.success('Fan dodany.');
      await load();
    } catch {
      toast.error('Nie udało się dodać fana - sprawdź adres email.');
    } finally {
      setIsAddingFan(false);
    }
  };

  const addSale = async () => {
    const product = saleProduct.trim();
    if (!product || !saleAmount.trim()) {
      return;
    }

    try {
      setIsAddingSale(true);
      await apiClient.post('/sales', { product, amount: saleAmount.trim() });
      setSaleProduct('');
      setSaleAmount('');
      setShowAddSale(false);
      toast.success('Sprzedaż zapisana.');
      await load();
    } catch {
      toast.error('Nie udało się zapisać sprzedaży - sprawdź kwotę.');
    } finally {
      setIsAddingSale(false);
    }
  };

  const actOnComment = async (comment: SocialComment, action: 'accept' | 'ignore' | 'reply') => {
    const text = replyDraft[comment.id]?.trim();
    if (action === 'reply' && !text) {
      toast.error('Wpisz treść odpowiedzi.');
      return;
    }

    try {
      setActingCommentId(comment.id);
      await apiClient.patch(`/comments/${comment.id}`, { action, text });
      toast.success(action === 'ignore' ? 'Zignorowano.' : 'Odpowiedź wysłana.');
      setComments((current) => current.filter((item) => item.id !== comment.id));
    } catch {
      toast.error('Nie udało się wykonać akcji na komentarzu.');
    } finally {
      setActingCommentId(null);
    }
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Ładowanie...</p>;
  }

  return (
    <div className="space-y-6">
      {comments.length > 0 && (
        <section className="bg-card border border-primary/30 rounded-xl p-6 space-y-4 max-w-2xl">
          <div>
            <h2 className="text-lg font-semibold text-foreground">💬 Komentarze czekające na reakcję</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Wykryte pod Twoimi postami na Instagramie/Facebooku - dokładnie te same przyciski co na Telegramie.
            </p>
          </div>

          <ul className="space-y-4">
            {comments.map((comment) => (
              <li key={comment.id} className="bg-secondary/30 border border-border rounded-lg p-4 space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground">{comment.platform}</p>
                  <p className="text-sm text-foreground mt-1">
                    {comment.authorName ? `${comment.authorName}: ` : ''}
                    {comment.text}
                  </p>
                </div>

                {comment.suggestedReply && (
                  <p className="text-sm text-muted-foreground italic">Sugestia: &quot;{comment.suggestedReply}&quot;</p>
                )}

                <div className="flex flex-wrap gap-2">
                  {comment.suggestedReply && (
                    <button
                      type="button"
                      onClick={() => actOnComment(comment, 'accept')}
                      disabled={actingCommentId === comment.id}
                      className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50"
                    >
                      ✅ Wyślij sugestię
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => actOnComment(comment, 'ignore')}
                    disabled={actingCommentId === comment.id}
                    className="px-3 py-1.5 rounded-lg border border-border text-xs text-foreground hover:bg-secondary/40 transition-colors disabled:opacity-50"
                  >
                    🚫 Ignoruj
                  </button>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={replyDraft[comment.id] ?? ''}
                    onChange={(event) => setReplyDraft((current) => ({ ...current, [comment.id]: event.target.value }))}
                    placeholder="Napisz własną odpowiedź..."
                    className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => actOnComment(comment, 'reply')}
                    disabled={actingCommentId === comment.id}
                    className="px-3 py-1.5 rounded-lg border border-border text-xs text-foreground hover:bg-secondary/40 transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    Wyślij
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {summary && (
        <section className="bg-card border border-border rounded-xl p-6 max-w-2xl">
          <h2 className="text-lg font-semibold text-foreground mb-4">Przychód</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Fani</p>
              <p className="text-foreground font-medium">{summary.fanCount}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Ten miesiąc</p>
              <p className="text-foreground font-medium">{formatPLN(summary.thisMonthRevenueCents)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Łącznie</p>
              <p className="text-foreground font-medium">{formatPLN(summary.allTimeRevenueCents)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Sprzedaży łącznie</p>
              <p className="text-foreground font-medium">{summary.allTimeSalesCount}</p>
            </div>
          </div>
        </section>
      )}

      <section className="bg-card border border-border rounded-xl p-6 space-y-4 max-w-2xl">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-foreground">Sprzedaże</h2>
          {!showAddSale && (
            <button
              type="button"
              onClick={() => setShowAddSale(true)}
              className="px-3 py-1.5 rounded-lg border border-border text-xs text-foreground hover:bg-secondary/40 transition-colors"
            >
              + Dodaj sprzedaż
            </button>
          )}
        </div>

        {showAddSale && (
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={saleProduct}
              onChange={(event) => setSaleProduct(event.target.value)}
              placeholder="Produkt, np. Koszulka czarna M"
              className="flex-1 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm text-foreground"
            />
            <input
              type="text"
              value={saleAmount}
              onChange={(event) => setSaleAmount(event.target.value)}
              placeholder="Kwota, np. 80"
              className="w-full sm:w-32 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm text-foreground"
            />
            <button
              type="button"
              onClick={addSale}
              disabled={isAddingSale || !saleProduct.trim() || !saleAmount.trim()}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
            >
              {isAddingSale ? 'Zapisywanie...' : 'Dodaj'}
            </button>
          </div>
        )}

        {sales.length > 0 && (
          <ul className="divide-y divide-border">
            {sales.map((sale) => (
              <li key={sale.id} className="py-2 flex items-center justify-between text-sm">
                <span className="text-foreground">{sale.product}</span>
                <span className="text-muted-foreground">{formatPLN(sale.amountCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-card border border-border rounded-xl p-6 space-y-4 max-w-2xl">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-foreground">Fani</h2>
          {!showAddFan && (
            <button
              type="button"
              onClick={() => setShowAddFan(true)}
              className="px-3 py-1.5 rounded-lg border border-border text-xs text-foreground hover:bg-secondary/40 transition-colors"
            >
              + Dodaj fana
            </button>
          )}
        </div>

        {showAddFan && (
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              value={fanEmail}
              onChange={(event) => setFanEmail(event.target.value)}
              placeholder="email@przyklad.com"
              className="flex-1 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm text-foreground"
            />
            <input
              type="text"
              value={fanName}
              onChange={(event) => setFanName(event.target.value)}
              placeholder="Imię (opcjonalnie)"
              className="w-full sm:w-40 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm text-foreground"
            />
            <button
              type="button"
              onClick={addFan}
              disabled={isAddingFan || !fanEmail.trim()}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
            >
              {isAddingFan ? 'Zapisywanie...' : 'Dodaj'}
            </button>
          </div>
        )}

        {fans.length > 0 && (
          <ul className="divide-y divide-border">
            {fans.map((fan) => (
              <li key={fan.id} className="py-2 flex items-center justify-between text-sm">
                <span className="text-foreground">{fan.name ? `${fan.name} · ${fan.email}` : fan.email}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
