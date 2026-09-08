import type { RateLimitRecord, Store } from "securekit/internal";
import { normalizeSlidingWindowRecord } from "securekit/internal";
import type { RedisHashClient, RedisStoreOptions } from "./types.js";

function parseRecord(
  raw: Record<string, string>,
  now: number,
): RateLimitRecord {
  const windowStart = Number(raw.windowStart);
  const count = Number(raw.count);
  const prevCount = Number(raw.prevCount);

  return {
    windowStart: Number.isFinite(windowStart) ? windowStart : now,
    count: Number.isFinite(count) ? count : 0,
    prevCount: Number.isFinite(prevCount) ? prevCount : 0,
  };
}

export class RedisStore implements Store {
  readonly prefix: string;
  private readonly client: RedisHashClient;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(client: RedisHashClient, options: RedisStoreOptions = {}) {
    this.client = client;
    this.prefix = options.prefix ?? "securekit:rl:";
  }

  private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.chain.then(operation, operation);
    this.chain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  increment(key: string, windowMs: number): Promise<RateLimitRecord> {
    return this.runExclusive(async () => {
      const redisKey = `${this.prefix}${key}`;
      const now = Date.now();
      const raw = await this.client.hGetAll(redisKey);
      const record = parseRecord(raw, now);
      normalizeSlidingWindowRecord(record, now, windowMs);
      record.count += 1;

      await this.client.hSet(redisKey, {
        windowStart: String(record.windowStart),
        count: String(record.count),
        prevCount: String(record.prevCount),
      });
      await this.client.pExpire(redisKey, windowMs * 2);

      return {
        count: record.count,
        windowStart: record.windowStart,
        prevCount: record.prevCount,
      };
    });
  }

  reset(key: string): Promise<void> {
    return this.runExclusive(async () => {
      await this.client.del(`${this.prefix}${key}`);
    });
  }

  async destroy(): Promise<void> {
    // Does not close shared Redis clients — callers manage connection lifecycle.
  }
}

export function adaptRedisClient(client: {
  hGetAll(key: string): Promise<Record<string, string>>;
  hSet(key: string, data: Record<string, string>): Promise<unknown>;
  pExpire(key: string, ms: number): Promise<boolean | number>;
  del(keys: string | string[]): Promise<number>;
  quit?(): Promise<void>;
}): RedisHashClient {
  if (typeof client.quit === "function") {
    return {
      hGetAll: (key) => client.hGetAll(key),
      hSet: (key, data) => client.hSet(key, data),
      pExpire: (key, ms) => client.pExpire(key, ms),
      del: (...keys) => client.del(keys),
      quit: () => client.quit!(),
    };
  }

  return {
    hGetAll: (key) => client.hGetAll(key),
    hSet: (key, data) => client.hSet(key, data),
    pExpire: (key, ms) => client.pExpire(key, ms),
    del: (...keys) => client.del(keys),
  };
}
