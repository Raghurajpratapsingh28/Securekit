# Store contract

The `Store` interface abstracts rate-limit counters. Core evaluates sliding-window or token-bucket logic from `RateLimitRecord` returned by `increment`.

## Required methods

| Method | Contract |
| --- | --- |
| `increment(key, windowMs)` | Returns `{ count, windowStart, prevCount? }` sync or Promise |
| `reset(key)` | Clears bucket; sync or Promise |
| `destroy()` | Optional cleanup; MemoryStore clears timers |

## Semantic equivalence

`tests/stress/store-contract.test.ts` and `packages/redis/tests/store-conformance.test.ts` verify:

- Increment until limit → `evaluateSlidingWindowCounter` returns `allowed: false`
- Reset clears bucket for reuse
- Redis failures propagate (no silent fallback)

## Intentional differences

| Aspect | MemoryStore | RedisStore |
| --- | --- | --- |
| Atomicity | Single-process, synchronous | Read-modify-write per key; small race under extreme concurrency |
| Expiration | In-memory sweep + window math | `pExpire` on hash key |
| Cluster scope | Per process | Shared across instances |
| Async | Always sync | Always async (`isAsync: true` at compile) |
| Capacity | `maxStoreEntries` enforced | Redis memory limits (operator responsibility) |

Core **must not** branch on store implementation beyond compile-time `isAsync` probe for pipeline await.

## Failure handling

Store errors during request handling propagate to the adapter. Core does not catch and allow requests through on store failure.
