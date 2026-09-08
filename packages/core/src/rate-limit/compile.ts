import { ConfigurationError } from "../errors/configuration-error.js";
import { RateLimitError } from "../errors/rate-limit-error.js";
import type { RateLimitConfig, SecureKitConfig } from "../types/config.js";
import type { SecureKitContext } from "../types/context.js";
import type { PipelineStep, StepResult } from "../types/step.js";
import type { Store } from "../types/store.js";
import { CONTINUE, respond } from "../pipeline/result.js";
import { MemoryStore, isAsyncStore } from "./memory-store.js";
import {
  normalizeSlidingWindowRecord,
  evaluateSlidingWindowCounter,
} from "./sliding-window.js";
import {
  evaluateTokenBucket,
  normalizeTokenBucketRecord,
} from "./token-bucket.js";
import { resolveRateLimitKey, validateRateLimitKeyBy } from "./key-by.js";
import type { RateLimitKeyBy } from "./key-by.js";
import type { CompiledCors } from "../cors/compile.js";
import { applyCorsHeadersIfOriginAllowed } from "../cors/compile.js";
import type { RateLimitRejectedListener } from "../observability/events.js";
import { notifyListeners } from "../observability/events.js";

export const DEFAULT_RATE_LIMIT = 100;
export const DEFAULT_RATE_WINDOW_MS = 60_000;

export interface CompiledRateLimit {
  readonly limit: number;
  readonly windowMs: number;
  readonly algorithm: "sliding-window" | "token-bucket";
  readonly keyBy: RateLimitKeyBy;
  readonly store: Store;
  readonly isAsync: boolean;
  readonly memoryStore: MemoryStore | undefined;
}

function validateRateLimitConfig(rateLimit: unknown): RateLimitConfig {
  if (typeof rateLimit !== "object" || rateLimit === null) {
    throw new ConfigurationError("rateLimit must be a configuration object", {
      field: "rateLimit",
      received: rateLimit,
    });
  }

  return rateLimit as RateLimitConfig;
}

export function compileRateLimit(
  config: Readonly<SecureKitConfig>,
): CompiledRateLimit | undefined {
  if (config.rateLimit === undefined) {
    return undefined;
  }

  const rateLimit = validateRateLimitConfig(config.rateLimit);
  const limit = rateLimit.limit ?? DEFAULT_RATE_LIMIT;
  const windowMs = rateLimit.window ?? DEFAULT_RATE_WINDOW_MS;
  const algorithm = rateLimit.algorithm ?? "sliding-window";

  if (!Number.isFinite(limit) || limit <= 0) {
    throw new ConfigurationError("rateLimit.limit must be a positive number", {
      field: "rateLimit.limit",
      received: limit,
      suggestion: "Use a limit greater than zero, e.g. rateLimit: { limit: 100, window: 60_000 }.",
    });
  }

  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new ConfigurationError("rateLimit.window must be a positive number of milliseconds", {
      field: "rateLimit.window",
      received: windowMs,
    });
  }

  if (limit >= 100_000 && windowMs <= 1_000) {
    throw new ConfigurationError(
      "rateLimit.limit is effectively unlimited for the configured window",
      {
        field: "rateLimit",
        received: { limit, window: windowMs },
        suggestion: "Use a smaller limit or a longer window.",
      },
    );
  }

  const keyBy = validateRateLimitKeyBy(
    rateLimit.keyBy ?? "ip",
    "rateLimit.keyBy",
  );

  let memoryStore: MemoryStore | undefined;
  let store: Store;

  if (rateLimit.store !== undefined) {
    store = rateLimit.store;
  } else {
    const storeOptions =
      rateLimit.maxStoreEntries === undefined
        ? {}
        : { maxStoreEntries: rateLimit.maxStoreEntries };
    memoryStore = new MemoryStore(storeOptions);
    store = memoryStore;
  }

  const isAsync = isAsyncStore(store);

  if (isAsync && algorithm === "token-bucket") {
    throw new ConfigurationError(
      "rateLimit.algorithm token-bucket is not supported with async stores (e.g. RedisStore)",
      {
        field: "rateLimit.algorithm",
        received: algorithm,
        suggestion: 'Use algorithm: "sliding-window" with RedisStore or MemoryStore with token-bucket.',
      },
    );
  }

  return Object.freeze({
    limit,
    windowMs,
    algorithm,
    keyBy,
    store,
    isAsync,
    memoryStore,
  });
}

function applyRateLimitHeaders(
  ctx: SecureKitContext,
  limit: number,
  remaining: number,
  resetAt: number,
  retryAfterMs: number,
): void {
  ctx.responseHeaders.set("X-RateLimit-Limit", String(limit));
  ctx.responseHeaders.set("X-RateLimit-Remaining", String(Math.max(0, remaining)));
  ctx.responseHeaders.set("X-RateLimit-Reset", String(Math.ceil(resetAt / 1000)));

  if (retryAfterMs > 0) {
    ctx.responseHeaders.set(
      "Retry-After",
      String(Math.max(1, Math.ceil(retryAfterMs / 1000))),
    );
  }
}

async function finalizeRateLimitResponse(
  ctx: SecureKitContext,
  result: StepResult,
  cors: CompiledCors | undefined,
): Promise<StepResult> {
  if (result.kind === "respond" && cors !== undefined) {
    await applyCorsHeadersIfOriginAllowed(ctx, cors);
  }
  return result;
}

function runSlidingWindowDecision(
  compiled: CompiledRateLimit,
  ctx: SecureKitContext,
  now: number,
  onRejected: readonly RateLimitRejectedListener[] = [],
) {
  const key = resolveRateLimitKey(ctx, compiled.keyBy);
  let record;

  if (compiled.memoryStore !== undefined) {
    record = compiled.memoryStore.prepare(key, compiled.windowMs);
    normalizeSlidingWindowRecord(record, now, compiled.windowMs);
    record.count += 1;
  } else {
    const incrementResult = compiled.store.increment(key, compiled.windowMs);
    if (incrementResult instanceof Promise) {
      throw new Error("sync rate limit store expected");
    }
    record = incrementResult;
    normalizeSlidingWindowRecord(record, now, compiled.windowMs);
  }

  const decision = evaluateSlidingWindowCounter(
    record,
    compiled.limit,
    compiled.windowMs,
    now,
  );

  ctx.state.rateLimit = {
    limit: compiled.limit,
    remaining: decision.remaining,
    resetAt: decision.resetAt,
  };

  applyRateLimitHeaders(
    ctx,
    compiled.limit,
    decision.remaining,
    decision.resetAt,
    decision.allowed ? 0 : decision.retryAfterMs,
  );

  if (!decision.allowed) {
    notifyRateLimitRejected(onRejected, compiled.limit, key, decision.retryAfterMs);
    const error = new RateLimitError(decision.retryAfterMs);
    return respond(error.statusCode, { error, body: error.message });
  }

  return CONTINUE;
}

function notifyRateLimitRejected(
  listeners: readonly RateLimitRejectedListener[],
  limit: number,
  key: string,
  retryAfterMs: number,
): void {
  notifyListeners(listeners, { key, limit, retryAfterMs });
}

function runTokenBucketDecision(
  compiled: CompiledRateLimit,
  ctx: SecureKitContext,
  now: number,
  onRejected: readonly RateLimitRejectedListener[] = [],
) {
  const key = resolveRateLimitKey(ctx, compiled.keyBy);
  let record;

  if (compiled.memoryStore !== undefined) {
    record = compiled.memoryStore.prepare(key, compiled.windowMs);
    if (record.count === 0 && record.prevCount === 0) {
      record.count = compiled.limit;
    }
    normalizeTokenBucketRecord(record, compiled.limit, compiled.windowMs, now);
  } else {
    const incrementResult = compiled.store.increment(key, compiled.windowMs);
    if (incrementResult instanceof Promise) {
      throw new Error("sync rate limit store expected");
    }
    record = incrementResult;
    normalizeTokenBucketRecord(record, compiled.limit, compiled.windowMs, now);
  }

  const decision = evaluateTokenBucket(record, compiled.limit, compiled.windowMs, now);

  ctx.state.rateLimit = {
    limit: compiled.limit,
    remaining: decision.remaining,
    resetAt: decision.resetAt,
  };

  applyRateLimitHeaders(
    ctx,
    compiled.limit,
    decision.remaining,
    decision.resetAt,
    decision.allowed ? 0 : decision.retryAfterMs,
  );

  if (!decision.allowed) {
    notifyRateLimitRejected(onRejected, compiled.limit, key, decision.retryAfterMs);
    const error = new RateLimitError(decision.retryAfterMs);
    return respond(error.statusCode, { error, body: error.message });
  }

  return CONTINUE;
}

export function compileRateLimitSteps(
  steps: PipelineStep[],
  compiled: CompiledRateLimit | undefined,
  cors: CompiledCors | undefined = undefined,
  onRejected: readonly RateLimitRejectedListener[] = [],
): void {
  if (compiled === undefined) {
    return;
  }

  const wrapWithCors = cors !== undefined;

  if (compiled.isAsync) {
    steps.push(async (ctx) => {
      const now = Date.now();
      const key = resolveRateLimitKey(ctx, compiled.keyBy);
      const record = await compiled.store.increment(key, compiled.windowMs);

      if (compiled.algorithm === "token-bucket") {
        normalizeTokenBucketRecord(record, compiled.limit, compiled.windowMs, now);
        const decision = evaluateTokenBucket(record, compiled.limit, compiled.windowMs, now);
        ctx.state.rateLimit = {
          limit: compiled.limit,
          remaining: decision.remaining,
          resetAt: decision.resetAt,
        };
        applyRateLimitHeaders(
          ctx,
          compiled.limit,
          decision.remaining,
          decision.resetAt,
          decision.allowed ? 0 : decision.retryAfterMs,
        );
        if (!decision.allowed) {
          notifyRateLimitRejected(onRejected, compiled.limit, key, decision.retryAfterMs);
          const error = new RateLimitError(decision.retryAfterMs);
          return finalizeRateLimitResponse(
            ctx,
            respond(error.statusCode, { error, body: error.message }),
            cors,
          );
        }
        return CONTINUE;
      }

      normalizeSlidingWindowRecord(record, now, compiled.windowMs);
      const decision = evaluateSlidingWindowCounter(
        record,
        compiled.limit,
        compiled.windowMs,
        now,
      );
      ctx.state.rateLimit = {
        limit: compiled.limit,
        remaining: decision.remaining,
        resetAt: decision.resetAt,
      };
      applyRateLimitHeaders(
        ctx,
        compiled.limit,
        decision.remaining,
        decision.resetAt,
        decision.allowed ? 0 : decision.retryAfterMs,
      );
      if (!decision.allowed) {
        notifyRateLimitRejected(onRejected, compiled.limit, key, decision.retryAfterMs);
        const error = new RateLimitError(decision.retryAfterMs);
        return finalizeRateLimitResponse(
          ctx,
          respond(error.statusCode, { error, body: error.message }),
          cors,
        );
      }
      return CONTINUE;
    });
    return;
  }

  if (compiled.algorithm === "token-bucket") {
    if (wrapWithCors) {
      steps.push(async (ctx) =>
        finalizeRateLimitResponse(
          ctx,
          runTokenBucketDecision(compiled, ctx, Date.now(), onRejected),
          cors,
        ),
      );
    } else {
      steps.push((ctx) => runTokenBucketDecision(compiled, ctx, Date.now(), onRejected));
    }
    return;
  }

  if (wrapWithCors) {
    steps.push(async (ctx) =>
      finalizeRateLimitResponse(
        ctx,
        runSlidingWindowDecision(compiled, ctx, Date.now(), onRejected),
        cors,
      ),
    );
    return;
  }

  steps.push((ctx) => runSlidingWindowDecision(compiled, ctx, Date.now(), onRejected));
}

export function destroyCompiledRateLimit(compiled: CompiledRateLimit | undefined): void {
  compiled?.memoryStore?.destroy();
}
