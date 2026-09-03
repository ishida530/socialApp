'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { SmartScheduleCard } from '@/components/schedule/SmartScheduleCard';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/contexts/auth-context';
import { apiClient } from '@/lib/api-client';
import type { Platform, SmartCampaign, ScheduledPost as SmartScheduledPost } from '@/lib/smart-schedule/types';
import { resolvePublishIssue } from '@/lib/smart-schedule/publish-issues';

type PaginatedJobsResponse = {
  data: PublishJob[];
  totalCount: number;
  hasMore: boolean;
};

type AiScheduleResponse = {
  success: boolean;
  timezone: string;
  applied: boolean;
  scannedCount: number;
  updatedCount: number;
  noPendingJobs?: boolean;
  message?: string;
  publishStatusBreakdown?: {
    pending: number;
    running: number;
    success: number;
    failed: number;
    canceled: number;
  };
  suggestions: Array<{
    jobId: string;
    platform: 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'FACEBOOK';
    previousScheduledFor: string;
    suggestedScheduledFor: string;
    timezone: string;
    score: number;
    reason: string;
  }>;
};

type PublishJob = {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELED';
  scheduledFor: string;
  socialAccountId?: string;
  remotePostUrl?: string | null;
  errorMessage?: string | null;
  video?: {
    id?: string;
    title?: string;
    description?: string | null;
    sourceUrl?: string;
    thumbnailUrl?: string | null;
  };
  socialAccount?: {
    platform?: 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'FACEBOOK';
  };
};

type JobBadge = {
  label: string;
  className: string;
};

type StatusFilter = 'ALL' | 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELED';
type CampaignInboxTab = 'to-approve' | 'scheduled' | 'published' | 'archived';

type MediaOption = {
  id: string;
  title: string;
  createdAt?: string;
};

type WeeklyPlanResponse = {
  success: boolean;
  timezone: string;
  applied: boolean;
  plan: {
    recommendedPostsPerWeek: number;
    selectedMaterials: number;
    connectedPlatforms: Array<'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'FACEBOOK'>;
    goal: string | null;
  };
  suggestions: Array<{
    videoId: string;
    videoTitle: string;
    platform: 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'FACEBOOK';
    socialAccountId: string;
    suggestedScheduledFor: string;
    reason: string;
  }>;
  createdJobsCount: number;
};

type WeeklyPlanAcceptedItem = WeeklyPlanResponse['suggestions'][number];

const PLATFORM_FROM_API: Record<'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'FACEBOOK', Platform> = {
  YOUTUBE: 'youtube',
  TIKTOK: 'tiktok',
  INSTAGRAM: 'instagram',
  FACEBOOK: 'facebook',
};

function statusFilterLabel(status: StatusFilter) {
  if (status === 'PENDING') return 'Oczekujące';
  if (status === 'RUNNING') return 'W trakcie';
  if (status === 'SUCCESS') return 'Sukces';
  if (status === 'FAILED') return 'Błąd';
  if (status === 'CANCELED') return 'Anulowane';
  return 'Wszystkie statusy';
}

function postStatusLabel(status: SmartScheduledPost['status']) {
  if (status === 'pending') return 'Oczekuje';
  if (status === 'published') return 'Opublikowano';
  if (status === 'failed') return 'Błąd';
  return 'Sugestia AI';
}

function resolveJobBadge(job: PublishJob): JobBadge {
  if (job.status === 'SUCCESS') {
    return {
      label: 'Opublikowano',
      className: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600',
    };
  }

  if (job.status === 'RUNNING') {
    return {
      label: 'W trakcie',
      className: 'bg-blue-500/10 border-blue-500/30 text-blue-600',
    };
  }

  if (job.status === 'FAILED') {
    return {
      label: 'Błąd publikacji',
      className: 'bg-destructive/10 border-destructive/30 text-destructive',
    };
  }

  if (job.status === 'CANCELED') {
    return {
      label: 'Anulowano',
      className: 'bg-muted/40 border-border text-muted-foreground',
    };
  }

  if (job.errorMessage?.includes('[tiktok-tracking:')) {
    return {
      label: 'TikTok: oczekiwanie',
      className: 'bg-amber-500/10 border-amber-500/30 text-amber-600',
    };
  }

  if (job.errorMessage?.includes('[retry-attempt:')) {
    return {
      label: 'Ponowienie zaplanowane',
      className: 'bg-amber-500/10 border-amber-500/30 text-amber-600',
    };
  }

  return {
    label: 'Zaplanowano',
    className: 'bg-secondary/50 border-border text-foreground',
  };
}

function toDateTimeLocalValue(dateIso: string) {
  const parsed = new Date(dateIso);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  const hours = String(parsed.getHours()).padStart(2, '0');
  const minutes = String(parsed.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export default function SchedulePage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [jobs, setJobs] = useState<PublishJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [effectivePlan, setEffectivePlan] = useState<'FREE' | 'STARTER' | 'PRO' | 'BUSINESS'>('FREE');
  const [isPlanLoading, setIsPlanLoading] = useState(true);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isAiApplying, setIsAiApplying] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<AiScheduleResponse['suggestions']>([]);
  const [aiStatusBreakdown, setAiStatusBreakdown] = useState<AiScheduleResponse['publishStatusBreakdown'] | null>(null);
  const [aiInfoMessage, setAiInfoMessage] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [campaignTab, setCampaignTab] = useState<CampaignInboxTab>('to-approve');
  const [mediaLibrary, setMediaLibrary] = useState<MediaOption[]>([]);
  const [selectedMediaIds, setSelectedMediaIds] = useState<Set<string>>(new Set());
  const [campaignGoal, setCampaignGoal] = useState('');
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlanResponse | null>(null);
  const [selectedWeeklyPlanItems, setSelectedWeeklyPlanItems] = useState<Set<string>>(new Set());
  const [isWeeklyPlanLoading, setIsWeeklyPlanLoading] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [campaignTitleInput, setCampaignTitleInput] = useState('');
  const [campaignDescriptionInput, setCampaignDescriptionInput] = useState('');
  const [campaignScheduleInput, setCampaignScheduleInput] = useState<Record<string, string>>({});
  const [isCampaignSaving, setIsCampaignSaving] = useState(false);
  const [isCampaignDeleting, setIsCampaignDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const pageSize = 10;

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  const loadJobs = async (targetPage: number) => {
    try {
      setJobsLoading(true);
      const offset = (targetPage - 1) * pageSize;
      const response = await apiClient.get<PaginatedJobsResponse>(
        `/jobs?limit=${pageSize}&offset=${offset}`,
      );
      setJobs(response.data.data);
      setTotalCount(response.data.totalCount);
      setHasMore(response.data.hasMore);
    } catch {
      toast.error('Nie udało się pobrać harmonogramu.');
    } finally {
      setJobsLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    void loadJobs(page);
  }, [isAuthenticated, page]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const loadPlan = async () => {
      try {
        setIsPlanLoading(true);
        const billingResponse = await apiClient.get<{
          subscription: {
            plan: 'FREE' | 'STARTER' | 'PRO' | 'BUSINESS';
            effectivePlan?: 'FREE' | 'STARTER' | 'PRO' | 'BUSINESS';
          };
        }>('/billing/subscription');

        setEffectivePlan(
          billingResponse.data.subscription.effectivePlan || billingResponse.data.subscription.plan,
        );
      } catch {
        setEffectivePlan('FREE');
      } finally {
        setIsPlanLoading(false);
      }
    };

    void loadPlan();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const loadMediaLibrary = async () => {
      try {
        const response = await apiClient.get<Array<{ id: string; title: string; createdAt?: string }>>('/videos');
        setMediaLibrary(response.data);

        if (response.data.length > 0) {
          setSelectedMediaIds(new Set(response.data.slice(0, 3).map((item) => item.id)));
        }
      } catch {
        setMediaLibrary([]);
        setSelectedMediaIds(new Set());
      }
    };

    void loadMediaLibrary();
  }, [isAuthenticated]);

  const hasAutoPilotAccess = effectivePlan === 'PRO' || effectivePlan === 'BUSINESS';

  const freePlanMaxDateTimeLocal = useMemo(() => {
    const maxDate = new Date(Date.now() + 72 * 60 * 60 * 1000);
    return toDateTimeLocalValue(maxDate.toISOString());
  }, []);

  const runAiSchedule = async (mode: 'preview' | 'apply' | 'automanage' = 'preview') => {
    if (!hasAutoPilotAccess && !isPlanLoading) {
      toast.error('Inteligentny harmonogram jest dostępny od planu Pro.');
      return;
    }

    const shouldApply = mode !== 'preview';

    try {
      if (shouldApply) {
        setIsAiApplying(true);
      } else {
        setIsAiLoading(true);
      }

      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Warsaw';

      const response = await apiClient.post<AiScheduleResponse>('/jobs/ai-schedule', {
        timezone,
        apply: shouldApply,
      });

      setAiStatusBreakdown(response.data.publishStatusBreakdown ?? null);
      setAiInfoMessage(response.data.message ?? '');

      if (response.data.noPendingJobs) {
        setAiSuggestions([]);
        toast.warning(response.data.message || 'Brak zadań do optymalizacji.');
        return;
      }

      setAiSuggestions(response.data.suggestions);

      if (shouldApply) {
        if (mode === 'automanage') {
          toast.success(`Asystent AI zaktualizował ${response.data.updatedCount} zadań.`);
        } else {
          toast.success(`Zastosowano sugestie AI (${response.data.updatedCount} zadań).`);
        }
        await loadJobs(page);
      } else {
        toast.success(`Asystent AI przygotował ${response.data.suggestions.length} sugestii.`);
      }
    } catch (error: unknown) {
      const responseData = (error as {
        response?: {
          data?: {
            message?: string;
          };
        };
      }).response?.data;

      toast.error(responseData?.message || 'Nie udało się uruchomić AI harmonogramu.');
    } finally {
      setIsAiLoading(false);
      setIsAiApplying(false);
    }
  };

  const toggleMediaSelection = (videoId: string) => {
    setSelectedMediaIds((current) => {
      const next = new Set(current);
      if (next.has(videoId)) {
        next.delete(videoId);
      } else {
        next.add(videoId);
      }
      return next;
    });
  };

  const runWeeklyCampaignPlanner = async (applyPlan = false) => {
    const selectedIds = Array.from(selectedMediaIds);

    if (selectedIds.length === 0) {
      toast.error('Wybierz co najmniej 1 materiał do planowania kampanii.');
      return;
    }

    try {
      setIsWeeklyPlanLoading(true);

      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Warsaw';

      const acceptedItems: WeeklyPlanAcceptedItem[] | undefined =
        applyPlan && weeklyPlan
          ? weeklyPlan.suggestions.filter((item, index) => selectedWeeklyPlanItems.has(`${index}-${item.videoId}-${item.platform}`))
          : undefined;

      if (applyPlan && weeklyPlan && (!acceptedItems || acceptedItems.length === 0)) {
        toast.error('Wybierz co najmniej 1 pozycję planu do akceptacji.');
        return;
      }

      const response = await apiClient.post<WeeklyPlanResponse>('/campaigns/weekly-plan', {
        videoIds: selectedIds,
        goal: campaignGoal.trim() || undefined,
        timezone,
        apply: applyPlan,
        acceptedItems,
      });

      setWeeklyPlan(response.data);
      setSelectedWeeklyPlanItems(
        new Set(response.data.suggestions.map((item, index) => `${index}-${item.videoId}-${item.platform}`)),
      );

      if (applyPlan) {
        toast.success(`Utworzono plan tygodnia: ${response.data.createdJobsCount} postów.`);
        setCampaignTab('scheduled');
        await loadJobs(1);
        setPage(1);
      } else {
        toast.success(`AI proponuje ${response.data.plan.recommendedPostsPerWeek} postów tygodniowo.`);
        setCampaignTab('to-approve');
      }
    } catch (error: unknown) {
      const responseData = (error as {
        response?: {
          data?: {
            message?: string;
          };
        };
      }).response?.data;

      toast.error(responseData?.message || 'Nie udało się przygotować planu tygodnia.');
    } finally {
      setIsWeeklyPlanLoading(false);
    }
  };

  const toggleWeeklyPlanItem = (itemKey: string) => {
    setSelectedWeeklyPlanItems((current) => {
      const next = new Set(current);
      if (next.has(itemKey)) {
        next.delete(itemKey);
      } else {
        next.add(itemKey);
      }
      return next;
    });
  };

  const filteredJobs = useMemo(() => {
    if (statusFilter === 'ALL') {
      return jobs;
    }

    return jobs.filter((job) => job.status === statusFilter);
  }, [jobs, statusFilter]);

  const smartCampaigns = useMemo<SmartCampaign[]>(() => {
    const groups = new Map<string, SmartCampaign>();
    const jobById = new Map(filteredJobs.map((job) => [job.id, job]));

    filteredJobs.forEach((job) => {
      const campaignId = job.video?.id || `campaign-${job.id}`;
      const platform = PLATFORM_FROM_API[job.socialAccount?.platform || 'YOUTUBE'];

      if (!groups.has(campaignId)) {
        groups.set(campaignId, {
          id: campaignId,
          name: job.video?.title || 'Kampania bez tytułu',
          goal: job.video?.description || undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          content: {
            mediaUrl: job.video?.thumbnailUrl || job.video?.sourceUrl || '',
            descriptions: {
              youtube: '',
              tiktok: '',
              instagram: '',
              facebook: '',
            },
            tags: [],
          },
          posts: [],
          suggestedPosts: [],
          channels: [],
          aiSummary: undefined,
          userActivityHeatmap: undefined,
        });
      }

      const campaign = groups.get(campaignId)!;

      const postStatus: SmartScheduledPost['status'] =
        job.status === 'SUCCESS'
          ? 'published'
          : job.status === 'FAILED'
            ? 'failed'
            : 'pending';

      campaign.posts.push({
        id: job.id,
        campaignId,
        platform,
        scheduledTime: job.scheduledFor,
        status: postStatus,
        remotePostUrl: job.remotePostUrl || undefined,
      });

      if (!campaign.channels.includes(platform)) {
        campaign.channels.push(platform);
      }

      campaign.content.descriptions[platform] = job.video?.description || '';
    });

    aiSuggestions.forEach((suggestion) => {
      const job = jobById.get(suggestion.jobId);
      if (!job) {
        return;
      }

      const campaignId = job.video?.id || `campaign-${job.id}`;
      const campaign = groups.get(campaignId);
      if (!campaign) {
        return;
      }

      const platform = PLATFORM_FROM_API[suggestion.platform];
      campaign.suggestedPosts.push({
        id: `suggested-${suggestion.jobId}`,
        campaignId,
        platform,
        scheduledTime: suggestion.suggestedScheduledFor,
        status: 'suggested',
      });
    });

    return Array.from(groups.values()).sort((left, right) => {
      const leftNext = left.posts[0]?.scheduledTime || left.createdAt;
      const rightNext = right.posts[0]?.scheduledTime || right.createdAt;
      return new Date(leftNext).getTime() - new Date(rightNext).getTime();
    });
  }, [aiSuggestions, filteredJobs]);

  const campaignErrors = useMemo(() => {
    const grouped = new Map<string, Partial<Record<Platform, string>>>();

    filteredJobs.forEach((job) => {
      if (!job.errorMessage || !job.socialAccount?.platform) {
        return;
      }

      const campaignId = job.video?.id || `campaign-${job.id}`;
      const platform = PLATFORM_FROM_API[job.socialAccount.platform];
      const current = grouped.get(campaignId) || {};
      current[platform] = job.errorMessage;
      grouped.set(campaignId, current);
    });

    return grouped;
  }, [filteredJobs]);

  const campaignBuckets = useMemo(() => {
    const toApprove = smartCampaigns.filter((campaign) => campaign.suggestedPosts.length > 0);

    const remaining = smartCampaigns.filter((campaign) => campaign.suggestedPosts.length === 0);

    const scheduled = remaining.filter((campaign) =>
      campaign.posts.some((post) => post.status === 'pending') || campaign.posts.some((post) => post.status === 'failed'),
    );

    const published = remaining.filter((campaign) =>
      campaign.posts.length > 0 && campaign.posts.every((post) => post.status === 'published'),
    );

    const archived = remaining.filter((campaign) =>
      !scheduled.some((item) => item.id === campaign.id) && !published.some((item) => item.id === campaign.id),
    );

    return {
      'to-approve': toApprove,
      scheduled,
      published,
      archived,
    } as const;
  }, [smartCampaigns]);

  const campaignsInActiveTab = campaignBuckets[campaignTab];

  const selectedCampaign = useMemo(
    () => smartCampaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null,
    [selectedCampaignId, smartCampaigns],
  );

  const selectedCampaignTimeline = useMemo(() => {
    if (!selectedCampaign) {
      return [] as SmartScheduledPost[];
    }

    return [...selectedCampaign.posts]
      .sort((left, right) => new Date(left.scheduledTime).getTime() - new Date(right.scheduledTime).getTime());
  }, [selectedCampaign]);

  const selectedCampaignSuggestions = useMemo(() => {
    if (!selectedCampaign) {
      return [] as SmartScheduledPost[];
    }

    return [...selectedCampaign.suggestedPosts]
      .sort((left, right) => new Date(left.scheduledTime).getTime() - new Date(right.scheduledTime).getTime());
  }, [selectedCampaign]);

  const retryFailedForCampaign = async (campaignId: string) => {
    const campaign = smartCampaigns.find((item) => item.id === campaignId);
    if (!campaign) {
      toast.error('Nie znaleziono kampanii.');
      return;
    }

    const failedPosts = campaign.posts.filter((post) => post.status === 'failed');
    if (failedPosts.length === 0) {
      toast.message('Brak błędów do ponowienia w tej kampanii.');
      return;
    }

    try {
      const results = await Promise.allSettled(
        failedPosts.map((post) => apiClient.post(`/publish-jobs/${post.id}/retry`)),
      );

      const failed = results.filter((result) => result.status === 'rejected').length;
      const succeeded = results.length - failed;

      if (succeeded > 0) {
        toast.success(`Ponowiono ${succeeded}/${results.length} błędnych publikacji.`);
      }

      if (failed > 0) {
        toast.error(`${failed} publikacji nie udało się ponowić.`);
      }

      await loadJobs(page);
    } catch {
      toast.error('Nie udało się wykonać ponowień kampanii.');
    }
  };

  useEffect(() => {
    if (!selectedCampaign) {
      setCampaignTitleInput('');
      setCampaignDescriptionInput('');
      setCampaignScheduleInput({});
      setDeleteConfirmOpen(false);
      return;
    }

    setCampaignTitleInput(selectedCampaign.name);
    setCampaignDescriptionInput(selectedCampaign.goal || '');
    setCampaignScheduleInput(
      Object.fromEntries(
        selectedCampaign.posts
          .filter((post) => post.status === 'pending')
          .map((post) => [post.id, toDateTimeLocalValue(post.scheduledTime)]),
      ),
    );
  }, [selectedCampaign]);

  const saveCampaignEdits = async () => {
    if (!selectedCampaign) {
      return;
    }

    if (selectedCampaign.id.startsWith('campaign-')) {
      toast.error('Ta kampania nie ma stałego ID wideo. Edycja jest niedostępna.');
      return;
    }

    try {
      setIsCampaignSaving(true);

      const scheduledForByJobId = Object.fromEntries(
        Object.entries(campaignScheduleInput)
          .filter(([, value]) => value)
          .map(([jobId, value]) => [jobId, new Date(value).toISOString()]),
      );

      await apiClient.patch(`/campaigns/${selectedCampaign.id}`, {
        title: campaignTitleInput,
        description: campaignDescriptionInput,
        scheduledForByJobId,
      });

      toast.success('Kampania zaktualizowana.');
      await loadJobs(page);
    } catch (error: unknown) {
      const responseData = (error as {
        response?: {
          data?: {
            message?: string;
          };
        };
      }).response?.data;

      toast.error(responseData?.message || 'Nie udało się zapisać zmian kampanii.');
    } finally {
      setIsCampaignSaving(false);
    }
  };

  const deleteCampaign = async () => {
    if (!selectedCampaign) {
      return;
    }

    if (selectedCampaign.id.startsWith('campaign-')) {
      toast.error('Ta kampania nie ma stałego ID wideo. Usuwanie jest niedostępne.');
      return;
    }

    try {
      setIsCampaignDeleting(true);

      const response = await apiClient.delete<{
        success: boolean;
        deleted?: boolean;
        partiallyDeleted?: boolean;
        message?: string;
      }>(`/campaigns/${selectedCampaign.id}`);

      if (response.data.partiallyDeleted) {
        toast.warning(response.data.message || 'Usunięto tylko część kampanii.');
      } else {
        toast.success('Kampania została usunięta.');
      }

      setDeleteConfirmOpen(false);
      setSelectedCampaignId(null);
      await loadJobs(page);
    } catch (error: unknown) {
      const responseData = (error as {
        response?: {
          data?: {
            message?: string;
          };
        };
      }).response?.data;

      toast.error(responseData?.message || 'Nie udało się usunąć kampanii.');
    } finally {
      setIsCampaignDeleting(false);
    }
  };

  const runAction = async (jobId: string, action: 'cancel' | 'retry' | 'trigger') => {
    try {
      setActionId(jobId);
      const response = await apiClient.post<{
        success: boolean;
        immediateOutcome?: 'succeeded' | 'retryScheduled' | 'failed' | 'skipped' | null;
        publishJob?: {
          socialAccountId?: string;
          errorMessage?: string | null;
        };
      }>(`/publish-jobs/${jobId}/${action}`);

      const oauthScopeMissing =
        response.data.publishJob?.errorMessage?.includes('[oauth-scope-missing]') ?? false;

      if (oauthScopeMissing) {
        toast.error('Brak zgód TikTok. Kliknij „Połącz ponownie” i zaakceptuj zgody.');
        return;
      }

      if (action === 'trigger') {
        toast.success('Zadanie uruchomione. Sprawdź status za chwilę.');
      } else if (action === 'retry') {
        toast.success('Uruchomiono ponowienie. Odśwież listę i sprawdź status.');
      } else {
        toast.success('Zadanie anulowane. Ustaw nowy termin publikacji.');
      }
      await loadJobs(page);
    } catch {
      if (action === 'trigger') {
        toast.error('Nie udało się uruchomić zadania. Spróbuj ponownie lub użyj „Ponów”.');
      } else if (action === 'retry') {
        toast.error('Nie udało się ponowić zadania. Sprawdź szczegóły błędu.');
      } else {
        toast.error('Nie udało się anulować zadania. Odśwież i spróbuj ponownie.');
      }
    } finally {
      setActionId(null);
    }
  };

  if (isLoading || !isAuthenticated) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Ładowanie sesji...</p>
      </main>
    );
  }

  return (
    <>
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 pb-24 lg:pb-6">
          <section className="bg-card border border-border rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Harmonogram publikacji</h2>
            <div className="rounded-lg border border-border bg-secondary/20 p-3 space-y-3">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">Planer kampanii AI</p>
                  <p className="text-xs text-muted-foreground">
                    Wybierz materiały, a AI zaproponuje posty i terminy na tydzień.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      void runWeeklyCampaignPlanner(false);
                    }}
                    disabled={isWeeklyPlanLoading}
                    className="px-3 py-1.5 text-xs rounded-lg bg-primary/10 border border-primary/30 text-primary disabled:opacity-60"
                  >
                    {isWeeklyPlanLoading ? 'Liczenie...' : 'Zaproponuj plan AI'}
                  </button>
                  <button
                    onClick={() => {
                      void runWeeklyCampaignPlanner(true);
                    }}
                    disabled={isWeeklyPlanLoading || selectedMediaIds.size === 0}
                    className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground disabled:opacity-60"
                  >
                    {isWeeklyPlanLoading ? 'Tworzenie...' : 'Utwórz kampanię'}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Cel kampanii (opcjonalnie)</label>
                <textarea
                  value={campaignGoal}
                  onChange={(event) => setCampaignGoal(event.target.value)}
                  rows={2}
                  placeholder="Np. promocja nowej usługi i zwiększenie ruchu na landing page"
                  className="w-full px-3 py-2 bg-secondary/40 border border-border rounded-lg text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-2">Materiały do kampanii ({selectedMediaIds.size})</p>
                <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                  {mediaLibrary.slice(0, 12).map((media) => {
                    const isSelected = selectedMediaIds.has(media.id);
                    return (
                      <label
                        key={media.id}
                        className={`flex items-center justify-between gap-3 px-3 py-2 text-xs rounded-lg border transition-all ${
                          isSelected
                            ? 'bg-primary/10 border-primary/30 text-primary'
                            : 'bg-secondary border-border text-foreground'
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleMediaSelection(media.id)}
                            className="h-4 w-4"
                          />
                          <span className="truncate">{media.title}</span>
                        </span>
                        {isSelected && (
                          <button
                            onClick={(event) => {
                              event.preventDefault();
                              toggleMediaSelection(media.id);
                            }}
                            className="px-2 py-1 rounded-md border border-border bg-secondary/60 text-[11px] text-foreground"
                          >
                            Usuń z kampanii
                          </button>
                        )}
                      </label>
                    );
                  })}
                  {mediaLibrary.length === 0 && (
                    <p className="text-xs text-muted-foreground">Brak materiałów w bibliotece.</p>
                  )}
                </div>
                {selectedMediaIds.size > 0 && (
                  <button
                    onClick={() => setSelectedMediaIds(new Set())}
                    className="mt-2 px-3 py-1.5 text-xs rounded-lg border border-border bg-secondary text-foreground"
                  >
                    Wyczyść wybór materiałów
                  </button>
                )}
              </div>

              {weeklyPlan && (
                <div className="rounded-md border border-border bg-background/30 px-3 py-2 space-y-2">
                  <p className="text-xs text-foreground font-medium">
                    AI proponuje {weeklyPlan.plan.recommendedPostsPerWeek} postów/tydz. na bazie {weeklyPlan.plan.selectedMaterials} materiałów.
                  </p>
                  <p className="text-[11px] text-muted-foreground">Zaznacz pozycje do akceptacji.</p>
                  <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
                    {weeklyPlan.suggestions.slice(0, 10).map((item, index) => (
                      <label
                        key={`${item.videoId}-${item.platform}-${index}`}
                        className="flex items-center gap-2 rounded-md border border-border bg-secondary/20 px-2 py-1.5"
                      >
                        <input
                          type="checkbox"
                          checked={selectedWeeklyPlanItems.has(`${index}-${item.videoId}-${item.platform}`)}
                          onChange={() => toggleWeeklyPlanItem(`${index}-${item.videoId}-${item.platform}`)}
                          className="h-4 w-4"
                        />
                        <span className="text-[11px] text-muted-foreground truncate">
                          {item.platform} • {item.videoTitle} • {new Date(item.suggestedScheduledFor).toLocaleString('pl-PL')}
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Wybrane pozycje: {selectedWeeklyPlanItems.size}/{weeklyPlan.suggestions.length}
                  </p>
                </div>
              )}

              <div className="border-t border-border pt-3">
                <div className="flex flex-wrap gap-2 items-center justify-between">
                  <p className="text-xs text-muted-foreground">Optymalizacja zadań oczekujących</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        void runAiSchedule('preview');
                      }}
                      disabled={isAiLoading || isAiApplying || isPlanLoading || !hasAutoPilotAccess}
                      className="px-3 py-1.5 text-xs rounded-lg bg-secondary border border-border text-foreground disabled:opacity-60"
                    >
                      {isAiLoading ? 'Liczenie...' : 'Podgląd sugestii'}
                    </button>
                    <button
                      onClick={() => {
                        void runAiSchedule('apply');
                      }}
                      disabled={isAiLoading || isAiApplying || isPlanLoading || !hasAutoPilotAccess || aiSuggestions.length === 0}
                      className="px-3 py-1.5 text-xs rounded-lg bg-primary/10 border border-primary/30 text-primary disabled:opacity-60"
                    >
                      {isAiApplying ? 'Zastosowywanie...' : 'Akceptuj sugestie'}
                    </button>
                  </div>
                </div>
                {aiStatusBreakdown && (
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Oczekujące: {aiStatusBreakdown.pending} • W trakcie: {aiStatusBreakdown.running} • Opublikowane: {aiStatusBreakdown.success} • Błąd: {aiStatusBreakdown.failed} • Anulowane: {aiStatusBreakdown.canceled}
                    {aiInfoMessage ? ` • ${aiInfoMessage}` : ''}
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-secondary/20 p-3 space-y-3">
              <div className="flex flex-wrap gap-2">
                {([
                  { key: 'to-approve', label: `Do akceptacji (${campaignBuckets['to-approve'].length})` },
                  { key: 'scheduled', label: `Zaplanowane (${campaignBuckets.scheduled.length})` },
                  { key: 'published', label: `Opublikowane (${campaignBuckets.published.length})` },
                  { key: 'archived', label: `Archiwum (${campaignBuckets.archived.length})` },
                ] as const).map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => {
                      setCampaignTab(tab.key);
                    }}
                    className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${
                      campaignTab === tab.key
                        ? 'bg-primary/10 border-primary/30 text-primary'
                        : 'bg-secondary border-border text-foreground'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Status publikacji</label>
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                    className="w-full px-3 py-2 bg-secondary/40 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                      <option value="ALL">Wszystkie statusy</option>
                      <option value="PENDING">{statusFilterLabel('PENDING')}</option>
                      <option value="RUNNING">{statusFilterLabel('RUNNING')}</option>
                      <option value="SUCCESS">{statusFilterLabel('SUCCESS')}</option>
                      <option value="FAILED">{statusFilterLabel('FAILED')}</option>
                      <option value="CANCELED">{statusFilterLabel('CANCELED')}</option>
                  </select>
                </div>
              </div>
            </div>

            {jobsLoading && (
              <p className="text-sm text-muted-foreground">Ładowanie harmonogramu...</p>
            )}

            {!jobsLoading && filteredJobs.length === 0 && (
              <div className="rounded-lg border border-border bg-secondary/20 p-4 space-y-3">
                <p className="text-sm text-muted-foreground">Brak zadań publikacji.</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      window.dispatchEvent(new Event('post-composer:open'));
                    }}
                    className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground"
                  >
                    Utwórz pierwszą kampanię
                  </button>
                  <button
                    onClick={() => router.push('/media-library')}
                    className="px-3 py-1.5 text-xs rounded-lg bg-secondary border border-border text-foreground"
                  >
                    Dodaj materiał
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {campaignsInActiveTab.map((campaign) => (
                <SmartScheduleCard
                  key={campaign.id}
                  campaign={campaign}
                  platformErrors={campaignErrors.get(campaign.id)}
                  onOpenDetails={(campaignId) => setSelectedCampaignId(campaignId)}
                  onRetryFailed={retryFailedForCampaign}
                  onApplySuggestions={() => {
                    void runAiSchedule('apply');
                  }}
                />
              ))}

              {campaignsInActiveTab.length === 0 && !jobsLoading && (
                <div className="rounded-lg border border-border bg-secondary/20 p-4 space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {campaignTab === 'to-approve'
                      ? 'Brak kampanii oczekujących na akceptację.'
                      : campaignTab === 'scheduled'
                        ? 'Brak zaplanowanych kampanii.'
                        : campaignTab === 'published'
                          ? 'Brak opublikowanych kampanii.'
                          : 'Brak kampanii w archiwum.'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        window.dispatchEvent(new Event('post-composer:open'));
                      }}
                      className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground"
                    >
                      Utwórz kampanię
                    </button>
                    <button
                      onClick={() => router.push('/media-library')}
                      className="px-3 py-1.5 text-xs rounded-lg bg-secondary border border-border text-foreground"
                    >
                      Otwórz bibliotekę mediów
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Widoczne: {filteredJobs.length}/{totalCount} (str. {page}/{Math.max(1, Math.ceil(totalCount / pageSize))})
              </p>
              <div className="flex gap-2 self-end sm:self-auto">
                <button
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={jobsLoading || page <= 1}
                  className="px-4 py-2 bg-secondary/50 text-foreground rounded-lg hover:bg-secondary transition-all text-sm disabled:opacity-50"
                >
                  Poprzednia
                </button>
                <button
                  onClick={() => setPage((current) => current + 1)}
                  disabled={jobsLoading || !hasMore}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg transition-all text-sm disabled:opacity-50"
                >
                  Następna
                </button>
              </div>
            </div>
          </section>
      </main>

      <Sheet
        open={selectedCampaignId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedCampaignId(null);
          }
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-xl p-0">
          <SheetHeader className="border-b border-border">
            <SheetTitle>{selectedCampaign?.name ?? 'Szczegóły kampanii'}</SheetTitle>
            <SheetDescription>
              Szczegóły kampanii i dostępne działania dla platform.
            </SheetDescription>
          </SheetHeader>

          <div className="h-full overflow-y-auto p-4 space-y-4">
            {selectedCampaign && (
              <>
                  <div className="rounded-lg border border-border bg-secondary/20 p-3 space-y-3">
                    <p className="text-sm font-medium text-foreground">Edycja kampanii</p>

                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Tytuł kampanii</label>
                      <input
                        value={campaignTitleInput}
                        onChange={(event) => setCampaignTitleInput(event.target.value)}
                        className="w-full px-3 py-2 bg-secondary/40 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Opis kampanii</label>
                      <textarea
                        value={campaignDescriptionInput}
                        onChange={(event) => setCampaignDescriptionInput(event.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 bg-secondary/40 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={saveCampaignEdits}
                        disabled={isCampaignSaving || isCampaignDeleting}
                        className="px-3 py-1.5 text-xs rounded-lg bg-primary/10 border border-primary/30 text-primary disabled:opacity-60"
                      >
                        {isCampaignSaving ? 'Zapisywanie...' : 'Zapisz zmiany'}
                      </button>

                      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                        <AlertDialogTrigger asChild>
                          <button
                            disabled={isCampaignSaving || isCampaignDeleting}
                            className="px-3 py-1.5 text-xs rounded-lg bg-destructive/10 border border-destructive/30 text-destructive disabled:opacity-60"
                          >
                            {isCampaignDeleting ? 'Usuwanie...' : 'Usuń kampanię'}
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Czy na pewno usunąć kampanię?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Kampania zostanie usunięta. Jeśli ma opublikowane wpisy, usunięte będą tylko
                              pozycje nieopublikowane i szkice.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Anuluj</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => {
                                void deleteCampaign();
                              }}
                              className="bg-destructive text-white hover:bg-destructive/90"
                            >
                              Potwierdź usunięcie
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-secondary/20 p-3">
                    <p className="text-xs text-muted-foreground">Kanały</p>
                    <p className="text-sm text-foreground mt-1">{selectedCampaign.channels.join(', ')}</p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Oś publikacji</p>
                    {selectedCampaignTimeline.length === 0 && (
                      <p className="text-xs text-muted-foreground">Brak zaplanowanych pozycji.</p>
                    )}

                    {selectedCampaignTimeline.map((post) => {
                      const sourceJob = filteredJobs.find((job) => job.id === post.id);
                      const postError = sourceJob?.errorMessage || campaignErrors.get(selectedCampaign.id)?.[post.platform];
                      const publishIssue = resolvePublishIssue(postError);

                      return (
                        <div key={post.id} className="rounded-lg border border-border bg-secondary/20 p-3 space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-foreground">
                                {post.platform.toUpperCase()} • {new Date(post.scheduledTime).toLocaleString('pl-PL')}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">Status: {postStatusLabel(post.status)}</p>
                              {post.status === 'pending' && (
                                <div className="mt-2">
                                  <label className="text-[11px] text-muted-foreground block mb-1">Nowy termin</label>
                                  <input
                                    type="datetime-local"
                                    value={campaignScheduleInput[post.id] || ''}
                                    max={effectivePlan === 'FREE' ? freePlanMaxDateTimeLocal : undefined}
                                    onChange={(event) =>
                                      setCampaignScheduleInput((current) => ({
                                        ...current,
                                        [post.id]: event.target.value,
                                      }))
                                    }
                                    className="px-2 py-1 bg-secondary/40 border border-border rounded-md text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                                  />
                                  {effectivePlan === 'FREE' && (
                                    <p className="text-[11px] text-muted-foreground mt-1">Plan Free: maks. 72 godziny do przodu.</p>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                onClick={() => runAction(post.id, 'trigger')}
                                disabled={actionId === post.id}
                                className="px-3 py-1.5 text-xs rounded-lg bg-primary/10 border border-primary/30 text-primary disabled:opacity-60"
                              >
                                Uruchom
                              </button>
                              <button
                                onClick={() => runAction(post.id, 'retry')}
                                disabled={actionId === post.id}
                                className="px-3 py-1.5 text-xs rounded-lg bg-secondary border border-border text-foreground disabled:opacity-60"
                              >
                                Ponów
                              </button>
                              <button
                                onClick={() => runAction(post.id, 'cancel')}
                                disabled={actionId === post.id}
                                className="px-3 py-1.5 text-xs rounded-lg bg-destructive/10 border border-destructive/30 text-destructive disabled:opacity-60"
                              >
                                Anuluj
                              </button>
                            </div>
                          </div>

                          {publishIssue && (
                            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-2">
                              <p className="text-xs text-destructive break-words">{publishIssue.message}</p>
                              {publishIssue.actionHref && publishIssue.actionLabel && (
                                <a
                                  href={publishIssue.actionHref}
                                  className="inline-flex mt-2 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20"
                                >
                                  {publishIssue.actionLabel}
                                </a>
                              )}
                              {publishIssue.rawTechnical && (
                                <details className="mt-2">
                                  <summary className="text-[11px] text-muted-foreground cursor-pointer">Pokaż log techniczny</summary>
                                  <p className="mt-2 text-[11px] text-muted-foreground break-words whitespace-pre-wrap">
                                    {publishIssue.rawTechnical}
                                  </p>
                                </details>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Sugestie AI</p>
                    {selectedCampaignSuggestions.length === 0 && (
                      <p className="text-xs text-muted-foreground">Brak sugestii AI dla tej kampanii.</p>
                    )}

                    {selectedCampaignSuggestions.map((post) => (
                      <div key={post.id} className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                        <p className="text-sm text-foreground">
                          {post.platform.toUpperCase()} • {new Date(post.scheduledTime).toLocaleString('pl-PL')}
                        </p>
                        <p className="text-xs text-primary mt-1">Status: sugestia AI</p>
                      </div>
                    ))}
                  </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}