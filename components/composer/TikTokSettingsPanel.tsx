import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import type { DraftJob, TikTokCreatorInfo } from './types';

export function TikTokSettingsPanel({
  job,
  onSaveNow,
}: {
  job: DraftJob;
  onSaveNow: (patch: Record<string, unknown>) => Promise<unknown>;
}) {
  const [creatorInfo, setCreatorInfo] = useState<TikTokCreatorInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setIsLoading(true);
        const response = await apiClient.get<{ creatorInfo: TikTokCreatorInfo | null }>(
          '/social-accounts/tiktok/creator-info',
        );
        if (cancelled) {
          return;
        }
        setCreatorInfo(response.data.creatorInfo);

        const privacyOptions = Array.isArray(response.data.creatorInfo?.privacy_level_options)
          ? response.data.creatorInfo!.privacy_level_options!
          : [];

        if (!job.tiktokPrivacyLevel && privacyOptions.length > 0) {
          void onSaveNow({
            tiktokPrivacyLevel: privacyOptions[0],
            tiktokAllowComment: !(response.data.creatorInfo?.comment_disabled ?? false),
            tiktokAllowDuet: !(response.data.creatorInfo?.duet_disabled ?? false),
            tiktokAllowStitch: !(response.data.creatorInfo?.stitch_disabled ?? false),
          });
        }
      } catch {
        if (!cancelled) {
          toast.error('Nie udało się pobrać ustawień publikacji TikTok.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id]);

  const handleChange = async (patch: Record<string, unknown>) => {
    setIsSaving(true);
    try {
      await onSaveNow(patch);
    } catch {
      toast.error('Nie udało się zapisać ustawień TikToka.');
    } finally {
      setIsSaving(false);
    }
  };

  const durationTooLong =
    typeof creatorInfo?.max_video_post_duration_sec === 'number' &&
    job.video.durationSec !== null &&
    job.video.durationSec > creatorInfo.max_video_post_duration_sec;

  return (
    <div className="space-y-3 rounded-lg border border-border bg-background/40 p-3">
      <p className="text-sm font-medium text-foreground">Ustawienia publikacji TikTok</p>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Pobieranie ustawień konta TikTok...</p>
      ) : (
        <>
          <div>
            <label className="text-xs text-muted-foreground mb-2 block">Prywatność postu</label>
            <select
              value={job.tiktokPrivacyLevel ?? ''}
              onChange={(event) => handleChange({ tiktokPrivacyLevel: event.target.value })}
              disabled={isSaving}
              className="w-full px-3 py-2 bg-secondary/30 border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {(creatorInfo?.privacy_level_options || []).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-foreground">
              <Switch
                checked={job.tiktokAllowComment ?? true}
                onCheckedChange={(checked) => handleChange({ tiktokAllowComment: checked })}
                disabled={isSaving || creatorInfo?.comment_disabled === true}
              />
              Komentarze
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-foreground">
              <Switch
                checked={job.tiktokAllowDuet ?? true}
                onCheckedChange={(checked) => handleChange({ tiktokAllowDuet: checked })}
                disabled={isSaving || creatorInfo?.duet_disabled === true}
              />
              Duet
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-foreground">
              <Switch
                checked={job.tiktokAllowStitch ?? true}
                onCheckedChange={(checked) => handleChange({ tiktokAllowStitch: checked })}
                disabled={isSaving || creatorInfo?.stitch_disabled === true}
              />
              Stitch
            </label>
          </div>

          {durationTooLong && (
            <p className="text-xs text-destructive">
              Materiał ({job.video.durationSec}s) przekracza limit TikTok dla tego konta ({creatorInfo!.max_video_post_duration_sec}s).
            </p>
          )}
        </>
      )}

      <label className="flex items-start gap-2 rounded-lg border border-border bg-background/40 p-3">
        <Checkbox
          checked={Boolean(job.tiktokConsentAt)}
          onCheckedChange={(checked) => handleChange({ tiktokConsent: checked === true })}
          disabled={isSaving}
          className="mt-0.5"
        />
        <span className="text-xs text-muted-foreground">
          Potwierdzam, że publikacja na TikTok jest inicjowana ręcznie przeze mnie i zgadza się z warunkami TikTok
          Music Usage Confirmation.
        </span>
      </label>
    </div>
  );
}
