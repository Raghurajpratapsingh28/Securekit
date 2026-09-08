# Changelog

All notable changes to SecureKit are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Phase 11 certification: chaos tests, boundary attacks, memory exhaustion, concurrency races
- Phase 11 gates: `verify:zero-deps`, `verify:artifacts`, `verify:clean-room`, `benchmark:micro`
- Production smoke test (`pnpm smoke:test`)
- Security policy ([SECURITY.md](SECURITY.md)) and contributor guide ([CONTRIBUTING.md](CONTRIBUTING.md))
- Maintainer handoff ([docs/HANDOFF.md](docs/HANDOFF.md))
- Security regression corpus (`tests/security/regression-corpus.test.ts`)
- Import boundary CI guard (`pnpm verify:import-boundaries`)
- Adapter parity tests (Express vs Fastify)
- Maintainer documentation (`docs/maintainers/README.md`)
- PRD ��31 observability hooks: `rate-limit.rejected`, `cors.rejected`, `request-limit.rejected`, `api-key.rejected`

### Fixed

- `isAsyncStore` async probe rejection no longer causes unhandled promise rejection

## [1.0.0] - 2026-09-08

First stable release. Public API is frozen; see `api-snapshots/v1.0.0.json` and `packages/core/tests/public-api.test.ts`.

### Added

- **`securekit`** — compile-time security pipeline with zero runtime npm dependencies
  - Security headers, CORS, rate limiting (sliding-window + MemoryStore), request/body limits, request ID, API key validation, plugin hooks
  - `@securekit/core/crypto` subpath: `safeCompare`, `hash`, `hmac`, `generateToken`, `generateRequestId`
  - `@securekit/core/internal` subpath for adapter/plugin authors (unstable)
- **`@securekit/express`** — Express middleware adapter
- **`@securekit/fastify`** — Fastify plugin adapter
- **`@securekit/redis`** — optional Redis-backed rate-limit store
- **`@securekit/context`** — opt-in AsyncLocalStorage request context plugin
- **`@securekit/cli`** — `securekit audit` static configuration analyzer with JSON output for CI
- Benchmark harness (`pnpm benchmark`) with bare `node:http` baseline
- CI matrix on Node.js 18, 20, and 22
- API snapshot baseline at `api-snapshots/v1.0.0.json`

### Security

- Constant-time API key comparison via `constantTimeKeyCompare` / `safeCompare`
- Prototype-pollution guard on configuration objects
- Sensitive field redaction in `ConfigurationError.received`
- Rate limiting runs before CORS (preflight cannot bypass limits)
- Early API key extraction when rate-limit `keyBy` uses API key material
- Compile-time rejection of token-bucket + async Redis store combination
- Always-on structural request limits (method, URL, header count) independent of `bodyLimit`
- Secret comparison lint gate (`pnpm lint:secrets`)

### Changed

- Pipeline order (final v1.0): structural validation — Content-Length (if `bodyLimit`) — rate limit — CORS — body guard — headers — request ID — API key — plugins

### Known limitations (v1.0)

See [docs/prd-compliance-matrix.md](docs/prd-compliance-matrix.md) for the full PRD traceability matrix. Notable deferred items:

- External third-party security review (PRD ��39.4)
- Trusted proxy / `X-Forwarded-For` handling in adapters (documented; apps must set `remoteAddress`)
- Observability events beyond `api-key.rejected` — **implemented in v1.0** (`kit.on()` for rate-limit, CORS, request-limit)
- Automated benchmark regression gate in CI (smoke only)
- Redis atomic increment uses read-modify-write, not Lua
- Express 5 / Fastify 5 peer ranges declared; CI tests pinned 4.x devDependencies

### Migration from 0.x

Pre-1.0 releases had no stability guarantee. v1.0 locks exports tested in `tests/api-snapshot.test.ts`. Import compiler internals only from `@securekit/core/internal`.

[1.0.0]: https://github.com/securekit/securekit/releases/tag/v1.0.0
