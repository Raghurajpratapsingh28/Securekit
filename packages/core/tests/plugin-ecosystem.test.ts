import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { securekit, ConfigurationError } from "../dist/index.js";
import { createSecureKitContextFromHeaders } from "../dist/context/create-context.js";
import { CONTINUE, respond } from "../dist/pipeline/result.js";
import type { Plugin } from "../dist/types/plugin.js";

describe("plugin ecosystem validation", () => {
  it("validates config at plugin compile time", () => {
    const plugin: Plugin = {
      name: "requires-api-key",
      compile(_steps, config) {
        if (config.apiKey === undefined) {
          throw new ConfigurationError("requires-api-key plugin needs apiKey config", {
            field: "apiKey",
          });
        }
      },
    };

    assert.throws(
      () => securekit({ headers: false, plugins: [plugin] }),
      ConfigurationError,
    );
  });

  it("plugin can add respond step that coexists with core modules", async () => {
    const plugin: Plugin = {
      name: "maintenance-gate",
      compile(steps) {
        steps.push((ctx) => {
          if (ctx.headers.get("x-maintenance") === "1") {
            return respond(503, { body: "Maintenance" });
          }
          return CONTINUE;
        });
      },
    };

    const kit = securekit({
      headers: true,
      plugins: [plugin],
    });

    const blocked = await kit.handle(
      createSecureKitContextFromHeaders({
        method: "GET",
        url: "/",
        headers: { "x-maintenance": "1" },
      }),
    );
    assert.equal(blocked.kind, "respond");
    if (blocked.kind === "respond") assert.equal(blocked.status, 503);

    const ok = await kit.handle(
      createSecureKitContextFromHeaders({ method: "GET", url: "/", headers: {} }),
    );
    assert.equal(ok.kind, "continue");
    kit.destroy();
  });

  it("multiple plugins run in registration order after core steps", async () => {
    const order: string[] = [];
    const mk = (name: string): Plugin => ({
      name,
      compile(steps) {
        steps.push(() => {
          order.push(name);
          return CONTINUE;
        });
      },
    });

    const kit = securekit({
      headers: false,
      apiKey: {
        validate: async () => ({ id: "k1" }),
      },
      plugins: [mk("first"), mk("second")],
    });

    await kit.handle(
      createSecureKitContextFromHeaders({
        method: "GET",
        url: "/",
        headers: { "x-api-key": "test-key" },
      }),
    );

    assert.deepEqual(order, ["first", "second"]);
    kit.destroy();
  });
});
