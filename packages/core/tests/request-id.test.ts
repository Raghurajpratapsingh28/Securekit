import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { securekit } from "../dist/kit.js";
import { createSecureKitContextFromHeaders } from "../dist/context/create-context.js";
import { readResponseHeaders } from "../dist/context/read-response-headers.js";
import { generateRequestId, safeCompare } from "../dist/crypto/index.js";

describe("request ID module", () => {
  it("generates a request ID when none is present", async () => {
    const kit = securekit({ headers: false, requestId: true });
    const ctx = createSecureKitContextFromHeaders({
      method: "GET",
      url: "/",
      headers: {},
    });

    const result = await kit.handle(ctx);
    assert.equal(result.kind, "continue");
    assert.ok(ctx.state.requestId);
    assert.equal(readResponseHeaders(ctx.responseHeaders)["x-request-id"], ctx.state.requestId);
  });

  it("reuses inbound request IDs by default", async () => {
    const kit = securekit({ headers: false, requestId: true });
    const ctx = createSecureKitContextFromHeaders({
      method: "GET",
      url: "/",
      headers: { "x-request-id": "incoming-id-123" },
    });

    await kit.handle(ctx);
    assert.equal(ctx.state.requestId, "incoming-id-123");
  });

  it("exports crypto helpers without runtime dependencies", () => {
    const id = generateRequestId();
    assert.match(id, /^[0-9a-f-]{36}$/i);
    assert.equal(safeCompare("abc", "abc"), true);
    assert.equal(safeCompare("abc", "abd"), false);
  });
});
