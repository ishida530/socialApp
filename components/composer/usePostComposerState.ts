import { useCallback, useEffect, useReducer, useRef } from 'react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import type { DraftJob, Platform, SocialAccountDto } from './types';

export type ComposerStep = 'gate' | 'blocked' | 'media' | 'adapting' | 'content' | 'schedule' | 'status';

type UploadedVideo = {
  id: string;
  title: string;
  sourceUrl: string;
  mediaType: 'VIDEO' | 'IMAGE';
  durationSec: number | null;
};

type ResumeCandidate = {
  postGroupId: string;
  jobs: DraftJob[];
  askDefaultExplicit?: boolean;
};

export type State = {
  step: ComposerStep;
  connectedAccounts: SocialAccountDto[];
  resumeCandidate: ResumeCandidate | null;
  contentType: string;
  songTitle: string;
  video: UploadedVideo | null;
  postGroupId: string | null;
  jobs: DraftJob[];
  activeTab: Platform | null;
  askExplicit: boolean;
  selectedPlatforms: Set<Platform>;
  scheduledAt: string;
  isStarting: boolean;
  isSubmitting: boolean;
  finalizedJobs: DraftJob[] | null;
};

export type Action =
  | { type: 'SET_ACCOUNTS'; accounts: SocialAccountDto[] }
  | { type: 'SET_RESUME'; candidate: ResumeCandidate | null }
  | { type: 'DISMISS_RESUME' }
  | { type: 'RESUME_GROUP' }
  | { type: 'SET_CONTENT_TYPE'; value: string }
  | { type: 'SET_SONG_TITLE'; value: string }
  | { type: 'SET_VIDEO'; video: UploadedVideo | null }
  | { type: 'START_ADAPTING' }
  | { type: 'SET_STARTING'; value: boolean }
  | { type: 'SET_JOBS'; postGroupId: string; jobs: DraftJob[]; askExplicit: boolean }
  | { type: 'UPDATE_JOB'; jobId: string; patch: Partial<DraftJob> }
  | { type: 'SET_ACTIVE_TAB'; platform: Platform }
  | { type: 'DISMISS_ASK_EXPLICIT' }
  | { type: 'GO_TO_SCHEDULE' }
  | { type: 'GO_BACK' }
  | { type: 'TOGGLE_PLATFORM'; platform: Platform }
  | { type: 'SET_SCHEDULED_AT'; value: string }
  | { type: 'SET_SUBMITTING'; value: boolean }
  | { type: 'FINALIZE_SUCCESS'; jobs: DraftJob[] }
  | { type: 'RESET' };

export const initialState: State = {
  step: 'gate',
  connectedAccounts: [],
  resumeCandidate: null,
  contentType: '',
  songTitle: '',
  video: null,
  postGroupId: null,
  jobs: [],
  activeTab: null,
  askExplicit: false,
  selectedPlatforms: new Set(),
  scheduledAt: '',
  isStarting: false,
  isSubmitting: false,
  finalizedJobs: null,
};

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_ACCOUNTS':
      return {
        ...state,
        connectedAccounts: action.accounts,
        step: action.accounts.length === 0 ? 'blocked' : state.step === 'gate' ? 'media' : state.step,
      };
    case 'SET_RESUME':
      return { ...state, resumeCandidate: action.candidate };
    case 'DISMISS_RESUME':
      return { ...state, resumeCandidate: null };
    case 'RESUME_GROUP': {
      if (!state.resumeCandidate) {
        return state;
      }
      const { postGroupId, jobs, askDefaultExplicit } = state.resumeCandidate;
      return {
        ...state,
        postGroupId,
        jobs,
        video: jobs[0]?.video ?? state.video,
        activeTab: jobs[0]?.socialAccount.platform ?? null,
        askExplicit: Boolean(askDefaultExplicit),
        selectedPlatforms: new Set(jobs.map((job) => job.socialAccount.platform)),
        resumeCandidate: null,
        step: 'content',
      };
    }
    case 'SET_CONTENT_TYPE':
      return { ...state, contentType: action.value };
    case 'SET_SONG_TITLE':
      return { ...state, songTitle: action.value };
    case 'SET_VIDEO':
      return { ...state, video: action.video };
    case 'START_ADAPTING':
      return { ...state, step: 'adapting' };
    case 'SET_STARTING':
      return { ...state, isStarting: action.value };
    case 'SET_JOBS':
      return {
        ...state,
        postGroupId: action.postGroupId,
        jobs: action.jobs,
        activeTab: action.jobs[0]?.socialAccount.platform ?? null,
        askExplicit: action.askExplicit,
        selectedPlatforms: new Set(action.jobs.map((job) => job.socialAccount.platform)),
        step: 'content',
      };
    case 'UPDATE_JOB':
      return {
        ...state,
        jobs: state.jobs.map((job) => (job.id === action.jobId ? { ...job, ...action.patch } : job)),
      };
    case 'SET_ACTIVE_TAB':
      return { ...state, activeTab: action.platform };
    case 'DISMISS_ASK_EXPLICIT':
      return { ...state, askExplicit: false };
    case 'GO_TO_SCHEDULE':
      return { ...state, step: 'schedule' };
    case 'GO_BACK':
      if (state.step === 'schedule') {
        return { ...state, step: 'content' };
      }
      if (state.step === 'content') {
        return { ...state, step: 'media' };
      }
      return state;
    case 'TOGGLE_PLATFORM': {
      const next = new Set(state.selectedPlatforms);
      if (next.has(action.platform)) {
        next.delete(action.platform);
      } else {
        next.add(action.platform);
      }
      return { ...state, selectedPlatforms: next };
    }
    case 'SET_SCHEDULED_AT':
      return { ...state, scheduledAt: action.value };
    case 'SET_SUBMITTING':
      return { ...state, isSubmitting: action.value };
    case 'FINALIZE_SUCCESS':
      return { ...state, step: 'status', finalizedJobs: action.jobs };
    case 'RESET':
      return {
        ...initialState,
        connectedAccounts: state.connectedAccounts,
        step: state.connectedAccounts.length === 0 ? 'blocked' : 'media',
      };
    default:
      return state;
  }
}

const AUTOSAVE_DEBOUNCE_MS = 700;

export function usePostComposerState() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const loadGateData = useCallback(async () => {
    try {
      const [accountsResponse, resumeResponse] = await Promise.all([
        apiClient.get<SocialAccountDto[]>('/social-accounts'),
        apiClient.get<ResumeCandidate | null>('/publish-jobs/drafts'),
      ]);

      dispatch({ type: 'SET_ACCOUNTS', accounts: accountsResponse.data });

      if (resumeResponse.data && resumeResponse.data.jobs.length > 0) {
        dispatch({ type: 'SET_RESUME', candidate: resumeResponse.data });
      }
    } catch {
      dispatch({ type: 'SET_ACCOUNTS', accounts: [] });
    }
  }, []);

  useEffect(() => {
    void loadGateData();
  }, [loadGateData]);

  const resumeGroup = useCallback(() => {
    dispatch({ type: 'RESUME_GROUP' });
  }, []);

  const discardResume = useCallback(async () => {
    const candidate = state.resumeCandidate;
    dispatch({ type: 'DISMISS_RESUME' });

    if (!candidate) {
      return;
    }

    try {
      await apiClient.delete('/publish-jobs/drafts', { params: { postGroupId: candidate.postGroupId } });
    } catch {
      // best-effort cleanup — leaving an orphaned DRAFT group is harmless
    }
  }, [state.resumeCandidate]);

  const setContentType = useCallback((value: string) => dispatch({ type: 'SET_CONTENT_TYPE', value }), []);
  const setSongTitle = useCallback((value: string) => dispatch({ type: 'SET_SONG_TITLE', value }), []);
  const setVideo = useCallback((video: UploadedVideo | null) => dispatch({ type: 'SET_VIDEO', video }), []);

  const startComposing = useCallback(async () => {
    if (!state.video) {
      toast.error('Najpierw prześlij materiał.');
      return;
    }

    dispatch({ type: 'SET_STARTING', value: true });
    dispatch({ type: 'START_ADAPTING' });

    try {
      const response = await apiClient.post<{
        postGroupId: string;
        jobs: DraftJob[];
        askDefaultExplicit: boolean;
        orchestrationWarning: string | null;
      }>('/publish-jobs/drafts', {
        videoId: state.video.id,
        contentType: state.contentType.trim() || undefined,
        songTitle: state.songTitle.trim() || undefined,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Warsaw',
      });

      dispatch({
        type: 'SET_JOBS',
        postGroupId: response.data.postGroupId,
        jobs: response.data.jobs,
        askExplicit: response.data.askDefaultExplicit,
      });

      if (response.data.orchestrationWarning) {
        toast.warning('AI nie wygenerowało treści automatycznie — uzupełnij caption ręcznie.');
      }
    } catch {
      toast.error('Nie udało się przygotować posta. Spróbuj ponownie.');
      dispatch({ type: 'SET_JOBS', postGroupId: '', jobs: [], askExplicit: false });
      dispatch({ type: 'GO_BACK' });
    } finally {
      dispatch({ type: 'SET_STARTING', value: false });
    }
  }, [state.contentType, state.songTitle, state.video]);

  const setActiveTab = useCallback((platform: Platform) => dispatch({ type: 'SET_ACTIVE_TAB', platform }), []);

  const answerDefaultExplicit = useCallback(
    async (isExplicit: boolean) => {
      dispatch({ type: 'DISMISS_ASK_EXPLICIT' });

      try {
        await apiClient.patch('/auth/me', { defaultExplicitContent: isExplicit });
      } catch {
        // non-critical — the per-post value below still gets saved
      }

      await Promise.all(
        state.jobs.map((job) =>
          apiClient
            .patch(`/publish-jobs/drafts/${job.id}`, { isExplicit })
            .then(() => dispatch({ type: 'UPDATE_JOB', jobId: job.id, patch: { isExplicit } }))
            .catch(() => null),
        ),
      );
    },
    [state.jobs],
  );

  const updateJobField = useCallback((jobId: string, patch: Record<string, unknown>) => {
    dispatch({ type: 'UPDATE_JOB', jobId, patch: patch as Partial<DraftJob> });

    const existingTimer = debounceTimers.current.get(jobId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      apiClient.patch(`/publish-jobs/drafts/${jobId}`, patch).catch(() => {
        toast.error('Nie udało się zapisać zmian. Spróbuj ponownie.');
      });
      debounceTimers.current.delete(jobId);
    }, AUTOSAVE_DEBOUNCE_MS);

    debounceTimers.current.set(jobId, timer);
  }, []);

  const saveJobFieldNow = useCallback(async (jobId: string, patch: Record<string, unknown>) => {
    dispatch({ type: 'UPDATE_JOB', jobId, patch: patch as Partial<DraftJob> });

    const existingTimer = debounceTimers.current.get(jobId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      debounceTimers.current.delete(jobId);
    }

    const response = await apiClient.patch<DraftJob>(`/publish-jobs/drafts/${jobId}`, patch);
    dispatch({ type: 'UPDATE_JOB', jobId, patch: response.data });
    return response.data;
  }, []);

  const regenerateJob = useCallback(async (jobId: string) => {
    try {
      const response = await apiClient.post<DraftJob>(`/publish-jobs/drafts/${jobId}/regenerate`, {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Warsaw',
      });
      dispatch({ type: 'UPDATE_JOB', jobId, patch: response.data });
      toast.success('Wygenerowano nową treść.');
    } catch {
      toast.error('Nie udało się wygenerować treści ponownie.');
    }
  }, []);

  const goToSchedule = useCallback(() => dispatch({ type: 'GO_TO_SCHEDULE' }), []);
  const goBack = useCallback(() => dispatch({ type: 'GO_BACK' }), []);
  const togglePlatform = useCallback((platform: Platform) => dispatch({ type: 'TOGGLE_PLATFORM', platform }), []);
  const setScheduledAt = useCallback((value: string) => dispatch({ type: 'SET_SCHEDULED_AT', value }), []);

  const finalize = useCallback(
    async (publishNow: boolean, tiktokPostingConsent: boolean) => {
      if (!state.postGroupId) {
        return;
      }

      const targetPlatforms = Array.from(state.selectedPlatforms);
      if (targetPlatforms.length === 0) {
        toast.error('Wybierz co najmniej jedną platformę.');
        return;
      }

      if (!publishNow && !state.scheduledAt) {
        toast.error('Wybierz datę i godzinę publikacji.');
        return;
      }

      dispatch({ type: 'SET_SUBMITTING', value: true });

      try {
        const response = await apiClient.post<{ success: boolean; publishJobs: DraftJob[] }>(
          '/publish-jobs/enqueue',
          {
            postGroupId: state.postGroupId,
            targetPlatforms,
            publishNow,
            scheduledDate: publishNow ? undefined : new Date(state.scheduledAt).toISOString(),
            tiktokPostingConsent: targetPlatforms.includes('TIKTOK') ? tiktokPostingConsent : undefined,
          },
        );

        dispatch({ type: 'FINALIZE_SUCCESS', jobs: response.data.publishJobs });
      } catch (error: unknown) {
        const message =
          (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Nie udało się opublikować/zaplanować posta.';
        toast.error(message);
      } finally {
        dispatch({ type: 'SET_SUBMITTING', value: false });
      }
    },
    [state.postGroupId, state.scheduledAt, state.selectedPlatforms],
  );

  const startNewPost = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  return {
    state,
    actions: {
      resumeGroup,
      discardResume,
      setContentType,
      setSongTitle,
      setVideo,
      startComposing,
      setActiveTab,
      answerDefaultExplicit,
      updateJobField,
      saveJobFieldNow,
      regenerateJob,
      goToSchedule,
      goBack,
      togglePlatform,
      setScheduledAt,
      finalize,
      startNewPost,
    },
  };
}
