# @securekit/redis

Redis-backed rate-limit store for [SecureKit](https://github.com/securekit/securekit).

Provides a shared `Store` implementation for horizontally scaled deployments. Redis client dependencies remain outside `securekit`.

## Installation

```bash
pnpm add securekit @securekit/redis redis
```

## Usage

```typescript
import { createClient } from "redis";
import { securekit } from "securekit";
import { RedisStore, adaptRedisClient } from "@securekit/redis";

const client = createClient({ url: process.env.REDIS_URL });
await client.connect();

const kit = securekit({
  rateLimit: {
    limit: 100,
    window: 60_000,
    store: new RedisStore(adaptRedisClient(client)),
  },
});
```

`RedisStore.destroy()` does not call `quit()` on the client—you manage the Redis connection lifecycle.

## Peer dependency

- `redis` ^4.7.0 or ^5.0.0

## Documentation

- [Module reference](../../docs/modules/redis.md)
- [Load balancer guide](../../docs/load-balancer.md)
- [Store contract](../../docs/maintainers/store-contract.md)
