export interface RedisHashClient {
  hGetAll(key: string): Promise<Record<string, string>>;
  hSet(key: string, data: Record<string, string>): Promise<unknown>;
  pExpire(key: string, ms: number): Promise<boolean | number>;
  del(...keys: string[]): Promise<number>;
  quit?(): Promise<void>;
}

export interface RedisStoreOptions {
  readonly prefix?: string;
}
