# ADR-003: API key extraction — header default only

**Status:** Decided  
**PRD §38 Q3**

## Decision

Ship default `X-Api-Key` header extractor only. **No** built-in query-parameter extractor.

## Reason

Query strings leak via logs, referrers, and browser history. Custom `extract` remains available with audit CLI warning.

## Alternatives

Query param extractor — rejected for v1.0.
