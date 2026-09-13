import { Client, Receiver } from '@upstash/qstash';
import { logError } from './observability';

// Precise scheduling without a persistent worker process: Vercel Functions are stateless and
// ephemeral, so a BullMQ-style worker (a long-lived process holding a Redis connection) simply
// can't run there - Hobby or Pro, that's a hosting-model limit, not a plan-tier one. QStash
// instead calls an ordinary serverless endpoint AT the scheduled time; the existing daily Vercel
// cron (once/day on Hobby) stays as a fallback safety net for anything QStash misses. See
// postfly-plan-projektu.md's Architekt decision superseding TASK-1.4.1/TASK-2.1.1 (BullMQ).
//
// Optional by design, same pattern as every other external integration in this app (Claude,
// OpenAI before it): unconfigured -> functions return null/no-op, callers fall back to the
// pre-existing behavior (job sits PENDING until the daily cron sweep picks it up) rather than
// failing the request.

function getClient() {
  const token = process.env.QSTASH_TOKEN;
  if (!token) {
    return null;
  }
  // Some Upstash QStash instances are region-pinned (e.g. eu-central-1) and only accept
  // requests at their own regional endpoint, not the SDK's global default - QSTASH_URL lets
  // that be configured explicitly instead of assuming the default always works.
  const baseUrl = process.env.QSTASH_URL;
  return new Client(baseUrl ? { token, baseUrl } : { token });
}

function getTriggerUrl() {
  const frontendUrl = process.env.FRONTEND_URL;
  if (!frontendUrl) {
    return null;
  }
  return new URL('/api/qstash/trigger-publish', frontendUrl).toString();
}

export async function scheduleQStashPublish(jobId: string, notBefore: Date): Promise<string | null> {
  const client = getClient();
  const triggerUrl = getTriggerUrl();
  if (!client || !triggerUrl) {
    return null;
  }

  try {
    const result = await client.publishJSON({
      url: triggerUrl,
      body: { jobId },
      notBefore: Math.floor(notBefore.getTime() / 1000),
    });
    return result.messageId ?? null;
  } catch (error) {
    logError('qstash', 'schedule-publish-failed', error, { jobId });
    return null;
  }
}

export async function cancelQStashMessage(messageId: string): Promise<void> {
  const client = getClient();
  if (!client) {
    return;
  }

  try {
    await client.messages.delete(messageId);
  } catch (error) {
    // Already fired, already canceled, or never existed - none of these should block whatever
    // the caller (cancelPublishJob) is doing.
    logError('qstash', 'cancel-message-failed', error, { messageId });
  }
}

export function verifyQStashSignature(signature: string | null, body: string): Promise<boolean> {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;

  if (!signature || !currentSigningKey || !nextSigningKey) {
    return Promise.resolve(false);
  }

  const receiver = new Receiver({ currentSigningKey, nextSigningKey });
  return receiver.verify({ signature, body }).catch((error) => {
    logError('qstash', 'signature-verification-failed', error);
    return false;
  });
}
