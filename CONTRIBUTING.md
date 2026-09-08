# Contributing to SecureKit

Thank you for helping improve SecureKit. This guide covers the practical workflow for this monorepo.

## Prerequisites

- Node.js — 18 (CI tests 18, 20, 22)
- [pnpm](https://pnpm.io) 9.x (`packageManager` field in root `package.json`)

## Local setup

```bash
git clone <repo-url>
cd node_package
pnpm install
pnpm build
pnpm test
```

## Common commands

| Task | Command |
| --- | --- |
| Build all packages | `pnpm build` |
| Typecheck | `pnpm typecheck` |
| Unit + cross-package tests | `pnpm test` |
| Core zero-deps check | `pnpm verify:deps` |
| Import boundaries | `pnpm verify:import-boundaries` |
| Package metadata | `pnpm verify:packages` |
| API snapshot | `pnpm verify:api` |
| Secret comparison lint | `pnpm lint:secrets` |
| Full release gate | `pnpm verify:release` |
| Production smoke test | `pnpm smoke:test` |
| Benchmark (full) | `pnpm benchmark` |
| Benchmark (CI smoke) | `pnpm benchmark:smoke` |

Cross-package tests live in `tests/` (security, stress, adapters, chaos). Package unit tests live in `packages/*/tests/`.

## Architecture rules (must follow)

1. **`securekit` has zero runtime npm dependencies** — only Node.js built-ins.
2. **Compile-time pipeline** — modules add steps at `securekit()` init, not per-request dispatch.
3. **Framework-agnostic core** — no Express/Fastify/Redis imports in core.
4. **Adapters are thin** — translate framework req/res — `SecureKitContext` only.
5. **Public API stability** — changes to exports require API snapshot update and semver consideration.

Details: [docs/maintainers/README.md](docs/maintainers/README.md)

## Adding a new core module

1. Add compile function under `packages/core/src/<module>/compile.ts`
2. Wire into `compilePipelineSteps` in `config/validate.ts` at the PRD-defined order
3. Add typed error if needed (semver minor)
4. Add unit tests in `packages/core/tests/`
5. Add security regression test if behavior is security-critical
6. Update module doc in `docs/modules/` if public config changes
7. Do **not** add runtime dependencies to core

## Adding a plugin

Plugins implement `Plugin` from `@securekit/core/internal`:

```typescript
{ name: "my-plugin", compile(steps, config) { steps.push((ctx) => CONTINUE); } }
```

Validate config in `compile`, not at request time. See `packages/core/tests/plugin-ecosystem.test.ts`.

## Adding an adapter

1. Create `packages/<framework>/` with peer dependency on the framework
2. Depend on `securekit` and `@securekit/core/internal`
3. Implement context translation + result application only
4. Add tests mirroring `tests/adapters/parity.test.ts` scenarios
5. Document in `docs/modules/<framework>.md`

## Modifying public APIs

1. Check impact against `api-snapshots/v1.0.0.json` and `public-api.test.ts`
2. Follow [docs/deprecation-policy.md](docs/deprecation-policy.md)
3. Update CHANGELOG under `[Unreleased]`
4. Run `pnpm verify:api`

## Preparing a release

See [docs/maintainers/release-process.md](docs/maintainers/release-process.md).

Summary:

1. Update `CHANGELOG.md`
2. Run `pnpm verify:release`
3. Tag `vX.Y.Z` and publish all `@securekit/*` packages at the same version

## Security contributions

See [SECURITY.md](SECURITY.md) for vulnerability reporting. Include regression tests with security fixes when possible.

## Pull request checklist

- [ ] `pnpm build && pnpm test` pass
- [ ] No new runtime dependencies in `securekit`
- [ ] Security-sensitive changes have tests
- [ ] CHANGELOG updated for user-visible changes
- [ ] Documentation updated if public behavior changed
