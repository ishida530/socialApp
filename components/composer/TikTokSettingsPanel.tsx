import { useState } from 'react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { TIKTOK_PRIVACY_LABEL } from './types';
import type { DraftJob, TikTokCreatorInfoResponse } from './types';
import type { useTikTokCreatorInfo } from './useTikTokCreatorInfo';

// TikTok Content Posting API - Content Sharing Guidelines, "Required UX Implementation"
// (audit rejection ref 20260913074631, reworked 2026-09-30). Rules this panel implements:
//   1a  creator nickname shown, fetched fresh for the job's own account (TikTokCreatorBadge)
//   1b  "creator can't post right now" blocks the flow with a "try again later" prompt
//   1c  video duration checked against max_video_post_duration_sec
//   2b  privacy options straight from creator_info, no default value
//   2c  Comment/Duet/Stitch unchecked by default, greyed out when the creator disabled them,
//       and only "Allow Comment" for photo posts
//   3   Commercial Content Disclosure off by default; Branded Content disabled while privacy is
//       "Only me" (and "Only me" disabled while Branded Content is on), with TikTok's own prompts
// Nothing here auto-saves - every field stays unset until the user picks it.

export const TIKTOK_PROMPT_INCOMPLETE_DISCLOSURE =
  'You need to indicate if your content promotes yourself, a third party, or both.';
export const TIKTOK_PROMPT_BRANDED_NOT_PRIVATE = 'Branded content visibility cannot be set to private.';

export function tiktokLabelPrompt(mediaType: 'VIDEO' | 'IMAGE', brandOrganic: boolean, brandedContent: boolean) {
  const noun = mediaType === 'IMAGE' ? 'photo' : 'video';
  if (brandedContent) {
    return `Your ${noun} will be labeled as 'Paid partnership'`;
  }
  if (brandOrganic) {
    return `Your ${noun} will be labeled as 'Promotional content'`;
  }
  return null;
}

export function TikTokCreatorBadge({ info }: { info: TikTokCreatorInfoResponse | null }) {
  if (!info) {
    return null;
  }

  const nickname = info.creatorInfo?.creator_nickname || info.account.handle;
  const username = info.creatorInfo?.creator_username;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2">
      {info.creatorInfo?.creator_avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={info.creatorInfo.creator_avatar_url}
          alt=""
          className="h-7 w-7 rounded-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : null}
      <p className="text-xs text-foreground">
        Publikujesz na koncie TikTok (posting to):{' '}
        <span className="font-semibold">{nickname}</span>
        {username ? <span className="text-muted-foreground"> @{username}</span> : null}
      </p>
    </div>
  );
}

export function TikTokCannotPostNotice({ reason, onRetry }: { reason: string; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 space-y-2">
      <p className="text-xs text-destructive font-medium">{reason}</p>
      <p className="text-xs text-muted-foreground">
        Publikacja na TikTok jest wstrzymana. Spróbuj ponownie później (please try again later).
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="px-3 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground"
      >
        Sprawdź ponownie
      </button>
    </div>
  );
}

// Rendered inside the final "Post to TikTok" block (ScheduleStep), which owns the creator_info
// fetch and already shows the nickname badge and the "can't post right now" notice - this panel
// only renders the post settings themselves.
export function TikTokSettingsPanel({
  job,
  onSaveNow,
  creator,
}: {
  job: DraftJob;
  onSaveNow: (patch: Record<string, unknown>) => Promise<unknown>;
  creator: ReturnType<typeof useTikTokCreatorInfo>;
}) {
  const { data, isLoading, loadError, reload } = creator;
  const [isSaving, setIsSaving] = useState(false);
  const creatorInfo = data?.creatorInfo ?? null;
  const isPhoto = job.video.mediaType === 'IMAGE';

  const handleChange = async (patch: Record<string, unknown>) => {
    setIsSaving(true);
    try {
      await onSaveNow(patch);
    } catch (error: unknown) {
      toast.error(
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Nie udało się zapisać ustawień TikToka.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const durationTooLong =
    !isPhoto &&
    typeof creatorInfo?.max_video_post_duration_sec === 'number' &&
    job.video.durationSec !== null &&
    job.video.durationSec > creatorInfo.max_video_post_duration_sec;

  const disclosureEnabled = job.tiktokDisclosureEnabled === true;
  const brandOrganic = job.tiktokBrandOrganic === true;
  const brandedContent = job.tiktokBrandedContent === true;
  const disclosureIncomplete = disclosureEnabled && !brandOrganic && !brandedContent;
  const privacyIsSelfOnly = job.tiktokPrivacyLevel === 'SELF_ONLY';
  const labelPrompt = disclosureEnabled ? tiktokLabelPrompt(job.video.mediaType, brandOrganic, brandedContent) : null;

  const saveInteraction = (field: 'tiktokAllowComment' | 'tiktokAllowDuet' | 'tiktokAllowStitch', checked: boolean) => {
    void handleChange({ [field]: checked });
  };

  const interactions: Array<{
    field: 'tiktokAllowComment' | 'tiktokAllowDuet' | 'tiktokAllowStitch';
    label: string;
    checked: boolean;
    disabledByCreator: boolean;
  }> = [
    {
      field: 'tiktokAllowComment',
      label: 'Zezwól na komentarze (Allow Comment)',
      checked: job.tiktokAllowComment === true,
      disabledByCreator: creatorInfo?.comment_disabled === true,
    },
    ...(isPhoto
      ? []
      : [
          {
            field: 'tiktokAllowDuet' as const,
            label: 'Zezwól na Duet (Allow Duet)',
            checked: job.tiktokAllowDuet === true,
            disabledByCreator: creatorInfo?.duet_disabled === true,
          },
          {
            field: 'tiktokAllowStitch' as const,
            label: 'Zezwól na Stitch (Allow Stitch)',
            checked: job.tiktokAllowStitch === true,
            disabledByCreator: creatorInfo?.stitch_disabled === true,
          },
        ]),
  ];

  return (
    <div className="space-y-3 rounded-lg border border-border bg-background/40 p-3">
      <p className="text-sm font-medium text-foreground">Ustawienia publikacji TikTok</p>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Pobieranie ustawień konta TikTok...</p>
      ) : loadError ? (
        <div className="space-y-2">
          <p className="text-xs text-destructive">{loadError}</p>
          <button
            type="button"
            onClick={reload}
            className="px-3 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground"
          >
            Spróbuj ponownie
          </button>
        </div>
      ) : data && !data.canPost ? null : (
        <>
          <div>
            <label htmlFor={`tiktok-privacy-${job.id}`} className="text-xs text-muted-foreground mb-2 block">
              Kto może zobaczyć ten post (Who can view this post)
            </label>
            <select
              id={`tiktok-privacy-${job.id}`}
              value={job.tiktokPrivacyLevel ?? ''}
              onChange={(event) => handleChange({ tiktokPrivacyLevel: event.target.value })}
              disabled={isSaving}
              className="w-full px-3 py-2 bg-secondary/30 border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="" disabled>
                -- wybierz (select) --
              </option>
              {(creatorInfo?.privacy_level_options || []).map((option) => {
                const blockedByBranded = option === 'SELF_ONLY' && brandedContent;
                return (
                  <option
                    key={option}
                    value={option}
                    disabled={blockedByBranded}
                    title={blockedByBranded ? TIKTOK_PROMPT_BRANDED_NOT_PRIVATE : undefined}
                  >
                    {TIKTOK_PRIVACY_LABEL[option] ?? option}
                  </option>
                );
              })}
            </select>
            {brandedContent && (
              <p className="text-xs text-muted-foreground mt-1">{TIKTOK_PROMPT_BRANDED_NOT_PRIVATE}</p>
            )}
          </div>

          <div className="space-y-2">
            {interactions.map((item) => (
              <label
                key={item.field}
                title={item.disabledByCreator ? 'Wyłączone w ustawieniach Twojego konta TikTok.' : undefined}
                className={`flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs ${
                  item.disabledByCreator ? 'text-muted-foreground opacity-60' : 'text-foreground'
                }`}
              >
                <Checkbox
                  checked={item.checked && !item.disabledByCreator}
                  onCheckedChange={(checked) => saveInteraction(item.field, checked === true)}
                  disabled={isSaving || item.disabledByCreator}
                />
                {item.label}
                {item.disabledByCreator && <span className="ml-auto">wyłączone na koncie</span>}
              </label>
            ))}
          </div>

          {durationTooLong && (
            <p className="text-xs text-destructive">
              Materiał ({job.video.durationSec}s) przekracza limit TikTok dla tego konta (
              {creatorInfo!.max_video_post_duration_sec}s). Skróć go albo odznacz TikToka.
            </p>
          )}

          <div className="rounded-lg border border-border p-3 space-y-2">
            <label className="flex items-center justify-between gap-2">
              <span className="text-xs text-foreground">
                Ujawnij treść komercyjną (Disclose commercial content)
                <span className="block text-muted-foreground">
                  Ta treść promuje Ciebie, markę, produkt lub usługę.
                </span>
              </span>
              <Switch
                checked={disclosureEnabled}
                onCheckedChange={(checked) =>
                  handleChange(
                    checked
                      ? { tiktokDisclosureEnabled: true }
                      : { tiktokDisclosureEnabled: false, tiktokBrandOrganic: false, tiktokBrandedContent: false },
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
                    Twoja marka (Your brand)
                    <span className="block text-muted-foreground">
                      Promujesz siebie lub własną firmę. Treść zostanie oznaczona jako „Promotional content”.
                    </span>
                  </span>
                </label>
                <label
                  className={`flex items-start gap-2 text-xs ${privacyIsSelfOnly ? 'text-muted-foreground opacity-60' : 'text-foreground'}`}
                  title={privacyIsSelfOnly ? TIKTOK_PROMPT_BRANDED_NOT_PRIVATE : undefined}
                >
                  <Checkbox
                    checked={brandedContent}
                    onCheckedChange={(checked) => handleChange({ tiktokBrandedContent: checked === true })}
                    disabled={isSaving || (privacyIsSelfOnly && !brandedContent)}
                  />
                  <span>
                    Treść sponsorowana (Branded content)
                    <span className="block text-muted-foreground">
                      Promujesz inną markę lub podmiot trzeci. Treść zostanie oznaczona jako „Paid partnership”.
                    </span>
                    {privacyIsSelfOnly && (
                      <span className="block text-destructive mt-0.5">{TIKTOK_PROMPT_BRANDED_NOT_PRIVATE}</span>
                    )}
                  </span>
                </label>

                {labelPrompt && <p className="text-xs font-medium text-foreground">{labelPrompt}</p>}

                {disclosureIncomplete && (
                  <p className="text-xs text-destructive">{TIKTOK_PROMPT_INCOMPLETE_DISCLOSURE}</p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
