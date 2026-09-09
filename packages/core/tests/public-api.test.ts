import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as publicApi from "../dist/index.js";
import * as internalApi from "../dist/internal.js";
import * as cryptoApi from "../dist/crypto/index.js";

const EXPECTED_PUBLIC_EXPORTS = [
  "AuthenticationError",
  "ConfigurationError",
  "CorsError",
  "RateLimitError",
  "RequestLimitError",
  "SecureKitError",
  "securekit",
] as const;

const EXPECTED_CRYPTO_EXPORTS = [
  "generateRequestId",
  "generateToken",
  "hash",
  "hmac",
  "safeCompare",
] as const;

const EXPECTED_INTERNAL_EXPORTS = [
  "AuthenticationError",
  "ConfigurationError",
  "CONTINUE",
  "CorsError",
  "MemoryStore",
  "RateLimitError",
  "RequestLimitError",
  "SecureKitError",
  "compileApiKey",
  "compileApiKeyExtractStep",
  "compileApiKeySteps",
  "compileCompiledArtifacts",
  "compileConfig",
  "compileCors",
  "compileHeaderBlocks",
  "compileHeadersSteps",
  "compilePipelineSteps",
  "compilePluginSteps",
  "compileRateLimit",
  "compileRateLimitSteps",
  "compileRequestId",
  "compileRequestIdSteps",
  "compileRequestLimitStreamStep",
  "compileRequestLimitSteps",
  "compileSizeLimits",
  "constantTimeKeyCompare",
  "consumeMonitoredBody",
  "createHeaderWriter",
  "createReadonlyHeaderMap",
  "createRunner",
  "createSecureKitContext",
  "createSecureKitContextFromHeaders",
  "destroyCompiledConfig",
  "destroyCompiledRateLimit",
  "digestApiKey",
  "evaluateSlidingWindowCounter",
  "generateRequestId",
  "generateToken",
  "hash",
  "hmac",
  "isAsyncStore",
  "isContinueResult",
  "isHeadersEnabled",
  "mergeResponseHeaders",
  "normalizeConfig",
  "normalizeSlidingWindowRecord",
  "readResponseHeaders",
  "resetSecureKitState",
  "respond",
  "safeCompare",
  "validatePluginList",
] as const;

describe("public API surface", () => {
  it("exports only documented public runtime values", () => {
    const runtimeExports = Object.keys(publicApi).sort();
    assert.deepEqual(runtimeExports, [...EXPECTED_PUBLIC_EXPORTS].sort());
  });

  it("exports crypto helpers only from @backend-master/securekit/crypto", () => {
    const runtimeExports = Object.keys(cryptoApi).sort();
    assert.deepEqual(runtimeExports, [...EXPECTED_CRYPTO_EXPORTS].sort());
    assert.equal("constantTimeKeyCompare" in cryptoApi, false);
    assert.equal("MemoryStore" in cryptoApi, false);
  });

  it("exports internal adapter/plugin contracts separately", () => {
    const runtimeExports = Object.keys(internalApi).sort();
    const typeOnlyExports = new Set(["CompiledApiKey", "ApiKeyRejectedListener"]);
    const values = runtimeExports.filter((name) => !typeOnlyExports.has(name));
    assert.deepEqual(values, [...EXPECTED_INTERNAL_EXPORTS].sort());
  });

  it("does not expose compiler internals on the public entry", () => {
    assert.equal("compileConfig" in publicApi, false);
    assert.equal("createRunner" in publicApi, false);
    assert.equal("MemoryStore" in publicApi, false);
    assert.equal("constantTimeKeyCompare" in publicApi, false);
    assert.equal("Plugin" in publicApi, false);
  });
});
