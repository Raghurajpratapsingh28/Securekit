import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { securekit } from "../dist/kit.js";
import { normalizeConfig } from "../dist/config/validate.js";

describe("configuration immutability", () => {
  it("does not mutate the caller configuration object", () => {
    const input = {
      headers: true,
      cors: { origins: ["https://example.com"] as readonly string[] },
      rateLimit: { limit: 50, window: 60_000 },
    };
    const snapshot = structuredClone(input);

    securekit(input).destroy();

    assert.deepEqual(input, snapshot);
  });

  it("returns a frozen normalized config from compileConfig", () => {
    const normalized = normalizeConfig({
      headers: true,
      bodyLimit: "1kb",
    });

    assert.equal(Object.isFrozen(normalized), true);
    assert.throws(() => {
      (normalized as { headers?: boolean }).headers = false;
    });
  });

  it("rejects prototype pollution keys without mutating input", () => {
    const polluted = JSON.parse('{"headers": true, "__proto__": {"polluted": true}}') as Record<
      string,
      unknown
    >;

    assert.throws(() => securekit(polluted as never));
    assert.equal(("polluted" in Object.prototype), false);
  });

  it("allows reusing the same config object across multiple kit instances", () => {
    const config = Object.freeze({
      headers: false,
      rateLimit: { limit: 10, window: 60_000 },
    });

    const a = securekit(config);
    const b = securekit(config);
    assert.notEqual(a.config, b.config);
    a.destroy();
    b.destroy();
  });
});
