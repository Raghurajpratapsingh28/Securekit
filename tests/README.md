# Cross-package tests

Integration, security, and stress tests that exercise multiple workspace packages together.

## Running

From the repository root:

```bash
pnpm build
pnpm test:cross
```

The full test suite (`pnpm test`) runs package unit tests first, then these cross-package tests.

## Suites

| Suite | Path |
| --- | --- |
| API snapshot | `tests/api-snapshot.test.ts` |
| Adapter parity (Express vs Fastify) | `tests/adapters/parity.test.ts` |
| Security fuzz and abuse | `tests/security/fuzz.test.ts` |
| Security boundary attacks | `tests/security/boundary-attack.test.ts` |
| Security regression corpus | `tests/security/regression-corpus.test.ts` |
| Chaos and failure injection | `tests/chaos/chaos.test.ts` |
| Redis failure handling | `tests/security/redis-failures.test.ts` |
| MemoryStore concurrency | `tests/concurrency/memory-store.test.ts` |
| Stateful race conditions | `tests/concurrency/stateful-races.test.ts` |
| Memory exhaustion | `tests/stress/memory-exhaustion.test.ts` |
| Long-running stability | `tests/stress/long-running.test.ts` |
| Store contract | `tests/stress/store-contract.test.ts` |

Package-specific unit tests live under `packages/*/tests/` and run via `pnpm test`.
