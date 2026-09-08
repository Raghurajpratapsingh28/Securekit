import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { compileHeaderBlocks } from "../dist/headers/compile.js";
import { ConfigurationError } from "../dist/errors/configuration-error.js";

describe("security headers module", () => {
  it("applies safe defaults when headers: true", () => {
    const blocks = compileHeaderBlocks({ headers: true });

    assert.equal(blocks.get("x-content-type-options"), "nosniff");
    assert.equal(blocks.get("x-frame-options"), "SAMEORIGIN");
    assert.equal(blocks.get("referrer-policy"), "strict-origin-when-cross-origin");
    assert.equal(blocks.has("strict-transport-security"), false);
    assert.equal(blocks.has("content-security-policy"), false);
  });

  it("is disabled when headers: false", () => {
    const blocks = compileHeaderBlocks({ headers: false });
    assert.equal(blocks.size, 0);
  });

  it("requires HSTS acknowledgement", () => {
    assert.throws(
      () =>
        compileHeaderBlocks({
          headers: { hsts: { maxAge: 31_536_000, includeSubDomains: true } },
        }),
      (error: unknown) => {
        assert.ok(error instanceof ConfigurationError);
        assert.match(String(error), /acknowledge: true/);
        return true;
      },
    );
  });

  it("compiles optional CSP and permissions policy", () => {
    const blocks = compileHeaderBlocks({
      headers: {
        csp: "default-src 'self'",
        permissionsPolicy: "geolocation=()",
        hsts: { maxAge: 3600, acknowledge: true },
      },
    });

    assert.equal(blocks.get("content-security-policy"), "default-src 'self'");
    assert.equal(blocks.get("permissions-policy"), "geolocation=()");
    assert.match(blocks.get("strict-transport-security") ?? "", /max-age=3600/);
  });
});
