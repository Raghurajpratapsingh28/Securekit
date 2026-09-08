import type { RateLimitRecord } from "../types/store.js";

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly estimate: number;
  readonly remaining: number;
  readonly retryAfterMs: number;
  readonly resetAt: number;
}

export function evaluateSlidingWindowCounter(
  record: RateLimitRecord,
  limit: number,
  windowMs: number,
  now: number,
): RateLimitDecision {
  const elapsed = now - record.windowStart;
  const elapsedFraction = Math.min(Math.max(elapsed / windowMs, 0), 1);
  const estimate = record.count + record.prevCount * (1 - elapsedFraction);
  const allowed = estimate <= limit;
  const remaining = Math.max(0, Math.floor(limit - estimate));
  const retryAfterMs = allowed ? 0 : Math.max(1, windowMs - elapsed);
  const resetAt = record.windowStart + windowMs;

  return {
    allowed,
    estimate,
    remaining,
    retryAfterMs,
    resetAt,
  };
}

export function normalizeSlidingWindowRecord(
  record: RateLimitRecord,
  now: number,
  windowMs: number,
): void {
  const elapsed = now - record.windowStart;

  if (elapsed < windowMs) {
    return;
  }

  if (elapsed >= windowMs * 2) {
    record.prevCount = 0;
  } else {
    record.prevCount = record.count;
  }

  record.count = 0;
  record.windowStart = now;
}
