# ADR-004: CLI JSON output in v1.0

**Status:** Decided  
**PRD §38 Q4**

## Decision

Ship `--json` output in v1.0 with stable `check.id` fields. Schema may add fields in minors; IDs are the CI contract.

## Reason

CI gating is a primary CLI use case; JSON avoids fragile stdout parsing.

## Alternatives

Human-only until v1.1 — rejected to unblock CI adoption.
