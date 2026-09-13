import { redactSensitiveValue } from '@/lib/redact';
import { getCurrentRequestId } from '@/lib/server/request-context';

type LogLevel = 'info' | 'error';

type LogPayload = {
  scope: string;
  event: string;
  level?: LogLevel;
  metadata?: Record<string, unknown>;
};

function emitLog(payload: LogPayload) {
  // TASK-1.3.4: whatever entry point (Telegram webhook, cron, QStash trigger) wrapped this
  // request in runWithRequestId - every log line emitted anywhere downstream, however deep,
  // carries the same requestId automatically. undefined (omitted) for code paths nothing wraps
  // yet - not every entry point needs this, only ones where tracing a chain across services
  // actually matters.
  const requestId = getCurrentRequestId();

  const message = {
    timestamp: new Date().toISOString(),
    ...(requestId ? { requestId } : {}),
    scope: payload.scope,
    event: payload.event,
    // TASK-1.5.2: scrub before it ever reaches console/Vercel's log stream - see lib/redact.ts.
    metadata: redactSensitiveValue(payload.metadata ?? {}),
  };

  if (payload.level === 'error') {
    console.error(JSON.stringify(message));
    return;
  }

  console.info(JSON.stringify(message));
}

export function logEvent(
  scope: string,
  event: string,
  metadata?: Record<string, unknown>,
) {
  emitLog({
    scope,
    event,
    level: 'info',
    metadata,
  });
}

export function logError(
  scope: string,
  event: string,
  error: unknown,
  metadata?: Record<string, unknown>,
) {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';

  emitLog({
    scope,
    event,
    level: 'error',
    metadata: {
      ...metadata,
      errorMessage,
    },
  });
}