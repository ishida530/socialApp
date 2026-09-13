import { afterEach, describe, expect, it, vi } from 'vitest';
import { processDuePublishJobs, processPublishJobImmediately } from '@/lib/server/publish-processor';
import { encrypt } from '@/lib/server/crypto';
import { prisma } from '@/lib/server/prisma';
import { createTestUser, deleteTestUser, createSocialAccount, createVideo } from '../helpers/fixtures';

// TASK-2.2.2/TASK-2.2.3: proves, rather than assumes, that the claim step in
// claimDuePublishJobs (FOR UPDATE SKIP LOCKED) and processPublishJobImmediately (a conditional
// updateMany guarded on status='PENDING') is race-safe: N concurrently-triggered runs against
// the same due jobs must claim each job exactly once (no loss, no duplication), and two
// concurrent immediate triggers for the SAME job must publish it exactly once.
//
// Writing this test caught a real bug: claimDuePublishJobs originally filtered
// User.publishingPaused via an inner JOIN to Video/User inside the same query as
// `ORDER BY ... FOR UPDATE SKIP LOCKED LIMIT`. Empirically (~40-50% of concurrent trials against
// a real Postgres instance) that JOIN made Postgres lock more candidate rows than the LIMIT
// ultimately returned - rows a transaction scanned-and-locked while computing the sorted top-N,
// then discarded before its own final result, stayed locked (hence invisible to SKIP LOCKED) to
// every OTHER concurrent transaction even though nobody ended up processing them that round.
// Not permanent data loss (they're still PENDING and due, so the next non-concurrent cron tick
// picks them up) but a genuine "N concurrent claims should partition the batch, not starve each
// other" violation. Fixed in claimDuePublishJobs by moving the pause check to a NOT EXISTS
// predicate instead of a JOIN, which keeps the locking scan limited to PublishJob's own indexed
// columns. See the "Log ról" entry for TASK-2.2.2 in postfly-plan-projektu.md.

const cleanupUserIds: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(cleanupUserIds.splice(0).map((id) => deleteTestUser(id)));
});

async function createDuePendingJob(userId: string) {
  const account = await createSocialAccount(userId, 'FACEBOOK', {
    accessToken: encrypt('real-looking-access-token'),
  });
  const video = await createVideo(userId);

  return prisma.publishJob.create({
    data: {
      status: 'PENDING',
      postGroupId: `group-${userId}`,
      caption: 'caption',
      hashtags: [],
      // A full minute of margin, not a second or two - the Node test process and the local
      // Postgres server (Docker/WSL2) can drift enough to make a 1s margin flaky (NOW() on the
      // DB server briefly still ahead of "past" scheduledFor timestamps computed client-side).
      scheduledFor: new Date(Date.now() - 60_000),
      videoId: video.id,
      socialAccountId: account.id,
      // Pin to FEED so this is the plain, single-request publish path this test's fetch mock
      // matches - Reels' 3-step upload isn't what's under test here.
      metaPostFormat: 'FEED',
    },
  });
}

describe('publish job claim concurrency (TASK-2.2.2, TASK-2.2.3)', () => {
  it('TASK-2.2.3: two concurrent processPublishJobImmediately calls for the SAME job publish it exactly once', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    const job = await createDuePendingJob(user.id);

    let fetchCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        fetchCalls += 1;
        return { ok: true, json: async () => ({ id: 'remote-1', post_id: 'remote-1' }), text: async () => '' };
      }),
    );

    const [outcomeA, outcomeB] = await Promise.all([
      processPublishJobImmediately(job.id),
      processPublishJobImmediately(job.id),
    ]);

    const outcomes = [outcomeA, outcomeB].sort();
    // Exactly one caller wins the atomic claim (status transitions PENDING -> RUNNING); the
    // other's conditional updateMany matches zero rows and reports 'skipped'.
    expect(outcomes).toEqual(['skipped', 'succeeded']);
    expect(fetchCalls).toBe(1);

    const finalJob = await prisma.publishJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(finalJob.status).toBe('SUCCESS');
  });

  it('TASK-2.2.3: a job already RUNNING (e.g. mid-publish from another trigger) is not re-claimed by processPublishJobImmediately', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    const job = await createDuePendingJob(user.id);
    await prisma.publishJob.update({ where: { id: job.id }, data: { status: 'RUNNING' } });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'x', post_id: 'x' }), text: async () => '' }),
    );

    const outcome = await processPublishJobImmediately(job.id);
    expect(outcome).toBe('skipped');

    const finalJob = await prisma.publishJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(finalJob.status).toBe('RUNNING');
  });

  it('TASK-2.2.2: N concurrently-triggered processDuePublishJobs runs claim every due job exactly once, with no loss or duplication', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);

    const JOB_COUNT = 12;
    const CONCURRENT_RUNS = 4;
    const ROUNDS = 4;

    let fetchCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        fetchCalls += 1;
        return {
          ok: true,
          json: async () => ({ id: `remote-${fetchCalls}`, post_id: `remote-${fetchCalls}` }),
          text: async () => '',
        };
      }),
    );

    // Several independent rounds against a fresh batch each time - the JOIN-vs-NOT-EXISTS race
    // this test was written to catch isn't 100% reproducible on a single trial (it surfaced in
    // roughly 40-50% of individual concurrent attempts against real Postgres), so one round alone
    // would be a flaky regression guard. Failing on ANY round is a real problem.
    for (let round = 1; round <= ROUNDS; round += 1) {
      fetchCalls = 0;
      const jobs = await Promise.all(Array.from({ length: JOB_COUNT }, () => createDuePendingJob(user.id)));

      // Simulates overlapping triggers for the same due batch (e.g. the daily cron firing while
      // a manual "Uruchom" retry sweep is also in flight) - each run competes for the same rows
      // via `FOR UPDATE SKIP LOCKED`, so the union across runs must equal the full set with no
      // overlap.
      const summaries = await Promise.all(
        Array.from({ length: CONCURRENT_RUNS }, () => processDuePublishJobs(JOB_COUNT)),
      );

      const totalClaimed = summaries.reduce((sum, s) => sum + s.claimed, 0);
      expect(totalClaimed, `round ${round}: total claimed across ${CONCURRENT_RUNS} concurrent runs`).toBe(JOB_COUNT);

      const totalSucceeded = summaries.reduce((sum, s) => sum + s.succeeded, 0);
      expect(totalSucceeded, `round ${round}: total succeeded`).toBe(JOB_COUNT);
      expect(fetchCalls, `round ${round}: publish attempts (no duplication)`).toBe(JOB_COUNT);

      const finalJobs = await prisma.publishJob.findMany({
        where: { id: { in: jobs.map((j) => j.id) } },
      });
      expect(finalJobs).toHaveLength(JOB_COUNT);
      expect(finalJobs.every((j) => j.status === 'SUCCESS'), `round ${round}: every job SUCCESS`).toBe(true);
    }
  });
});
