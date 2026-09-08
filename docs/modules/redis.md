# @/redis

## What it does

Async `RedisStore` implementing the core `Store` interface for cluster-wide rate limiting.

## Performance impact

Adds Redis RTT per rate-limited request (async pipeline path). Use when correctness across instances matters more than single-digit microsecond latency.

## Security tradeoffs

Redis must be network-isolated and authenticated in production. Keys are opaque rate-limit counters — no API key material stored.

## Safe defaults

Use the same `limit`/`window` as MemoryStore; swap only the `store`.

## Production recommendations

Recommended above ~100k active clients or any multi-instance deployment.

## Distributed limitations

Redis availability becomes a dependency for rate limiting. Core still fails closed if store throws.
