import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import type { DraftJob, TikTokCreatorInfo } from './types';

// 2026-09-30 (TikTok Content Posting API audit rejection, ref 20260913074631): this panel used
// to auto-save the first privacy option and default Comment/Duet/Stitch to "on" as soon as
// creator-info loaded - TikTok's Content Sharing Guidelines explicitly forbid both ("no default
// value" for privacy, "none should be checked by default" for interactions). Nothing here
// auto-saves anymore; every field starts unset/unchecked until the user picks it themselves.
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
        if (!cancelled) {
          setCreatorInfo(response.data.creatorInfo);
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

  const disclosureEnabled = job.tiktokDisclosureEnabled === true;
  const brandOrganic = job.tiktokBrandOrganic === true;
  const brandedContent = job.tiktokBrandedContent === true;
  const disclosureIncomplete = disclosureEnabled && !brandOrganic && !brandedContent;

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
              <option value="" disabled>
                -- wybierz --
              </option>
              {(creatorInfo?.privacy_level_options || []).map((option) => (
                <option key={option} value={option} disabled={option === 'SELF_ONLY' && brandedContent}>
                  {option}
                </option>
              ))}
            </select>
            {/* "Branded content visibility cannot be set to private" (guideline 3b). Reachable if
                brandedContent was toggled on after SELF_ONLY was already saved - the dropdown
                option above is disabled going forward, but the already-saved value still needs
                a visible prompt to change it. */}
            {brandedContent && job.tiktokPrivacyLevel === 'SELF_ONLY' && (
              <p className="text-xs text-destructive mt-1">
                Treść sponsorowana nie może być prywatna — wybierz inną prywatność.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-foreground">
              <Switch
                checked={job.tiktokAllowComment === true}
                onCheckedChange={(checked) => handleChange({ tiktokAllowComment: checked })}
                disabled={isSaving || creatorInfo?.comment_disabled === true}
              />
              Komentarze
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-foreground">
              <Switch
                checked={job.tiktokAllowDuet === true}
                onCheckedChange={(checked) => handleChange({ tiktokAllowDuet: checked })}
                disabled={isSaving || creatorInfo?.duet_disabled === true}
              />
              Duet
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-foreground">
              <Switch
                checked={job.tiktokAllowStitch === true}
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

          {/* Commercial Content Disclosure (TikTok Content Sharing Guidelines sekcja 3) - master
              toggle domyślnie WYŁĄCZONY, a po włączeniu wymaga wybrania co najmniej jednej z
              dwóch opcji poniżej, obie też domyślnie odznaczone. */}
          <div className="rounded-lg border border-border p-3 space-y-2">
            <label className="flex items-center justify-between gap-2">
              <span className="text-xs text-foreground">
                Ta treść promuje mnie, markę, produkt lub usługę
              </span>
              <Switch
                checked={disclosureEnabled}
                onCheckedChange={(checked) =>
                  handleChange(
                    checked ? { tiktokDisclosureEnabled: true } : { tiktokDisclosureEnabled: false, tiktokBrandOrganic: false, tiktokBrandedContent: false },
                  )
                }
                disabled={isSaving}
              />
            </label>

            {disclosureEnabled && (
              <div className="space-y-2 pt-1">
                <label className="flex items-start gap-2 text-xs text-foreground">
                  <Checkbox
                    checked={brandOrganic}
                    onCheckedChange={(checked) => handleChange({ tiktokBrandOrganic: checked === true })}
                    disabled={isSaving}
                  />
                  <span>
                    Twoja marka — promujesz siebie lub własną firmę.
                    {brandOrganic && !brandedContent && (
                      <span className="block text-muted-foreground mt-0.5">
                        Treść zostanie oznaczona jako „Promotional content”.
                      </span>
                    )}
                  </span>
                </label>
                <label className="flex items-start gap-2 text-xs text-foreground">
                  <Checkbox
                    checked={brandedContent}
                    onCheckedChange={(checked) => handleChange({ tiktokBrandedContent: checked === true })}
                    disabled={isSaving}
                  />
                  <span>
                    Treść sponsorowana — promujesz inną markę/podmiot trzeci.
                    {brandedContent && (
                      <span className="block text-muted-foreground mt-0.5">
                        Treść zostanie oznaczona jako „Paid partnership”. Prywatność nie może być ustawiona na „tylko ja”.
                      </span>
                    )}
                  </span>
                </label>
                {disclosureIncomplete && (
                  <p className="text-xs text-destructive" title="Wskaż, czy treść promuje Ciebie, podmiot trzeci, czy oba.">
                    Zaznacz „Twoja marka” i/lub „Treść sponsorowana”, żeby móc opublikować.
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
