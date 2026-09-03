const HONEYPOT_MIN_SUBMIT_MS = 2500;
const HONEYPOT_MAX_FUTURE_SKEW_MS = 60_000;

export type HoneypotSignals = {
  hpWebsite?: string;
  formStartedAt?: number | string;
};

function parseStartedAtMs(value: HoneypotSignals['formStartedAt']) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function hasTrippedHoneypot(signals: HoneypotSignals, nowMs = Date.now()) {
  const hpWebsite = signals.hpWebsite?.trim() ?? '';
  if (hpWebsite.length > 0) {
    return true;
  }

  const startedAtMs = parseStartedAtMs(signals.formStartedAt);
  if (startedAtMs === null) {
    return false;
  }

  if (startedAtMs > nowMs + HONEYPOT_MAX_FUTURE_SKEW_MS) {
    return true;
  }

  return nowMs - startedAtMs < HONEYPOT_MIN_SUBMIT_MS;
}
