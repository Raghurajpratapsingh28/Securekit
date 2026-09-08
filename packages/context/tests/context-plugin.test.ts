import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { securekit } from "../../core/dist/index.js";
import { createSecureKitContextFromHeaders } from "../../core/dist/internal.js";
import { contextPlugin, getRequestContext, getSecureKitState } from "../dist/index.js";

describe("@/context ALS plugin", () => {
  it("exposes SecureKitContext via AsyncLocalStorage when enabled", async () => {
    let capturedId: string | undefined;
    let capturedFromAls = false;

    const plugin = contextPlugin();
    const kit = securekit({
      headers: false,
      requestId: true,
      plugins: [
        plugin,
        {
          name: "reader",
          compile(steps) {
            steps.push(() => {
              capturedId = getSecureKitState()?.requestId;
              capturedFromAls =
                getRequestContext()?.state.requestId === capturedId;
              return { kind: "continue" as const };
            });
          },
        },
      ],
    });

    const ctx = createSecureKitContextFromHeaders({
      method: "GET",
      url: "/",
      headers: {},
    });

    const result = await kit.handle(ctx);
    assert.equal(result.kind, "continue");
    assert.ok(capturedId);
    assert.equal(capturedFromAls, true);
    kit.destroy();
  });

  it("does not affect kits without the plugin registered", async () => {
    const kit = securekit({ headers: false, requestId: true });
    const ctx = createSecureKitContextFromHeaders({
      method: "GET",
      url: "/",
      headers: {},
    });

    await kit.handle(ctx);
    assert.equal(getRequestContext(), undefined);
    kit.destroy();
  });

  it("registers as the first pipeline step", () => {
    const plugin = contextPlugin();
    const kit = securekit({
      headers: false,
      plugins: [plugin],
    });

    assert.ok(kit.config.steps.length >= 1);
    kit.destroy();
  });
});
