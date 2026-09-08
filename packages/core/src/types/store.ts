export interface RateLimitRecord {
  count: number;
  windowStart: number;
  prevCount: number;
}

export interface Store {
  increment(
    key: string,
    windowMs: number,
  ): RateLimitRecord | Promise<RateLimitRecord>;
  reset(key: string): void | Promise<void>;
  destroy?(): void | Promise<void>;
}
