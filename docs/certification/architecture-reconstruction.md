# Phase 11 — Architecture reconstruction

Verified: 2026-09-08

## Actual runtime path

```
Framework Request (Express/Fastify/raw HTTP)
  → Adapter.to*Context()
  → SecureKitContext { method, url, headers, remoteAddress, body?, responseHeaders, state }
  → kit.handle(ctx)  [CompiledSecureKit]
  → createRunner(steps) — sequential for-loop, first non-continue wins
  → PipelineStep[] (compile-time flat array)
  → StepResult { continue | respond }
  → mergeResponseHeaders(ctx, result)
  → Adapter.apply*Result() or next() + merged headers
```

## Compiled pipeline order (implementation)

| # | Step source | PRD alignment |
| --- | --- | --- |
| 1 | Structural limits (method, URL, headers) | Matches PRD step 1 |
| 2 | Content-Length pre-check (if bodyLimit) | Matches PRD step 2 |
| 3 | API key extract (only if rate limit keys by presented key) | Extension for key-aware limiting |
| 4 | Rate limiting | PRD step 4 (CORS headers merged on 429 — see below) |
| 5 | CORS | PRD step 3 reordered; 429 CORS fix via `applyCorsHeadersIfOriginAllowed` |
| 6 | Streaming body guard | PRD step 5 |
| 7 | Security headers | PRD step 6 |
| 8 | Request ID | PRD step 7 |
| 9 | API key validation | PRD step 8 |
| 10 | Plugins (compile-time only) | PRD extension model |

**Intentional deviation:** CORS runs after rate limit in the step array, but rate-limit rejections apply precomputed CORS headers so browsers receive readable 429 responses. Verified in `architecture-reconstruction.test.ts`.

## Drift audit results

| Check | Result |
| --- | --- |
| Framework imports in core | None — `architecture.test.ts`, `verify-import-boundaries.mjs` |
| Runtime plugin dispatch | None — plugins push steps at compile time only |
| Circular dependencies | None detected across packages |
| Duplicated security logic in adapters | None — adapters translate only |
| Public/internal leakage | Controlled via export map + API snapshot |
| Hidden dynamic import of deps | None in core dist — `verify-zero-deps.mjs` |

## No redesign required

Architecture matches Phases 1–10 design intent. Documented deviations are tested and intentional.
