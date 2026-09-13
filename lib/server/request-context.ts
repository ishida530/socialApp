import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

// TASK-1.3.4: a single ID that follows one request through the whole chain of agents -
// Telegram webhook -> publish-jobs -> publish-processor -> platform API calls - so every
// logEvent/logError emitted anywhere in that chain carries the same requestId, without having
// to thread an extra parameter through every function signature in between. AsyncLocalStorage
// propagates automatically through the async call chain of a single incoming request/invocation.

const storage = new AsyncLocalStorage<{ requestId: string }>();

export function getCurrentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

// Entry points (webhook/cron/QStash routes) wrap their handler body in this once, at the top -
// everything awaited underneath, however deep, sees the same requestId via getCurrentRequestId.
export function runWithRequestId<T>(fn: () => T, requestId: string = randomUUID()): T {
  return storage.run({ requestId }, fn);
}
