import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { securekit } from "../dist/kit.js";
import { ConfigurationError } from "../dist/errors/configuration-error.js";

describe("config security", () => {
  it("rejects __proto__ pollution in configuration", () => {
    const polluted = JSON.parse('{"headers": true, "__proto__": {"x": 1}}');
    assert.throws(() => securekit(polluted as never), ConfigurationError);
  });

  it("rejects constructor key in configuration", () => {
    assert.throws(
      () => securekit({ constructor: {} } as never),
      ConfigurationError,
    );
  });
});
