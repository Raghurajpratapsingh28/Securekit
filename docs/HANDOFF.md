# SecureKit maintainer handoff

Last updated: Phase 12 (2026-09-08). Baseline: Phase 11 certification **CERTIFIED WITH KNOWN LIMITATIONS**.

## Current state

SecureKit **v1.0** is implemented and stable:

| Package | Status |
| --- | --- |
| `securekit` | Production-ready — compiler, pipeline, security modules |
| `@securekit/express` | Production-ready |
| `@securekit/fastify` | Production-ready |
| `@securekit/redis` | Production-ready (optional store) |
| `@securekit/context` | Production-ready (opt-in ALS) |
| `@securekit/cli` | Production-ready (`securekit audit`) |

Public API frozen at `api-snapshots/v1.0.0.json`. ~220 automated tests + release gate.

## Architecture (essential)

```
Framework — Adapter — SecureKitContext — Compiled Pipeline[] — StepResult — Adapter
```

- Configuration compiles once at `securekit()` into a flat `PipelineStep[]`
- Disabled modules contribute **zero steps**
- Core never imports Express, Fastify, or Redis

Package boundaries: [maintainers/README.md](maintainers/README.md)

## Important guarantees

| Guarantee | Enforcement |
| --- | --- |
| Zero runtime deps in core | `pnpm verify:deps`, `verify-zero-deps.mjs` |
| Compile-time pipeline | No runtime feature detection |
| Framework-agnostic security | Adapters translate only |
| MemoryStore cardinality bound | `maxStoreEntries` (default 500k) |
| Constant-time API key compare | `constantTimeKeyCompare`, `lint:secrets` |
| Config prototype pollution guard | `config/validate.ts` |
| Public API semver | Snapshot + export tests |

## Known limitations

Real, currently relevant — not release blockers:

1. **Trusted proxy** — adapters use `socket.remoteAddress`; operators behind LB must set trusted `remoteAddress` ([load-balancer.md](load-balancer.md))
2. **MemoryStore** — per-process; cluster deployments need `@securekit/redis`
3. **RedisStore** — read-modify-write, not Lua; small race under extreme concurrency
4. **Express/Fastify 5** — peer range declared; CI tests 4.x
5. **External security audit** — not performed (PRD ��39.4 deferred)
6. **Benchmark CI** — smoke only; full compare is manual release gate

Full traceability: [prd-compliance-matrix.md](prd-compliance-matrix.md)

## Technical debt (actionable)

| Item | Priority |
| --- | --- |
| Trusted proxy opt-in in adapters | High |
| Redis Lua atomic increment | Medium |
| Dedicated-hardware benchmark CI | Medium |
| Express/Fastify 5 CI matrix | Low |
| CSP `unsafe-inline` CLI check | Low |

## Recommended next steps

1. Ship v1.0.x patch releases using `pnpm verify:release`
2. Add trusted-proxy helper when operator demand is clear
3. Schedule external security review before enterprise attestation claims
4. Run `STRESS_LONG=1` before major releases on dedicated hardware

## Key commands

```bash
pnpm verify:release    # full gate before release
pnpm smoke:test        # production HTTP smoke
pnpm verify:certification  # zero-deps + artifacts + clean-room
```

## Documentation map

| Audience | Start here |
| --- | --- |
| New users | [../README.md](../README.md) — [configuration.md](configuration.md) |
| Operators | [load-balancer.md](load-balancer.md), [compatibility.md](compatibility.md) |
| Contributors | [../CONTRIBUTING.md](../CONTRIBUTING.md) |
| Security | [../SECURITY.md](../SECURITY.md) |
| Maintainers | [maintainers/README.md](maintainers/README.md) |
| Certification | [certification/phase-11-report.md](certification/phase-11-report.md) |
