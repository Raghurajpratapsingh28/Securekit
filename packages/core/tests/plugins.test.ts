import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { compileConfig } from "../dist/config/compiler.js";
import { ConfigurationError } from "../dist/errors/configuration-error.js";
import { validatePluginList, compilePluginSteps } from "../dist/plugins/validate.js";
import type { Plugin } from "../dist/types/plugin.js";
import { CONTINUE } from "../dist/pipeline/result.js";

describe("plugin architecture", () => {
  it("rejects duplicate plugin names at compile time", () => {
    const plugins: Plugin[] = [
      { name: "dup", compile() {} },
      { name: "dup", compile() {} },
    ];

    assert.throws(
      () => validatePluginList(plugins),
      (error: unknown) => {
        assert.ok(error instanceof ConfigurationError);
        assert.match(String(error), /Duplicate plugin name/);
        return true;
      },
    );
  });

  it("contributes steps only at compile time", () => {
    let pushed = 0;
    const plugin: Plugin = {
      name: "counter",
      compile(steps) {
        steps.push(() => {
          pushed += 1;
          return CONTINUE;
        });
      },
    };

    const compiled = compileConfig({ headers: false, plugins: [plugin] });
    assert.equal(pushed, 0);
    assert.equal(compiled.steps.length, 2);
  });

  it("runs built-in apiKey before user plugins", () => {
    const order: string[] = [];

    const plugin: Plugin = {
      name: "order-spy",
      compile(steps) {
        steps.push(() => {
          order.push("plugin");
          return CONTINUE;
        });
      },
    };

    const compiled = compileConfig({
      headers: false,
      apiKey: {
        validate: async () => ({ id: "k1" }),
      },
      plugins: [plugin],
    });

    assert.equal(compiled.steps.length, 3);
  });

  it("allows disabled plugins to contribute zero steps", () => {
    const plugin: Plugin = {
      name: "conditional",
      compile(steps, config) {
        if (config.apiKey !== undefined) {
          steps.push(() => CONTINUE);
        }
      },
    };

    const without = compileConfig({ headers: false, plugins: [plugin] });
    const withKey = compileConfig({
      headers: false,
      plugins: [plugin],
      apiKey: { validate: async () => ({ id: "k1" }) },
    });

    assert.equal(without.steps.length, 1);
    assert.equal(withKey.steps.length, 3);
  });

  it("compilePluginSteps preserves registration order", () => {
    const steps: import("../dist/types/step.js").PipelineStep[] = [];
    const plugins: Plugin[] = [
      {
        name: "first",
        compile(s) {
          s.push(() => CONTINUE);
        },
      },
      {
        name: "second",
        compile(s) {
          s.push(() => CONTINUE);
        },
      },
    ];

    compilePluginSteps(steps, plugins, {});
    assert.equal(steps.length, 2);
  });
});
