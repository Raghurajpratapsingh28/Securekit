# ADR-002: Fixed maxStoreEntries default

**Status:** Decided  
**PRD §38 Q2**

## Decision

`MemoryStore` default `maxStoreEntries` remains **500,000** (fixed), not scaled from `os.totalmem()`.

## Reason

Predictable memory bounds across environments; avoids silent behavior differences between dev laptops and production VMs.

## Alternatives

Dynamic scaling from total memory — rejected for unpredictability in containers with misreported limits.

## Override

Set `rateLimit.maxStoreEntries` or pass `MemoryStore` with custom options.
