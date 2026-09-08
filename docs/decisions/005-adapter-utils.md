# ADR-005: No @/adapter-utils package

**Status:** Decided  
**PRD §38 Q5**

## Decision

Do **not** introduce `@/adapter-utils`. Express and Fastify adapters remain independent thin layers.

## Reason

Only two adapters; shared package adds versioning coupling without meaningful deduplication (each adapter ~80 lines).

## Alternatives

Shared utils — deferred unless a third adapter ships.
