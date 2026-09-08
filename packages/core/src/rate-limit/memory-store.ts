import type { RateLimitRecord, Store } from "../types/store.js";
import {
  normalizeSlidingWindowRecord,
  evaluateSlidingWindowCounter,
} from "./sliding-window.js";
import {
  evaluateTokenBucket,
  normalizeTokenBucketRecord,
} from "./token-bucket.js";

export interface MemoryStoreOptions {
  readonly maxStoreEntries?: number;
  readonly sweepIntervalMs?: number;
}

interface InternalRecord extends RateLimitRecord {
  lastAccess: number;
}

const DEFAULT_MAX_STORE_ENTRIES = 500_000;
const DEFAULT_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

export class MemoryStore implements Store {
  readonly maxStoreEntries: number;
  private readonly records = new Map<string, InternalRecord>();
  private readonly sweepIntervalMs: number;
  private sweepTimer: NodeJS.Timeout | undefined;
  private sweepTimerStarted = false;

  constructor(options: MemoryStoreOptions = {}) {
    this.maxStoreEntries = options.maxStoreEntries ?? DEFAULT_MAX_STORE_ENTRIES;
    this.sweepIntervalMs = options.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS;
  }

  private ensureSweepTimer(): void {
    if (this.sweepTimerStarted || this.sweepIntervalMs <= 0) {
      return;
    }

    this.sweepTimerStarted = true;
    this.sweepTimer = setInterval(() => {
      this.sweep(Date.now());
    }, this.sweepIntervalMs);
    this.sweepTimer.unref();
  }

  increment(key: string, windowMs: number): RateLimitRecord {
    const record = this.prepare(key, windowMs);
    record.count += 1;
    return record;
  }

  prepare(key: string, windowMs: number): InternalRecord {
    this.ensureSweepTimer();
    const now = Date.now();
    let record = this.records.get(key);

    if (record === undefined) {
      record = {
        count: 0,
        windowStart: now,
        prevCount: 0,
        lastAccess: now,
      };
      this.enforceCapacity(now, windowMs);
      this.records.set(key, record);
      return record;
    }

    record.lastAccess = now;
    this.expireIfStale(record, now, windowMs);
    return record;
  }

  reset(key: string): void {
    this.records.delete(key);
  }

  size(): number {
    return this.records.size;
  }

  destroy(): void {
    if (this.sweepTimer !== undefined) {
      clearInterval(this.sweepTimer);
    }
    this.records.clear();
  }

  evaluateSlidingWindow(
    record: RateLimitRecord,
    limit: number,
    windowMs: number,
    now = Date.now(),
  ) {
    normalizeSlidingWindowRecord(record, now, windowMs);
    return evaluateSlidingWindowCounter(record, limit, windowMs, now);
  }

  evaluateTokenBucket(
    record: RateLimitRecord,
    limit: number,
    windowMs: number,
    now = Date.now(),
  ) {
    normalizeTokenBucketRecord(record, limit, windowMs, now);
    return evaluateTokenBucket(record, limit, windowMs, now);
  }

  private expireIfStale(record: InternalRecord, now: number, windowMs: number): void {
    if (now - record.lastAccess >= windowMs * 2) {
      record.count = 0;
      record.prevCount = 0;
      record.windowStart = now;
    }
  }

  private enforceCapacity(now: number, windowMs: number): void {
    if (this.records.size < this.maxStoreEntries) {
      return;
    }

    let oldestKey: string | undefined;
    let oldestAccess = Number.POSITIVE_INFINITY;

    for (const [key, record] of this.records) {
      if (record.lastAccess < oldestAccess) {
        oldestAccess = record.lastAccess;
        oldestKey = key;
      }
    }

    if (oldestKey !== undefined) {
      this.records.delete(oldestKey);
    }

    void now;
    void windowMs;
  }

  private sweep(now: number): void {
    for (const [key, record] of this.records) {
      if (now - record.lastAccess >= this.sweepIntervalMs * 2) {
        this.records.delete(key);
      }
    }
  }
}

export function isAsyncStore(store: Store): boolean {
  const probe = store.increment("___probe__", 1_000);
  if (probe instanceof Promise) {
    void probe.then(
      () => {
        store.reset("___probe__");
      },
      () => {
        // Ignore probe failures — async shape is determined by Promise return type.
      },
    );
    return true;
  }

  store.reset("___probe__");
  return false;
}
