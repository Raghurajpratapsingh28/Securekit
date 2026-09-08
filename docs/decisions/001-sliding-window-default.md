# ADR-001: Sliding-window default rate-limit algorithm

**Status:** Decided  
**PRD §38 Q1**

## Decision

Default `rateLimit.algorithm` is `sliding-window`.

## Reason

Smoother burst behavior at window boundaries than token-bucket for typical API abuse patterns. Benchmark harness confirms acceptable overhead vs bare HTTP baseline.

## Alternatives

Token-bucket — available via config; not default.

## Deferred

Re-benchmark at 1M-request tier when CI hardware pool expands.
