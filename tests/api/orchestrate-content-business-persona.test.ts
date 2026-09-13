import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Real orchestrateContent, real DB user - only the Claude HTTP call is mocked. Every existing
// test that touches generatePlatformBundles mocks it entirely at the composer-drafts.ts
// boundary, so orchestrateContent's own internals (including the businessDescription lookup
// added for account-persona threading) had zero test coverage before this file.

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

const { orchestrateContent } = await import('@/lib/server/smart-autopilot/orchestrator');
const { prisma } = await import('@/lib/server/prisma');
const { createTestUser, deleteTestUser } = await import('../helpers/fixtures');

let cleanupUserId: string | null = null;

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
});

afterEach(async () => {
  vi.unstubAllGlobals();
  if (ORIGINAL_KEY === undefined) {
    delete process.env.ANTHROPIC_API_KEY;
  } else {
    process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  }
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

describe('orchestrateContent threads the account businessDescription into Claude generation', () => {
  it('includes the saved businessDescription as accountContext in the Claude request', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    await prisma.user.update({
      where: { id: user.id },
      data: { businessDescription: 'Prowadzę salon kosmetyczny, paznokcie i rzęsy' },
    });

    let capturedBody: { messages: Array<{ content: string }> } | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        capturedBody = JSON.parse(init!.body as string);
        return {
          ok: true,
          json: async () => ({
            content: [
              {
                type: 'tool_use',
                name: 'generate_platform_bundles',
                input: { bundles: [{ platform: 'TIKTOK', caption: 'x', hashtags: ['a'] }] },
              },
            ],
          }),
        };
      }),
    );

    await orchestrateContent(user.id, {
      rawInput: 'Nowa oferta na paznokcie hybrydowe',
      timezone: 'Europe/Warsaw',
      mode: 'manual',
      publishMode: 'draft',
      targetPlatforms: ['TIKTOK'],
      idempotencyKey: `idem-${user.id}`,
    });

    expect(capturedBody).not.toBeNull();
    const sentText = capturedBody!.messages[0].content;
    expect(sentText).toContain('Prowadzę salon kosmetyczny');
  });

  it('does not crash and passes an empty accountContext for a user with no businessDescription set', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [
            {
              type: 'tool_use',
              name: 'generate_platform_bundles',
              input: { bundles: [{ platform: 'TIKTOK', caption: 'x', hashtags: ['a'] }] },
            },
          ],
        }),
      }),
    );

    const result = await orchestrateContent(user.id, {
      rawInput: 'Nowy klip',
      timezone: 'Europe/Warsaw',
      mode: 'manual',
      publishMode: 'draft',
      targetPlatforms: ['TIKTOK'],
      idempotencyKey: `idem-empty-${user.id}`,
    });

    expect(result.platformBundles.length).toBeGreaterThan(0);
  });
});
