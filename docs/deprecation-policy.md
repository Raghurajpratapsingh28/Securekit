# Deprecation policy

SecureKit v1.0 onward follows **semver-strict** releases (PRD ��7, ��39.4).

## Public API (`securekit`, adapters, optional packages)

- **Major** (x.0.0): breaking changes to documented public exports
- **Minor** (1.x.0): backward-compatible features
- **Patch** (1.0.x): bug fixes and security patches only

### Deprecation window

Before removing or breaking a documented public API:

1. Mark the API **deprecated** in release notes and JSDoc for at least **one minor version**
2. Emit a runtime `process.emitWarning` where practical (dev-only paths)
3. Remove only in the next **major** release

## Internal API (`securekit/internal`)

The `securekit/internal` subpath is **explicitly unstable** (PRD ��13). It is for adapter and plugin authors only. Breaking changes may ship in minor or patch releases without a deprecation window.

## Crypto subpath (`securekit/crypto`)

Tree-shakeable helpers (`safeCompare`, `hash`, `hmac`, `generateToken`, `generateRequestId`) follow the same semver rules as the main public entry.

## CLI (`@securekit/cli`)

The audit CLI is a dev-time tool. JSON report shape may evolve in minor releases; check IDs (`check.id`) are the stable CI contract.

## Pre-1.0 history

Versions `0.x` were development releases without stability guarantees. v1.0 locks the public surface documented in `packages/core/tests/public-api.test.ts`.
