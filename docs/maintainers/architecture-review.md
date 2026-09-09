# Architecture evolution review (Phase 10)

Review date: 2026-09-08. Status: **v1.x-ready** with documented extension points.

## Summary

The compile-time pipeline architecture from Phases 1—9 remains sound for v1.x evolution. No redesign required. Identified bottlenecks are **documented constraints**, not defects.

## Component assessment

| Component | v1.x extensibility | Bottleneck / risk |
| --- | --- | --- |
| Config compiler | Good — add module compile functions | New modules must hook into `compilePipelineSteps` ordering explicitly |
| Pipeline runner | Good — flat step array | None; avoid adding runtime branching |
| SecureKitContext | Good — stable shape | Adapters must populate `remoteAddress` correctly for IP keys |
| StepResult | Good — continue/respond | Framework mapping stays in adapters |
| Error hierarchy | Good — typed errors | New errors need semver minor |
| Store contract | Good — sync/async probe at compile | Redis vs Memory semantic gap (atomicity) documented |
| Plugin interface | Good — compile-time only | Cannot replace core ordering without code change (intentional) |
| Adapters | Good — thin translation | Each framework needs its own package |
| ALS context | Good — opt-in plugin | Performance cost documented |
| CLI | Good — modular checks | Check IDs are stable CI contract |
| Observability | Good — opt-in hooks | New events need semver + zero-listener fast path |

## Extension safety verified

- Disabled modules — **zero steps** (no runtime feature detection)
- No generic middleware dispatch or plugin registry at request time
- `securekit` — **zero runtime dependencies** (CI enforced)
- Public API frozen via `api-snapshots/v1.0.0.json`
- Internal surface isolated at `@backend-master/securekit/internal`

## Recommended v1.x extension pattern

1. Add compile function under `packages/core/src/<module>/compile.ts`
2. Wire into `compilePipelineSteps` at the PRD-defined order position
3. Add typed error if needed (semver minor)
4. Add observability hook only if PRD specifies event shape
5. Add regression tests + security corpus entry
6. Update API snapshot only if public exports change

## What NOT to do in v1.x

- Runtime plugin registry
- Core imports of express/fastify/redis
- Per-request config inspection
- Mandatory logging/telemetry dependencies in core
