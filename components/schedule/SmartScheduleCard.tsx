import { AlertCircle, CheckCircle2, Clock3, Lightbulb } from 'lucide-react';
import type { SmartCampaign, ScheduledPost, Platform } from '@/lib/smart-schedule/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { resolvePublishIssue } from '@/lib/smart-schedule/publish-issues';

const PLATFORM_LABELS: Record<Platform, string> = {
  youtube: 'YouTube',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
};

function resolveStatusBadge(post: ScheduledPost) {
  if (post.status === 'published') {
    return {
      label: 'Opublikowano',
      className: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600',
      icon: CheckCircle2,
    };
  }

  if (post.status === 'failed') {
    return {
      label: 'Błąd',
      className: 'bg-destructive/10 border-destructive/30 text-destructive',
      icon: AlertCircle,
    };
  }

  if (post.status === 'suggested') {
    return {
      label: 'Sugestia AI',
      className: 'bg-primary/10 border-primary/30 text-primary',
      icon: Lightbulb,
    };
  }

  return {
    label: 'Zaplanowano',
    className: 'bg-secondary/40 border-border text-foreground',
    icon: Clock3,
  };
}

type SmartScheduleCardProps = {
  campaign: SmartCampaign;
  platformErrors?: Partial<Record<Platform, string>>;
  onApplySuggestions?: (campaignId: string) => void;
  onOpenDetails?: (campaignId: string) => void;
  onRetryFailed?: (campaignId: string) => void;
};

export function SmartScheduleCard({
  campaign,
  platformErrors,
  onApplySuggestions,
  onOpenDetails,
  onRetryFailed,
}: SmartScheduleCardProps) {
  const nextEntries = [...campaign.posts, ...campaign.suggestedPosts]
    .sort((left, right) => new Date(left.scheduledTime).getTime() - new Date(right.scheduledTime).getTime())
    .slice(0, 4);

  const suggestionsCount = campaign.suggestedPosts.length;
  const platformStatus = campaign.channels.map((platform) => {
    const postsForPlatform = campaign.posts.filter((post) => post.platform === platform);

    const hasFailed = postsForPlatform.some((post) => post.status === 'failed');
    const hasPending = postsForPlatform.some((post) => post.status === 'pending');
    const hasPublished = postsForPlatform.some((post) => post.status === 'published');

    const tone = hasFailed
      ? 'bg-destructive border-destructive/30'
      : hasPending
        ? 'bg-amber-500 border-amber-500/30'
        : hasPublished
          ? 'bg-emerald-500 border-emerald-500/30'
          : 'bg-muted border-border';

    return {
      platform,
      hasFailed,
      hasPending,
      hasPublished,
      tone,
    };
  });

  const failedCount = campaign.posts.filter((post) => post.status === 'failed').length;
  const pendingCount = campaign.posts.filter((post) => post.status === 'pending').length;
  const publishedCount = campaign.posts.filter((post) => post.status === 'published').length;

  const aggregatedStatus =
    failedCount > 0 && (pendingCount > 0 || publishedCount > 0)
      ? 'Częściowy błąd'
      : failedCount > 0
        ? 'Błąd kampanii'
        : pendingCount > 0
          ? 'W realizacji'
          : publishedCount > 0
            ? 'Opublikowano'
            : 'Brak statusu';

  const aggregatedStatusClass =
    aggregatedStatus === 'Częściowy błąd'
      ? 'bg-amber-500/10 border-amber-500/30 text-amber-600'
      : aggregatedStatus === 'Błąd kampanii'
        ? 'bg-destructive/10 border-destructive/30 text-destructive'
        : aggregatedStatus === 'W realizacji'
          ? 'bg-blue-500/10 border-blue-500/30 text-blue-600'
          : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600';

  return (
    <Card className="border-border bg-card/95">
      <CardHeader className="gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold text-foreground">{campaign.name}</CardTitle>
            <CardDescription className="mt-1 text-xs">
              Kampania multi-platformowa • {campaign.channels.map((platform) => PLATFORM_LABELS[platform]).join(', ')}
            </CardDescription>
            <div className="mt-2 flex items-center gap-2">
              <span className={`inline-flex items-center rounded-md border px-2 py-1 text-xs ${aggregatedStatusClass}`}>
                {aggregatedStatus}
              </span>
              <div className="flex items-center gap-1">
                {platformStatus.map((item) => (
                  <span
                    key={item.platform}
                    title={`${PLATFORM_LABELS[item.platform]} • ${item.hasFailed ? 'Błąd' : item.hasPending ? 'Oczekuje' : item.hasPublished ? 'Opublikowano' : 'Brak danych'}`}
                    className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full border text-[10px] text-white ${item.tone}`}
                  >
                    {PLATFORM_LABELS[item.platform][0]}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onOpenDetails?.(campaign.id)}
              className="rounded-lg border border-border bg-secondary/50 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary transition-all"
            >
              Szczegóły
            </button>
            {failedCount > 0 && (
              <button
                onClick={() => onRetryFailed?.(campaign.id)}
                className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/20 transition-all"
              >
                Ponów dla wszystkich błędów
              </button>
            )}
            {suggestionsCount > 0 && (
              <button
                onClick={() => onApplySuggestions?.(campaign.id)}
                className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-all"
              >
                Zastosuj sugestie ({suggestionsCount})
              </button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="overflow-hidden rounded-lg border border-border bg-secondary/20">
          <img
            src={campaign.content.mediaUrl}
            alt={`Miniatura kampanii ${campaign.name}`}
            className="h-36 w-full object-cover"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {campaign.content.tags.slice(0, 8).map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
        </div>

        <div className="space-y-2">
          {nextEntries.map((post) => {
            const badge = resolveStatusBadge(post);
            const Icon = badge.icon;

            return (
              <div
                key={post.id}
                className="rounded-lg border border-border bg-secondary/20 px-3 py-2 flex items-center justify-between gap-3"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {PLATFORM_LABELS[post.platform]} • {new Date(post.scheduledTime).toLocaleString('pl-PL')}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {post.status === 'published' && post.remotePostUrl ? (
                    <a
                      href={post.remotePostUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:opacity-90 ${badge.className}`}
                      title="Otwórz opublikowany post"
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {badge.label}
                    </a>
                  ) : (
                    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${badge.className}`}>
                      <Icon className="h-3.5 w-3.5" />
                      {badge.label}
                    </span>
                  )}

                  {platformErrors?.[post.platform] && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-secondary/60">
                          Szczegóły
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-80">
                        {(() => {
                          const issue = resolvePublishIssue(platformErrors[post.platform]);

                          if (!issue) {
                            return null;
                          }

                          return (
                            <>
                              <p className="text-xs font-medium text-foreground">Problem publikacji ({PLATFORM_LABELS[post.platform]})</p>
                              <p className="mt-2 text-xs text-muted-foreground break-words">{issue.message}</p>

                              {issue.actionHref && issue.actionLabel && (
                                <a
                                  href={issue.actionHref}
                                  className="inline-flex mt-3 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20"
                                >
                                  {issue.actionLabel}
                                </a>
                              )}

                              {issue.rawTechnical && (
                                <details className="mt-3">
                                  <summary className="text-xs text-muted-foreground cursor-pointer">Pokaż log techniczny</summary>
                                  <p className="mt-2 text-[11px] text-muted-foreground break-words whitespace-pre-wrap">
                                    {issue.rawTechnical}
                                  </p>
                                </details>
                              )}
                            </>
                          );
                        })()}
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
