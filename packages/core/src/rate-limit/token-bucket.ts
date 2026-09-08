import type { RateLimitRecord } from "../types/store.js";

export interface TokenBucketDecision {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterMs: number;
  readonly resetAt: number;
}

export function evaluateTokenBucket(
  record: RateLimitRecord,
  limit: number,
  windowMs: number,
  now: number,
): TokenBucketDecision {
  const refillRate = limit / windowMs;
  const elapsed = now - record.windowStart;

  if (elapsed > 0) {
    const refilled = record.count + elapsed * refillRate;
    record.count = Math.min(limit, refilled);
    record.windowStart = now;
  }

  if (record.count >= 1) {
    record.count -= 1;
    const remaining = Math.floor(record.count);
    return {
      allowed: true,
      remaining,
      retryAfterMs: 0,
      resetAt: now + Math.ceil((1 - record.count) / refillRate),
    };
  }

  const tokensNeeded = 1 - record.count;
  const retryAfterMs = Math.max(1, Math.ceil(tokensNeeded / refillRate));

  return {
    allowed: false,
    remaining: 0,
    retryAfterMs,
    resetAt: now + retryAfterMs,
  };
}

export function normalizeTokenBucketRecord(
  record: RateLimitRecord,
  limit: number,
  windowMs: number,
  now: number,
): void {
  const refillRate = limit / windowMs;
  const elapsed = now - record.windowStart;

  if (elapsed <= 0) {
    return;
  }

  record.count = Math.min(limit, record.count + elapsed * refillRate);
  record.windowStart = now;
  record.prevCount = 0;
}
