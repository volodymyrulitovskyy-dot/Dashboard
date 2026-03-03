type RateLimitRule = {
  maxRequests: number;
  windowMs: number;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();
const MAX_STORE_ENTRIES = 25_000;

function nowMs() {
  return Date.now();
}

function shouldPurgeStore() {
  return rateLimitStore.size > MAX_STORE_ENTRIES;
}

function purgeExpiredEntries(currentTime: number) {
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt <= currentTime) {
      rateLimitStore.delete(key);
    }
  }
}

export function checkRateLimit(
  key: string,
  rule: RateLimitRule,
): RateLimitResult {
  const currentTime = nowMs();

  if (shouldPurgeStore()) {
    purgeExpiredEntries(currentTime);
  }

  const existing = rateLimitStore.get(key);
  if (!existing || existing.resetAt <= currentTime) {
    const resetAt = currentTime + rule.windowMs;
    rateLimitStore.set(key, {
      count: 1,
      resetAt,
    });

    return {
      allowed: true,
      limit: rule.maxRequests,
      remaining: Math.max(0, rule.maxRequests - 1),
      resetAt,
      retryAfterSeconds: 0,
    };
  }

  existing.count += 1;
  rateLimitStore.set(key, existing);

  const remaining = Math.max(0, rule.maxRequests - existing.count);
  const allowed = existing.count <= rule.maxRequests;
  const retryAfterSeconds = allowed
    ? 0
    : Math.max(1, Math.ceil((existing.resetAt - currentTime) / 1000));

  return {
    allowed,
    limit: rule.maxRequests,
    remaining,
    resetAt: existing.resetAt,
    retryAfterSeconds,
  };
}

export function buildRateLimitHeaders(result: RateLimitResult) {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.floor(result.resetAt / 1000)),
    ...(result.retryAfterSeconds > 0
      ? { "Retry-After": String(result.retryAfterSeconds) }
      : {}),
  };
}
