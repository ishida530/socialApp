import { redactSensitiveValue } from '@/lib/redact';

type LogLevel = 'info' | 'error';

type LogPayload = {
  scope: string;
  event: string;
  level?: LogLevel;
  metadata?: Record<string, unknown>;
};

function emitLog(payload: LogPayload) {
  const message = {
    timestamp: new Date().toISOString(),
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