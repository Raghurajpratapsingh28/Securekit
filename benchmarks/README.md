# Benchmarks

HTTP load benchmarks for SecureKit using [autocannon](https://github.com/mcollina/autocannon).

## Commands

```bash
pnpm benchmark          # Full run (10 seconds per scenario)
pnpm benchmark:smoke    # Short run for CI (2 seconds)
pnpm benchmark:compare  # Compare latest results against baseline
pnpm benchmark:micro    # Hot-path component microbenchmarks
pnpm measure:compile    # Configuration compile-time cost
```

## Scenarios

The full suite measures:

- Bare `node:http` baseline
- Structural-only guards (no security modules)
- Security headers
- CORS
- Body size limits
- In-memory rate limiting
- Full synchronous configuration
- Full configuration with API key authentication
- Async store wrapper over MemoryStore

## Results

Latest measurements and methodology: [docs/benchmark-report.md](../docs/benchmark-report.md)

Reference baselines: `baseline-v1.x.json`, `compile-baseline-v1.x.json`, `microbench-v1.x.json`

Benchmarks run co-located client and server on the same host. Use results for trend comparison on consistent hardware, not as cross-machine SLAs.
