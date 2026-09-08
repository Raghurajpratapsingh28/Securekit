# Release process (v1.x)

Repeatable checklist for SecureKit maintainers.

## Pre-release

1. Update `CHANGELOG.md` with semver-appropriate entries
2. If public exports changed: update `api-snapshots/v1.0.0.json` (or new major snapshot)
3. Run full gate: `pnpm verify:release`
4. Optional local full benchmark: `pnpm benchmark && pnpm benchmark:compare`
5. Optional compile cost check: `pnpm measure:compile`
6. Production smoke: `pnpm smoke:test`

## verify:release includes

| Step | Command |
| --- | --- |
| Install | `pnpm install --frozen-lockfile` |
| Build | `pnpm build` |
| Typecheck | `pnpm typecheck` |
| Tests | `pnpm test` (153+ tests including cross-package) |
| Core zero deps | `pnpm verify:deps` |
| Import boundaries | `pnpm verify:import-boundaries` |
| Package metadata | `pnpm verify:packages` |
| Secret comparisons | `pnpm lint:secrets` |
| API snapshot | `pnpm verify:api` |
| Consumer install | `pnpm verify:packaging` |
| Examples | `pnpm verify:examples` |
| Benchmark smoke | `pnpm benchmark:smoke` |

## Versioning

- **Patch**: bug fixes, security patches, internal-only changes
- **Minor**: backward-compatible features, new observability events
- **Major**: breaking public API (requires deprecation window per `docs/deprecation-policy.md`)

All published packages share version `x.y.z` for coordinated releases.

## Publish order

1. `securekit`
2. `@securekit/express`, `@securekit/fastify`, `@securekit/redis`, `@securekit/context`
3. `@securekit/cli`

## Post-release

1. Tag git: `vX.Y.Z`
2. Update benchmark baseline if hardware changed: `benchmarks/baseline-v1.x.json`
3. Record benchmark report in `docs/benchmark-report.md`

## Clean checkout verification

```bash
git clone <repo>
cd node_package
pnpm install --frozen-lockfile
pnpm verify:release
```

A new developer must reproduce green results from documented commands alone.
