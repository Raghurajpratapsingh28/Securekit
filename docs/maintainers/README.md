# Maintainer guide

Guidance for engineers maintaining SecureKit. The product specification (`SecureKit-PRD.docx`) is the authoritative source for requirements.

## Design principles

### Compile-time pipeline

User configuration is validated once at `securekit()` and compiled into a flat `PipelineStep[]`. Disabled modules contribute zero steps, avoiding per-request feature branching and keeping the hot path predictable.

Do not add runtime feature toggles or dynamic plugin registries without an architecture decision record.

### Zero runtime dependencies in `securekit`

The core runs on every request. Third-party packages in the hot path increase supply-chain risk and allocation overhead. Framework bindings, Redis, and the CLI live in separate packages.

Enforced by `pnpm verify:deps` and `scripts/verify-import-boundaries.mjs`.

### `securekit/internal`

Adapters and plugins import compiler contracts from `securekit/internal`. This surface is explicitly unstable—breaking changes may ship in minor or patch releases. Semver guarantees apply to the main entry and `securekit/crypto` only.

### Observability

Four opt-in synchronous hooks via `kit.on()`:

| Event | When |
| --- | --- |
| `rate-limit.rejected` | Rate limit returns 429 |
| `cors.rejected` | Origin not allowed |
| `request-limit.rejected` | Structural or body limit exceeded |
| `api-key.rejected` | Authentication failure |

Listeners use plain arrays; notification is a no-op when no handlers are registered. Never log API keys or raw key material in events.

Store failures and plugin compile errors throw at initialization. Runtime plugin step failures propagate to the caller; plugins must not mutate shared pipeline state.

## Package boundaries

| Package | May import | Must not import |
| --- | --- | --- |
| `securekit` | Node.js built-ins | express, fastify, redis, other `@securekit/*` |
| `@securekit/express` | coresecurekit/internal, express (peer) | fastify |
| `@securekit/fastify` | coresecurekit/internal, fastify-plugin | express |
| `@securekit/redis` | coresecurekit/internal | frameworks |
| `@securekit/context` | coresecurekit/internal | frameworks |
| `@securekit/cli` | core (public) | frameworks |

## Store contract

`Store.increment(key, windowMs)` returns `RateLimitRecord` synchronously or as a Promise. `MemoryStore` is synchronous; `RedisStore` is async with serialized mutations per instance.

Redis uses read-modify-write rather than Lua scripts, which introduces a small race window under extreme concurrency. See [store-contract.md](store-contract.md) and the compatibility matrix.

## Plugin contract

Plugins register at compile time via `plugins[].compile(steps, config)`. They append `PipelineStep` functions to the compiled array—never a wrapper that adds per-request dispatch overhead.

Duplicate plugin names are rejected. Compile errors throw `ConfigurationError`.

## Testing

| Layer | Location |
| --- | --- |
| Core unit tests | `packages/core/tests/` |
| Security regression | `tests/security/` |
| Cross-package integration | `tests/**/*.test.ts` |
| Adapter parity | `tests/adapters/parity.test.ts` |
| Stress and long-running | `tests/stress/` |
| Store contract | `tests/stress/store-contract.test.ts` |
| API snapshot | `tests/api-snapshot.test.ts`, `api-snapshots/v1.0.0.json` |

Run `pnpm verify:release` before merging release-related changes.

## Benchmarks

See [benchmark-report.md](../benchmark-report.md) and `benchmarks/run.mjs`. Measurements use a real HTTP server and [autocannon](https://github.com/mcollina/autocannon). CI runs a short smoke benchmark; full 10-second runs are manual release checks.

## Reference documents

| Document | Purpose |
| --- | --- |
| [Architecture review](architecture-review.md) | v1.x extensibility assessment |
| [Adapter contract](adapter-contract.md) | Framework adapter responsibilities |
| [Release process](release-process.md) | Release checklist |
| [Store contract](store-contract.md) | MemoryStore vs RedisStore semantics |

## Release process

1. Update `CHANGELOG.md` and the API snapshot if public exports change.
2. Run `pnpm verify:release`.
3. Tag and publish all `@securekit/*` packages at the same version.

Details: [release-process.md](release-process.md).

## Security assumptions

- Operators set `remoteAddress` from trusted proxy headers when using IP-based rate limits.
- `MemoryStore` is per-process and not shared across instances.
- Constant-time comparison reduces timing leaks but does not eliminate all side channels.
- Sensitive fields in `ConfigurationError` messages are redacted; extend the redaction list when adding new sensitive config fields.

## Performance assumptions

- Hot path: O(steps) sequential array; no allocations when observability listeners are empty.
- Rate limiting: one store operation per request when enabled.
- CORS: Set lookup for static origins; async only for custom matcher callbacks.

## Evolving the public API

- Public API changes require semver compliance, snapshot updates, and a deprecation window ([deprecation-policy.md](../deprecation-policy.md)).
- New observability events require specification alignment and a zero-listener fast path.
- Do not add runtime dependencies to `securekit` for convenience.
