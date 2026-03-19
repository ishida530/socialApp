import { Hash, Calendar, Send, Sparkles, Gem } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { planLabel } from '@/lib/billing/labels';
import type { PlanTier } from '@/lib/billing/types';
import { useBillingCapabilities } from '@/hooks/useBillingCapabilities';
import { VideoUploader } from './VideoUploader';

type PlatformKey = keyof typeof platformLimits;
type ComposerStep = 'media' | 'content' | 'schedule';

type CampaignPlatformContent = {
  caption: string;
  hashtags: string[];
  aiScore?: number;
};

const platformLimits = {
  youtube: 5000,
  tiktok: 2200,
  instagram: 2200,
  facebook: 63206,
};

const hashtagPresets = [
  '#viral',
  '#trending',
  '#contentcreator',
  '#socialmedia',
  '#videomarketing',
  '#digitalmarketing',
];

const platformOrder: PlatformKey[] = ['youtube', 'tiktok', 'instagram', 'facebook'];

function createInitialCampaignContent(initialCaption = ''): Record<PlatformKey, CampaignPlatformContent> {
  return {
    youtube: { caption: initialCaption, hashtags: [] },
    tiktok: { caption: initialCaption, hashtags: [] },
    instagram: { caption: initialCaption, hashtags: [] },
    facebook: { caption: initialCaption, hashtags: [] },
  };
}

function apiPlatformToKey(platform: 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'FACEBOOK'): PlatformKey {
  if (platform === 'YOUTUBE') return 'youtube';
  if (platform === 'TIKTOK') return 'tiktok';
  if (platform === 'INSTAGRAM') return 'instagram';
  return 'facebook';
}

export function PostComposer() {
  const [activeStep, setActiveStep] = useState<ComposerStep>('media');
  const [campaignBrief, setCampaignBrief] = useState('');
  const [isAiCropEnabled, setIsAiCropEnabled] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformKey>('youtube');
  const [campaignContent, setCampaignContent] = useState<Record<PlatformKey, CampaignPlatformContent>>(
    createInitialCampaignContent(),
  );
  const [publishScope, setPublishScope] = useState<'all' | 'selected'>('all');
  const [selectedPublishPlatforms, setSelectedPublishPlatforms] = useState<Set<PlatformKey>>(new Set());
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAutoPilotRunning, setIsAutoPilotRunning] = useState(false);
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  const [videos, setVideos] = useState<Array<{ id: string; title: string; createdAt?: string }>>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string>('');
  const [connectedPlatforms, setConnectedPlatforms] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<
    Array<{
      id: string;
      caption: string;
      platform: 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'FACEBOOK';
      hashtags: string[];
      scheduledFor: string | null;
      createdAt: string;
      videoId: string | null;
      video?: { id: string; title: string } | null;
    }>
  >([]);
  const [effectivePlan, setEffectivePlan] = useState<PlanTier>('FREE');
  const [aiRunUsage, setAiRunUsage] = useState<{ count: number; limit: number | null }>({ count: 0, limit: null });
  const [socialAccountsLimit, setSocialAccountsLimit] = useState(1);
  const capabilities = useBillingCapabilities();
  const [isPlanLoading, setIsPlanLoading] = useState(true);

  const bootstrapComposerData = useCallback(async () => {
      try {
        const [videosResponse, accountsResponse, draftsResponse, billingResponse] = await Promise.all([
          apiClient.get<Array<{ id: string; title: string; createdAt?: string }>>('/videos'),
          apiClient.get<Array<{ platform: 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'FACEBOOK' }>>('/social-accounts'),
          apiClient.get<
            Array<{
              id: string;
              caption: string;
              platform: 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'FACEBOOK';
              hashtags: string[];
              scheduledFor: string | null;
              createdAt: string;
              videoId: string | null;
              video?: { id: string; title: string } | null;
            }>
          >('/drafts'),
          apiClient.get<{
            subscription: {
              plan: PlanTier;
              effectivePlan?: PlanTier;
            };
            catalog?: Array<{
              tier: PlanTier;
              limits: {
                social_accounts: number;
              };
            }>;
            usage?: {
              ai_autopilot_runs?: {
                count: number;
                limit: number | null;
              };
            };
          }>('/billing/subscription'),
        ]);

        const nextVideos = videosResponse.data;
        setVideos(nextVideos);

        const nextSelectedVideo = nextVideos[0]?.id ?? '';
        setSelectedVideoId(nextSelectedVideo);

        const nextConnectedPlatforms = new Set(
          accountsResponse.data.map((account) => account.platform.toLowerCase()),
        );
        setConnectedPlatforms(nextConnectedPlatforms);
        setSelectedPublishPlatforms(new Set(nextConnectedPlatforms as Set<PlatformKey>));
        setDrafts(draftsResponse.data);

        const currentEffectivePlan =
          billingResponse.data.subscription.effectivePlan ||
          billingResponse.data.subscription.plan;
        setEffectivePlan(currentEffectivePlan);

        const currentPlanCatalog = billingResponse.data.catalog?.find((plan) => plan.tier === currentEffectivePlan);
        setSocialAccountsLimit(currentPlanCatalog?.limits.social_accounts ?? 1);

        setAiRunUsage({
          count: billingResponse.data.usage?.ai_autopilot_runs?.count ?? 0,
          limit: billingResponse.data.usage?.ai_autopilot_runs?.limit ?? null,
        });
        setIsPlanLoading(false);

        if (nextSelectedVideo === '') {
          toast.error('Brak dostępnego filmu. Najpierw prześlij wideo.');
        }
      } catch {
        setVideos([]);
        setSelectedVideoId('');
        setConnectedPlatforms(new Set());
        setSelectedPublishPlatforms(new Set());
        setDrafts([]);
        setEffectivePlan('FREE');
        setSocialAccountsLimit(1);
        setAiRunUsage({ count: 0, limit: 0 });
        setIsPlanLoading(false);
      }
    }, []);

  const maxSelectablePlatforms = Math.max(1, Math.min(socialAccountsLimit, platformOrder.length));

  const planSubtitle = useMemo(() => {
    if (effectivePlan === 'FREE') {
      return capabilities.free.subtitle;
    }

    const slug = effectivePlan.toLowerCase() as 'starter' | 'pro' | 'business';
    const plan = capabilities.plans.find((item) => item.slug === slug);
    if (!plan) {
      return 'Plan płatny aktywny.';
    }

    return `${plan.name}: ${plan.platformsLabel}, konta na platformę: ${plan.accountsPerPlatformLabel}, ${plan.monthlyVideoLabel} wideo/mies.`;
  }, [capabilities.free.subtitle, capabilities.plans, effectivePlan]);

  const autoPilotTierLabel =
    effectivePlan === 'BUSINESS'
      ? 'Business: Asystent AI bez limitu'
      : effectivePlan === 'PRO'
        ? 'Pro: Asystent AI (15 uruchomień / mies.)'
        : effectivePlan === 'STARTER'
          ? 'Starter: bez Asystenta AI'
        : 'Free: AI Mini (1 opis na post)';

  const hasAutoPilotLiteAccess = effectivePlan === 'PRO' || effectivePlan === 'BUSINESS';

  useEffect(() => {
    void bootstrapComposerData();

    const onVideosRefresh = () => {
      void bootstrapComposerData();
    };

    window.addEventListener('videos:refresh', onVideosRefresh);
    return () => {
      window.removeEventListener('videos:refresh', onVideosRefresh);
    };
  }, [bootstrapComposerData]);

  const currentLimit = platformLimits[selectedPlatform];
  const currentPlatformContent = campaignContent[selectedPlatform];
  const remainingChars = currentLimit - currentPlatformContent.caption.length;

  const scheduledDateTime = useMemo(() => {
    if (!scheduledDate || !scheduledTime) {
      return null;
    }

    return `${scheduledDate}T${scheduledTime}:00`;
  }, [scheduledDate, scheduledTime]);

  const selectedVideo = useMemo(
    () => videos.find((video) => video.id === selectedVideoId),
    [selectedVideoId, videos],
  );

  const suggestedDateTime = useMemo(() => {
    const next = new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(18, 0, 0, 0);
    return next;
  }, []);

  const freePlanMaxDate = useMemo(() => {
    const maxAllowed = new Date(Date.now() + 72 * 60 * 60 * 1000);
    return maxAllowed.toISOString().slice(0, 10);
  }, []);

  const selectedPlatformConnected = connectedPlatforms.has(selectedPlatform);
  const connectedPlatformList = useMemo(
    () => Object.keys(platformLimits).filter((platform) => connectedPlatforms.has(platform)) as PlatformKey[],
    [connectedPlatforms],
  );
  const publishablePlatformList = useMemo(
    () => connectedPlatformList.slice(0, maxSelectablePlatforms),
    [connectedPlatformList, maxSelectablePlatforms],
  );

  const updatePlatformContent = (
    platform: PlatformKey,
    updater: (current: CampaignPlatformContent) => CampaignPlatformContent,
  ) => {
    setCampaignContent((current) => ({
      ...current,
      [platform]: updater(current[platform]),
    }));
  };

  const toDateInputValue = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const toTimeInputValue = (date: Date) => {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const runAutoPilot = async () => {
    if (!campaignBrief.trim()) {
      toast.error('Wpisz temat kampanii, aby uruchomić Asystenta AI.');
      return;
    }

    if (!selectedVideoId) {
      toast.error('Najpierw prześlij lub wybierz wideo.');
      return;
    }

    if (!hasAutoPilotLiteAccess) {
      const trimmed = campaignBrief.trim();
      const generated = `${trimmed}\n\nSprawdź więcej w bio i daj znać w komentarzu, co testujemy następnie.`;
      const defaultTags = hashtagPresets.slice(0, 3);

      updatePlatformContent(selectedPlatform, (current) => ({
        ...current,
        caption: generated,
        hashtags: current.hashtags.length > 0 ? current.hashtags : defaultTags,
        aiScore: 0.58,
      }));

      toast.success('AI Mini wygenerował opis dla wybranej platformy. Przejdź na plan Pro, aby odblokować Asystenta AI.');
      return;
    }

    try {
      setIsAutoPilotRunning(true);

      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Warsaw';
      const idempotencyKey = `autopilot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const response = await apiClient.post<{
        analysis?: {
          persona: 'video_creator' | 'ecommerce_owner' | 'real_estate_agent' | 'neutral';
          confidence: number;
          safetyFlags: Array<{ code: string; severity: 'low' | 'medium' | 'critical'; message: string }>;
        };
        platformBundles: Array<{
          platform: 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'FACEBOOK';
          title?: string;
          caption: string;
          hashtags: string[];
          cta?: string;
        }>;
        schedule: Array<{
          platform: 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'FACEBOOK';
          scheduledFor: string;
          timezone: string;
          score: number;
          reason: string;
        }>;
        strategySummary?: string;
        warnings: string[];
        usedAI: boolean;
      }>('/orchestrate-content', {
        rawInput: campaignBrief.trim(),
        timezone: timeZone,
        mode: 'ai-autopilot',
        publishMode: 'draft',
        idempotencyKey,
      });

      const bundles = response.data.platformBundles || [];
      if (bundles.length === 0) {
        toast.error('Asystent AI nie zwrócił rekomendacji dla platform.');
        return;
      }

      const selectedPlatformUpper = selectedPlatform.toUpperCase();
      const preferredBundle =
        bundles.find((bundle) => bundle.platform === selectedPlatformUpper) || bundles[0];

      setCampaignContent((current) => {
        const next = { ...current };

        bundles.forEach((bundle) => {
          const key = apiPlatformToKey(bundle.platform);
          const estimatedScore = Math.max(0.35, Math.min(0.99, 1 - Math.max(bundle.caption.length - platformLimits[key], 0) / platformLimits[key]));
          next[key] = {
            caption: bundle.caption,
            hashtags: Array.isArray(bundle.hashtags) ? bundle.hashtags : [],
            aiScore: Number(estimatedScore.toFixed(2)),
          };
        });

        return next;
      });

      const scheduleForPreferred =
        response.data.schedule.find((slot) => slot.platform === preferredBundle.platform) ||
        response.data.schedule[0];

      if (scheduleForPreferred?.scheduledFor) {
        const parsedSchedule = new Date(scheduleForPreferred.scheduledFor);
        if (!Number.isNaN(parsedSchedule.getTime())) {
          setScheduledDate(toDateInputValue(parsedSchedule));
          setScheduledTime(toTimeInputValue(parsedSchedule));
        }
      }

      const connectedPlatformsUpper = new Set(
        Array.from(connectedPlatforms).map((platform) => platform.toUpperCase()),
      );

      const targetDraftBundles = bundles.filter((bundle) => connectedPlatformsUpper.has(bundle.platform));
      const bundlesToSave = targetDraftBundles.length > 0 ? targetDraftBundles : [preferredBundle];

      const draftCreationResults = await Promise.allSettled(
        bundlesToSave.map((bundle) => {
          const slot = response.data.schedule.find((entry) => entry.platform === bundle.platform);
          return apiClient.post('/drafts', {
            caption: bundle.caption,
            platform: bundle.platform,
            hashtags: bundle.hashtags,
            scheduledFor: slot?.scheduledFor ?? null,
            videoId: selectedVideoId,
          });
        }),
      );

      const draftsFailed = draftCreationResults.filter((result) => result.status === 'rejected').length;
      const draftsSaved = draftCreationResults.length - draftsFailed;

      const refreshedDrafts = await apiClient.get<
        Array<{
          id: string;
          caption: string;
          platform: 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'FACEBOOK';
          hashtags: string[];
          scheduledFor: string | null;
          createdAt: string;
          videoId: string | null;
          video?: { id: string; title: string } | null;
        }>
      >('/drafts');
      setDrafts(refreshedDrafts.data);

      if (response.data.warnings?.length > 0) {
        toast.warning(`Asystent AI zakończył działanie z ostrzeżeniem: ${response.data.warnings[0]}`);
      } else {
        toast.success(`Asystent AI gotowy. Zapisano szkice: ${draftsSaved}/${draftCreationResults.length}.`);
      }

      if (draftsFailed > 0) {
        toast.error(`Niektóre szkice nie zostały zapisane (${draftsFailed}).`);
      }
    } catch (error: unknown) {
      const responseData = (error as {
        response?: {
          status?: number;
          data?: {
            code?: string;
            message?: string;
          };
        };
      }).response?.data;

      if (responseData?.code === 'FEATURE_NOT_AVAILABLE') {
        toast.error('Asystent AI jest dostępny od planu Pro.');
        return;
      }

      toast.error(responseData?.message || 'Nie udało się uruchomić Asystenta AI.');
    } finally {
      setIsAutoPilotRunning(false);
    }
  };

  const toggleHashtag = (tag: string) => {
    const currentHashtags = campaignContent[selectedPlatform].hashtags;

    if (currentHashtags.includes(tag)) {
      updatePlatformContent(selectedPlatform, (current) => ({
        ...current,
        hashtags: current.hashtags.filter((item) => item !== tag),
      }));
      return;
    }

    updatePlatformContent(selectedPlatform, (current) => ({
      ...current,
      hashtags: [...current.hashtags, tag],
    }));
  };

  const enqueuePublishJob = async (publishNow = false) => {
    if (!selectedVideoId) {
      toast.error('Brak dostępnego filmu. Najpierw prześlij wideo.');
      return;
    }

    const targetPlatforms = publishScope === 'all'
      ? publishablePlatformList
      : Array.from(selectedPublishPlatforms).filter((platform) => connectedPlatforms.has(platform));

    if (targetPlatforms.length === 0) {
      toast.error(
        publishScope === 'all'
          ? 'Brak podłączonych platform. Połącz konto społecznościowe.'
          : 'Wybierz co najmniej jedną podłączoną platformę do publikacji.',
      );
      return;
    }

    if (targetPlatforms.length > maxSelectablePlatforms) {
      toast.error(`Twój plan pozwala publikować maksymalnie na ${maxSelectablePlatforms} kanałach społecznościowych.`);
      return;
    }

    if (!publishNow && !scheduledDateTime) {
      toast.error('Wybierz datę i godzinę publikacji.');
      return;
    }

    if (!publishNow && effectivePlan === 'FREE' && scheduledDateTime) {
      const plannedAt = new Date(scheduledDateTime);
      const maxAllowed = new Date(Date.now() + 72 * 60 * 60 * 1000);
      if (plannedAt.getTime() > maxAllowed.getTime()) {
        toast.error('Plan Free pozwala planować publikacje maksymalnie 72 godziny do przodu.');
        return;
      }
    }

    try {
      setIsSubmitting(true);

      const response = await apiClient.post<{
        success: boolean;
        targetsCount?: number;
        immediateOutcome?: 'succeeded' | 'retryScheduled' | 'failed' | 'skipped' | null;
        immediateOutcomes?: Array<{
          jobId: string;
          platform: 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'FACEBOOK';
          outcome: 'succeeded' | 'retryScheduled' | 'failed' | 'skipped';
        }>;
        publishJob?: {
          socialAccountId?: string;
          errorMessage?: string | null;
        };
      }>('/publish-jobs/enqueue', {
        videoId: selectedVideoId,
        scheduledDate: scheduledDateTime
          ? new Date(scheduledDateTime).toISOString()
          : undefined,
        publishNow,
        targetPlatforms: targetPlatforms.map((platform) => platform.toUpperCase()),
        platformSettings: {
          platform: selectedPlatform,
          description: campaignContent[selectedPlatform].caption,
          tags: campaignContent[selectedPlatform].hashtags,
        },
      });

      if (publishNow) {
        const immediateOutcome = response.data.immediateOutcome;
        const totalTargets = response.data.targetsCount ?? targetPlatforms.length;
        const failedByPlatform = (response.data.immediateOutcomes || [])
          .filter((item) => item.outcome === 'failed')
          .map((item) => item.platform);

        if (immediateOutcome === 'succeeded') {
          toast.success(`Publikacja uruchomiona dla ${totalTargets} platform.`);
        } else if (immediateOutcome === 'retryScheduled') {
          toast.success('Publikacja uruchomiona. Trwa przetwarzanie.');
        } else if (immediateOutcome === 'failed') {
          const oauthScopeMissing =
            response.data.publishJob?.errorMessage?.includes('[oauth-scope-missing]') ?? false;

          if (oauthScopeMissing) {
            toast.error('Brak zgód TikTok. Kliknij „Połącz ponownie” i zaakceptuj zgody.');
            return;
          }

          toast.error('Publikacja nie powiodła się. Sprawdź harmonogram i użyj „Ponów”.');
          if (failedByPlatform.length > 0) {
            toast.error(`Błąd platform: ${failedByPlatform.join(', ')}`);
          }
        } else if (immediateOutcome === 'skipped') {
          toast.error('Nie udało się uruchomić zadania teraz. Użyj „Uruchom” w harmonogramie.');
        } else {
          toast.success('Rozpoczęto publikację teraz.');
        }
      } else {
        toast.success(
          targetPlatforms.length === 1
            ? 'Film został dodany do kolejki.'
            : `Film został dodany do kolejki dla ${targetPlatforms.length} platform.`,
        );
      }

      window.dispatchEvent(new Event('publish-jobs:refresh'));
    } catch {
      toast.error(
        publishNow
          ? 'Nie udało się uruchomić publikacji.'
          : 'Nie udało się dodać filmu do kolejki.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const startPlanCheckout = async (plan: 'STARTER' | 'PRO' | 'BUSINESS') => {
    try {
      setIsCheckoutLoading(true);
      const response = await apiClient.post<{ url?: string; mode?: 'mock' | 'live' }>('/billing/checkout', {
        plan,
      });

      if (response.data.url) {
        window.location.assign(response.data.url);
        return;
      }

      toast.success(`Plan został zaktualizowany do ${planLabel(plan)}.`);
      await bootstrapComposerData();
    } catch {
      toast.error('Nie udało się uruchomić płatności. Spróbuj ponownie.');
    } finally {
      setIsCheckoutLoading(false);
    }
  };

  const togglePublishTarget = (platform: PlatformKey) => {
    setSelectedPublishPlatforms((current) => {
      const next = new Set(current);
      if (next.has(platform)) {
        next.delete(platform);
      } else {
        if (next.size >= maxSelectablePlatforms) {
          toast.warning(`Maksymalnie ${maxSelectablePlatforms} kanałów dla Twojego planu.`);
          return next;
        }
        next.add(platform);
      }
      return next;
    });
  };

  const saveDraft = async () => {
    if (!campaignContent[selectedPlatform].caption.trim()) {
      toast.error('Wpisz treść posta przed zapisaniem szkicu.');
      return;
    }

    try {
      setIsSubmitting(true);
      await apiClient.post('/drafts', {
        caption: campaignContent[selectedPlatform].caption.trim(),
        platform: selectedPlatform,
        hashtags: campaignContent[selectedPlatform].hashtags,
        scheduledFor: scheduledDateTime
          ? new Date(scheduledDateTime).toISOString()
          : null,
        videoId: selectedVideoId || null,
      });
      toast.success('Szkic został zapisany.');

      const refreshedDrafts = await apiClient.get<
        Array<{
          id: string;
          caption: string;
          platform: 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'FACEBOOK';
          hashtags: string[];
          scheduledFor: string | null;
          createdAt: string;
          videoId: string | null;
          video?: { id: string; title: string } | null;
        }>
      >('/drafts');
      setDrafts(refreshedDrafts.data);
    } catch {
      toast.error('Nie udało się zapisać szkicu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const restoreDraft = (draft: {
    id: string;
    caption: string;
    platform: 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'FACEBOOK';
    hashtags: string[];
    scheduledFor: string | null;
    videoId: string | null;
  }) => {
    const platformLower = draft.platform.toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(platformLimits, platformLower)) {
      toast.error('Ten szkic używa nieobsługiwanej platformy.');
      return;
    }

    if (!campaignBrief.trim()) {
      setCampaignBrief(draft.caption);
    }
    setSelectedPlatform(platformLower as PlatformKey);
    updatePlatformContent(platformLower as PlatformKey, (current) => ({
      ...current,
      caption: draft.caption,
      hashtags: Array.isArray(draft.hashtags) ? draft.hashtags : [],
    }));

    if (draft.videoId && videos.some((video) => video.id === draft.videoId)) {
      setSelectedVideoId(draft.videoId);
    }

    if (draft.scheduledFor) {
      const parsed = new Date(draft.scheduledFor);
      if (!Number.isNaN(parsed.getTime())) {
        setScheduledDate(parsed.toISOString().slice(0, 10));
        setScheduledTime(parsed.toISOString().slice(11, 16));
      }
    } else {
      setScheduledDate('');
      setScheduledTime('');
    }

    toast.success('Szkic został przywrócony.');
  };

  const applySuggestedSchedule = () => {
    if (effectivePlan === 'FREE') {
      const maxAllowed = new Date(Date.now() + 72 * 60 * 60 * 1000);
      if (suggestedDateTime.getTime() > maxAllowed.getTime()) {
        setScheduledDate(maxAllowed.toISOString().slice(0, 10));
        setScheduledTime(maxAllowed.toISOString().slice(11, 16));
        toast.warning('Plan Free: sugestia została skrócona do maks. 72 godzin do przodu.');
        return;
      }
    }

    setScheduledDate(toDateInputValue(suggestedDateTime));
    setScheduledTime(toTimeInputValue(suggestedDateTime));
    toast.success('Zastosowano sugerowany termin publikacji.');
  };

  const stepSequence: ComposerStep[] = ['media', 'content', 'schedule'];
  const currentStepIndex = stepSequence.indexOf(activeStep);

  const goToNextStep = () => {
    if (activeStep === 'media') {
      if (!selectedVideoId) {
        toast.error('Dodaj lub wybierz materiał, aby przejść dalej.');
        return;
      }
      setActiveStep('content');
      return;
    }

    if (activeStep === 'content') {
      setActiveStep('schedule');
    }
  };

  const goToPrevStep = () => {
    if (activeStep === 'schedule') {
      setActiveStep('content');
      return;
    }

    if (activeStep === 'content') {
      setActiveStep('media');
    }
  };

  return (
    <div id="post-composer" className="h-full w-full bg-card flex flex-col">
      <div className="p-6 border-b border-border">
        <h2 className="text-lg font-semibold text-foreground">Komponuj post</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Asystent AI:{' '}
          {isPlanLoading ? 'Sprawdzanie planu...' : autoPilotTierLabel}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {isPlanLoading ? '...' : planSubtitle}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-secondary/20 p-3">
            <div className="flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0">
              {stepSequence.map((step, index) => {
                const isActive = step === activeStep;
                const isDone = index < currentStepIndex;
                const label = step === 'media' ? 'Materiał' : step === 'content' ? 'Treść' : 'Harmonogram';

                return (
                  <button
                    key={step}
                    onClick={() => setActiveStep(step)}
                    className={`min-w-[120px] sm:min-w-0 rounded-xl border px-3 py-2 text-left transition-all ${
                      isActive
                        ? 'bg-primary/10 border-primary/30'
                        : 'bg-secondary/30 border-border hover:bg-secondary/50'
                    }`}
                  >
                    <p className="text-[11px] text-muted-foreground">Krok {index + 1}</p>
                    <p className="text-sm font-medium text-foreground">
                      {label} {isDone ? '✓' : ''}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {activeStep === 'media' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-secondary/20 p-3">
                <p className="text-sm font-medium text-foreground">Wsad kampanii</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Dodaj materiał i przygotuj go pod short-form (9:16).
                </p>
                <div className="mt-3">
                  <VideoUploader compact />
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-secondary/20 p-3 space-y-3">
                <label className="block text-sm font-medium text-foreground">Wybierz materiał do publikacji</label>
                <select
                  value={selectedVideoId}
                  onChange={(e) => setSelectedVideoId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-secondary/30 border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {videos.length === 0 ? (
                    <option value="">Brak dostępnych materiałów</option>
                  ) : (
                    videos.map((video) => (
                      <option key={video.id} value={video.id}>
                        {video.title}
                      </option>
                    ))
                  )}
                </select>
                {selectedVideo && (
                  <p className="text-xs text-muted-foreground">Wybrane: {selectedVideo.title}</p>
                )}

                <button
                  onClick={() => setIsAiCropEnabled((current) => !current)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                    isAiCropEnabled
                      ? 'bg-primary/10 border-primary/30 text-foreground'
                      : 'bg-secondary/40 border-border text-muted-foreground'
                  }`}
                >
                  {isAiCropEnabled ? 'Automatyczne kadrowanie 9:16: włączone' : 'Automatyczne kadrowanie 9:16: wyłączone'}
                </button>
              </div>
            </div>
          )}

          {activeStep === 'content' && (
            <div className="grid grid-cols-1 lg:grid-cols-[40%_60%] gap-4 items-start">
              <div className="space-y-4">
                <div className="rounded-2xl border border-border bg-secondary/20 p-3 space-y-3">
                  <p className="text-sm font-medium text-foreground">Opis kampanii</p>
                  <p className="text-xs text-muted-foreground">
                    Opisz zamysł kampanii, a AI rozdzieli treści na platformy.
                  </p>
                  <textarea
                    value={campaignBrief}
                    onChange={(event) => setCampaignBrief(event.target.value)}
                    placeholder="Np. Nowa ładowarka 3w1, najważniejsze funkcje i CTA do zakupu."
                    className="w-full h-28 px-4 py-3 bg-secondary/30 border border-border rounded-xl text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />

                  <button
                    onClick={runAutoPilot}
                    disabled={isSubmitting || isAutoPilotRunning || !campaignBrief.trim() || !selectedVideoId}
                    className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-secondary/50 text-foreground rounded-xl hover:bg-secondary transition-all disabled:opacity-60"
                  >
                    <Sparkles className="w-5 h-5" />
                    <span>
                      {isAutoPilotRunning
                        ? 'AI generuje opisy...'
                        : !hasAutoPilotLiteAccess
                          ? 'Generuj AI (1 platforma)'
                          : effectivePlan === 'BUSINESS'
                            ? 'Generuj AI (wszystkie platformy)'
                            : 'Generuj AI (plan Pro)'}
                    </span>
                  </button>

                  {!hasAutoPilotLiteAccess && (
                    <p className="text-xs text-muted-foreground">
                      Przejdź na plan Pro, aby odblokować Asystenta AI.
                    </p>
                  )}
                  {hasAutoPilotLiteAccess && (
                    <p className="text-xs text-muted-foreground">
                      Wykorzystano {aiRunUsage.count}/{aiRunUsage.limit ?? '∞'} uruchomień AI w tym miesiącu.
                    </p>
                  )}
                </div>

                {!isPlanLoading && (effectivePlan === 'FREE' || effectivePlan === 'STARTER' || effectivePlan === 'PRO') && (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <p className="text-xs text-foreground flex items-center gap-2 font-medium">
                      <Gem className="w-3.5 h-3.5 text-primary" />
                      {effectivePlan === 'PRO'
                        ? 'Plan Business odblokowuje nielimitowanego Asystenta AI i priorytetowe wsparcie.'
                        : 'Przejdź na plan Pro, aby odblokować Asystenta AI (15 uruchomień / miesiąc).'}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(effectivePlan === 'FREE' || effectivePlan === 'STARTER') && (
                        <button
                          onClick={() => {
                            void startPlanCheckout('PRO');
                          }}
                          disabled={isCheckoutLoading}
                          className="px-3 py-1.5 rounded-lg border border-border bg-secondary text-foreground text-xs disabled:opacity-60"
                        >
                          {isCheckoutLoading ? 'Uruchamianie...' : 'Przejdź na Pro (AI)'}
                        </button>
                      )}
                      <button
                        onClick={() => {
                          void startPlanCheckout('BUSINESS');
                        }}
                        disabled={isCheckoutLoading}
                        className="px-3 py-1.5 rounded-lg border border-primary/30 bg-primary text-primary-foreground text-xs font-medium disabled:opacity-60"
                      >
                        {isCheckoutLoading ? 'Uruchamianie...' : effectivePlan === 'PRO' ? 'Przejdź na BUSINESS' : 'Odblokuj BUSINESS'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-border bg-secondary/20 p-3 space-y-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
                  {platformOrder.map((platform) => {
                    const content = campaignContent[platform];
                    const hasText = content.caption.trim().length > 0;

                    return (
                      <button
                        key={platform}
                        onClick={() => setSelectedPlatform(platform)}
                        className={`rounded-lg border px-3 py-2 text-left transition-all ${
                          selectedPlatform === platform
                            ? 'bg-primary/10 border-primary/30'
                            : 'bg-secondary/40 border-border hover:bg-secondary/60'
                        }`}
                      >
                        <p className="text-sm font-medium text-foreground">{platform.charAt(0).toUpperCase() + platform.slice(1)}</p>
                        <p className="text-[11px] text-muted-foreground mt-1">{hasText ? 'Opis gotowy' : 'Brak opisu'}</p>
                      </button>
                    );
                  })}
                </div>

                <div className="rounded-2xl border border-border bg-background/40 p-3">
                  <p className="text-xs text-muted-foreground mb-2">Podgląd platformy ({selectedPlatform.toUpperCase()})</p>
                  <div className="mx-auto w-full max-w-[280px] rounded-[24px] border border-border bg-card p-3">
                    <p className="text-[11px] text-muted-foreground mb-2">Podgląd posta</p>
                    <p className="text-sm text-foreground whitespace-pre-wrap line-clamp-6">
                      {campaignContent[selectedPlatform].caption || 'Tu zobaczysz podgląd treści dla wybranej platformy.'}
                    </p>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-medium text-foreground">
                      Edytuj: {selectedPlatform.charAt(0).toUpperCase() + selectedPlatform.slice(1)}
                    </label>
                    <span
                      className={`text-xs font-medium ${
                        remainingChars < 0 ? 'text-destructive' : 'text-muted-foreground'
                      }`}
                    >
                      {remainingChars} / {currentLimit}
                    </span>
                  </div>
                  <textarea
                    value={campaignContent[selectedPlatform].caption}
                    onChange={(event) =>
                      updatePlatformContent(selectedPlatform, (current) => ({
                        ...current,
                        caption: event.target.value,
                      }))
                    }
                    placeholder="AI wygeneruje opis dla tej platformy, a tutaj możesz go dopracować."
                    className="w-full h-32 px-4 py-3 bg-secondary/30 border border-border rounded-xl text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-3">
                    <Hash className="w-4 h-4" />
                    Hashtagi dla {selectedPlatform}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {hashtagPresets.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => toggleHashtag(tag)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          campaignContent[selectedPlatform].hashtags.includes(tag)
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeStep === 'schedule' && (
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-4 items-start">
              <div className="space-y-4">
                <div className="rounded-2xl border border-border bg-secondary/20 p-3">
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-3">
                    <Calendar className="w-4 h-4" />
                    Publikacja i harmonogram
                  </label>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-2 block">Data</label>
                      <input
                        type="date"
                        value={scheduledDate}
                        onChange={(e) => setScheduledDate(e.target.value)}
                        max={effectivePlan === 'FREE' ? freePlanMaxDate : undefined}
                        className="w-full px-4 py-2.5 bg-secondary/30 border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-2 block">Godzina</label>
                      <input
                        type="time"
                        value={scheduledTime}
                        onChange={(e) => setScheduledTime(e.target.value)}
                        className="w-full px-4 py-2.5 bg-secondary/30 border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                      {effectivePlan === 'FREE' && (
                        <p className="text-xs text-muted-foreground mb-1">Plan Free: planowanie do 72 godzin do przodu.</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        AI sugeruje: {suggestedDateTime.toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' })}
                      </p>
                      <button
                        onClick={applySuggestedSchedule}
                        className="mt-2 px-3 py-1.5 rounded-lg border border-primary/30 bg-primary text-primary-foreground text-xs"
                      >
                        Zastosuj sugestię AI
                      </button>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-secondary/20 p-3 space-y-3">
                  <p className="text-sm font-medium text-foreground">Zakres publikacji</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setPublishScope('all')}
                      className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                        publishScope === 'all'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary/60 text-muted-foreground hover:bg-secondary'
                      }`}
                    >
                      Wszystkie podłączone
                    </button>
                    <button
                      onClick={() => setPublishScope('selected')}
                      className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                        publishScope === 'selected'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary/60 text-muted-foreground hover:bg-secondary'
                      }`}
                    >
                      Tylko wybrane
                    </button>
                  </div>
                  {publishScope === 'selected' && (
                    <div className="grid grid-cols-2 gap-2">
                      {Object.keys(platformLimits).map((platform) => {
                        const platformKey = platform as keyof typeof platformLimits;
                        const isConnected = connectedPlatforms.has(platform);
                        const isSelected = selectedPublishPlatforms.has(platformKey);

                        return (
                          <button
                            key={platform}
                            onClick={() => togglePublishTarget(platformKey)}
                            disabled={!isConnected}
                            className={`px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
                              isSelected
                                ? 'bg-primary/15 border-primary/40 text-foreground'
                                : 'bg-secondary/40 border-border text-muted-foreground'
                            } disabled:opacity-50`}
                          >
                            {platform.charAt(0).toUpperCase() + platform.slice(1)}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-secondary/20 p-3">
                <label className="block text-sm font-medium text-foreground mb-3">Zapisane szkice</label>
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {drafts.slice(0, 6).map((draft) => (
                    <button
                      key={draft.id}
                      onClick={() => restoreDraft(draft)}
                      className="w-full text-left rounded-lg border border-border bg-secondary/20 p-3 hover:bg-secondary/40 transition-all"
                    >
                      <p className="text-sm font-medium text-foreground line-clamp-1">
                        {draft.caption || 'Szkic bez treści'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {draft.platform} • {new Date(draft.createdAt).toLocaleString('pl-PL')}
                      </p>
                    </button>
                  ))}
                  {drafts.length === 0 && <p className="text-xs text-muted-foreground">Brak zapisanych szkiców.</p>}
                </div>
              </div>
            </div>
          )}

          {connectedPlatformList.length === 0 && (
            <p className="text-xs text-destructive text-center">
              Brak podłączonych kont. Połącz co najmniej jedną platformę w sekcji „Połączone konta”.
            </p>
          )}
          {connectedPlatformList.length > 0 && !selectedPlatformConnected && (
            <p className="text-xs text-destructive text-center">
              Brak połączonego konta dla {selectedPlatform}. Połącz konto w sekcji „Połączone konta”.
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-border p-3 sm:p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {hasAutoPilotLiteAccess
              ? `AI: ${aiRunUsage.count}/${aiRunUsage.limit ?? '∞'} w tym miesiącu`
              : effectivePlan === 'FREE'
                ? 'Free: AI dla 1 platformy i planowanie do 72 godzin'
                : effectivePlan === 'STARTER'
                    ? 'Starter: publikacja na YT/TikTok/IG/FB, bez Asystenta AI'
                    : 'Pro: Asystent AI i miękki limit 100 wideo/mies.'}
          </p>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 justify-end">
            {activeStep !== 'media' && (
              <button
                onClick={goToPrevStep}
                className="px-4 py-2.5 rounded-lg bg-secondary/50 text-foreground text-sm"
              >
                Wstecz
              </button>
            )}

            {activeStep !== 'schedule' ? (
              <button
                onClick={goToNextStep}
                className="px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm"
              >
                Dalej
              </button>
            ) : (
              <>
                <button
                  onClick={saveDraft}
                  disabled={isSubmitting}
                  className="px-4 py-2.5 rounded-lg bg-secondary/50 text-foreground text-sm disabled:opacity-60"
                >
                  Zapisz szkic
                </button>
                <button
                  onClick={() => enqueuePublishJob(false)}
                  disabled={isSubmitting || !selectedVideoId || publishablePlatformList.length === 0}
                  className="col-span-2 sm:col-span-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-60"
                >
                  <Send className="w-4 h-4" />
                  {isSubmitting ? 'Dodawanie...' : 'Zaplanuj kampanię'}
                </button>
                <button
                  onClick={() => enqueuePublishJob(true)}
                  disabled={isSubmitting || !selectedVideoId || publishablePlatformList.length === 0}
                  className="col-span-2 sm:col-span-1 px-4 py-2.5 rounded-lg bg-secondary/50 text-foreground text-sm disabled:opacity-60"
                >
                  Opublikuj teraz
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
