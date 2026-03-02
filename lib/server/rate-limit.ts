import { NextRequest } from 'next/server';

type Bucket = {
  count: number;
  resetAt: number;
};

type RateLimitInput = {
  key: string;
  limit: number;
  windowMs: number;
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
};

const globalForRateLimit = globalThis as unknown as {
  rateLimitBuckets?: Map<string, Bucket>;
};

function getUpstashConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  return {
    url: url.replace(/\/$/, ''),
    token,
  };
}

function getBuckets() {
  if (!globalForRateLimit.rateLimitBuckets) {
    globalForRateLimit.rateLimitBuckets = new Map<string, Bucket>();
  }

  return globalForRateLimit.rateLimitBuckets;
}

function cleanupExpiredBuckets(now: number, buckets: Map<string, Bucket>) {
  if (buckets.size < 1000) {
    return;
  }

  for (const [key, value] of buckets) {
    if (value.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

export function getRequestIp(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) {
      return first;
    }
  }

  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) {
    return realIp;
  }

  return 'unknown';
}

function consumeRateLimitInMemory({ key, limit, windowMs }: RateLimitInput): RateLimitResult {
  const now = Date.now();
  const buckets = getBuckets();
  cleanupExpiredBuckets(now, buckets);

  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });

    return {
      allowed: true,
      remaining: Math.max(0, limit - 1),
      retryAfterSec: Math.ceil(windowMs / 1000),
    };
  }

  existing.count += 1;

  if (existing.count > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, limit - existing.count),
    retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

async function consumeRateLimitUpstash({ key, limit, windowMs }: RateLimitInput): Promise<RateLimitResult | null> {
  const upstash = getUpstashConfig();
  if (!upstash) {
    return null;
  }

  const windowSec = Math.max(1, Math.ceil(windowMs / 1000));
  const now = Date.now();
  const bucketStart = now - (now % windowMs);
  const bucketKey = `rl:${key}:${bucketStart}`;

  const response = await fetch(`${upstash.url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${upstash.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([
      ['INCR', bucketKey],
      ['EXPIRE', bucketKey, windowSec, 'NX'],
      ['TTL', bucketKey],
    ]),
    cache: 'no-store',
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as Array<{ result?: unknown }>;
  const current = Number(data[0]?.result);
  const ttlRaw = Number(data[2]?.result);

  if (!Number.isFinite(current) || current <= 0) {
    return null;
  }

  const retryAfterSec = Number.isFinite(ttlRaw) && ttlRaw > 0 ? Math.floor(ttlRaw) : windowSec;

  return {
    allowed: current <= limit,
    remaining: Math.max(0, limit - current),
    retryAfterSec: Math.max(1, retryAfterSec),
  };
}

export async function consumeRateLimit(input: RateLimitInput): Promise<RateLimitResult> {
  try {
    const distributedResult = await consumeRateLimitUpstash(input);
    if (distributedResult) {
      return distributedResult;
    }
  } catch {
  }

  return consumeRateLimitInMemory(input);
}
