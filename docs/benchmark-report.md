# Benchmark report

Measured on **2026-09-08** (Phase 10 baseline establishment).

| Environment | Value |
| --- | --- |
| Node.js | v22.22.2 |
| Platform | darwin (macOS) |
| Load tool | autocannon |
| Duration | 10s per scenario (1s warmup) |
| Connections | 50 concurrent |
| Client/server | co-located on same host |

## Results (Phase 10 full run)

| Scenario | req/s | avg (ms) | p50 (ms) | p95 (ms) | p99 (ms) | heap Δ (MB) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| bare-node-http | 51,388 | 0.23 | 0 | 0.95 | 1 | 2.6 |
| structural-only | 47,904 | 0.40 | 0 | 0.95 | 1 | 7.3 |
| headers-only | 41,453 | 1.03 | 1 | 1.9 | 2 | 1.6 |
| cors-only | 44,179 | 1.03 | 1 | 0.95 | 1 | -0.3 |
| body-limit-only | 49,235 | 0.41 | 0 | 0.95 | 1 | -5.7 |
| rate-limit-memory | 24,583 | 1.38 | 1 | 1.9 | 2 | 7.0 |
| full-config | 22,708 | 2.06 | 2 | 2.85 | 3 | 6.2 |
| full-config-api-key | 23,101 | 2.01 | 2 | 1.9 | 2 | -13.3 |
| rate-limit-async-memory | 23,439 | 1.55 | 2 | 2.85 | 3 | 1.2 |

## Overhead vs bare `node:http`

| Metric | full-config | bare-node-http |
| --- | ---: | ---: |
| p50 latency | 2 ms | 0 ms |
| p99 latency | 3 ms | 1 ms |
| Throughput | 22,708 req/s | 51,388 req/s |

Structural-only (always-on guards, no security modules) costs ~7% throughput vs bare HTTP on this host.

## Baseline comparison

Reference baseline: [baseline-v1.x.json](../benchmarks/baseline-v1.x.json) (Phase 10 measured).

Compare latest run: `pnpm benchmark && pnpm benchmark:compare`

Tolerance: 75% throughput floor; p99 fails only when ratio **and** absolute delta (+1 ms) both exceed thresholds (avoids false positives on sub-ms noise).

## Compile-time cost (separate from request path)

Reference: [compile-baseline-v1.x.json](../benchmarks/compile-baseline-v1.x.json)

| Scenario | compile+destroy avg (ms) | steps |
| --- | ---: | ---: |
| minimal | 0.011 | 1 |
| default | 0.001 | 2 |
| full-sync | 0.015 | 8 |
| many-plugins (10) | 0.006 | 11 |
| large-cors-list (500 origins) | 0.110 | 2 |
| async-store | 0.003 | 2 |

Measure: `pnpm measure:compile`

## Methodology (PRD §28)

- Real listening HTTP server per scenario
- Warmup pass before measurement
- Scenarios: bare baseline, structural-only, headers, CORS, body limit, MemoryStore rate limit, async store wrapper, full sync config, API key path

**Not yet measured in CI:** 10k/100k/1M request tiers, heap allocation counts with `--expose-gc`, GC pause instrumentation — deferred to dedicated hardware runs.

Raw JSON: [latest-report.json](../benchmarks/latest-report.json)
