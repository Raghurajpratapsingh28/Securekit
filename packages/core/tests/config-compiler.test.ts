import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { compileConfig, destroyCompiledConfig } from "../dist/config/compiler.js";
import { ConfigurationError } from "../dist/errors/configuration-error.js";
import type { Plugin } from "../dist/types/plugin.js";
import type { PipelineStep } from "../dist/types/step.js";
import { CONTINUE } from "../dist/pipeline/result.js";

describe("config compiler", () => {
  it("defaults to security headers when config is undefined", () => {
    const compiled = compileConfig(undefined);

    assert.ok(compiled.steps.length >= 1);
    assert.ok(compiled.headerBlocks.size >= 3);
    assert.equal(Object.isFrozen(compiled), true);
    assert.equal(Object.isFrozen(compiled.steps), true);
    assert.equal(Object.isFrozen(compiled.raw), true);
  });

  it("rejects non-object configuration", () => {
    assert.throws(
      () => compileConfig("invalid" as unknown as undefined),
      (error: unknown) => {
        assert.ok(error instanceof ConfigurationError);
        assert.match(String(error), /plain object/i);
        return true;
      },
    );
  });

  it("rejects unknown top-level keys with actionable message", () => {
    assert.throws(
      () => compileConfig({ corss: { origins: ["*"] } } as never),
      (error: unknown) => {
        assert.ok(error instanceof ConfigurationError);
        const configError = error as ConfigurationError;
        assert.equal(configError.field, "corss");
        assert.match(String(error), /Unknown configuration key "corss"/);
        assert.match(String(error), /Suggestion:/);
        return true;
      },
    );
  });

  it("compiles api key authentication after built-in modules", () => {
    const compiled = compileConfig({
      headers: false,
      apiKey: {
        validate: async () => ({ id: "key-1" }),
      },
    });

    assert.equal(compiled.steps.length, 2);
    destroyCompiledConfig(compiled);
  });

  it("compiles rate limiting into the pipeline", () => {
    const compiled = compileConfig({
      headers: false,
      rateLimit: { limit: 10, window: 60_000 },
    });

    assert.equal(compiled.steps.length, 2);
    assert.equal(compiled.rateLimit?.limit, 10);
    assert.equal(compiled.rateLimit?.windowMs, 60_000);
    destroyCompiledConfig(compiled);
  });

  it("compiles enabled modules into steps", () => {
    const compiled = compileConfig({
      headers: true,
      cors: { origins: ["https://example.com"] },
      bodyLimit: "1mb",
      requestId: true,
      rateLimit: { limit: 100, window: 60_000 },
    });

    assert.ok(compiled.steps.length >= 7);
    assert.ok(compiled.headerBlocks.size > 0);
    assert.ok(compiled.corsOriginSet?.has("https://example.com"));
    assert.equal(compiled.sizeLimits?.maxBodyBytes, 1_048_576);
    destroyCompiledConfig(compiled);
  });

  it("headers: false produces zero header steps and blocks", () => {
    const compiled = compileConfig({ headers: false });
    assert.equal(compiled.headerBlocks.size, 0);
  });

  it("invokes plugins after built-in modules", () => {
    let compileCalls = 0;
    let stepIndex = -1;

    const plugin: Plugin = {
      name: "test-plugin",
      compile(steps) {
        compileCalls += 1;
        stepIndex = steps.length;
        steps.push(() => CONTINUE);
      },
    };

    const compiled = compileConfig({ plugins: [plugin], headers: false });

    assert.equal(compileCalls, 1);
    assert.ok(stepIndex >= 0);
    assert.equal(compiled.steps.length, stepIndex + 1);
  });

  it("validates plugin shape", () => {
    assert.throws(
      () => compileConfig({ plugins: [{ name: "bad" }] } as never),
      /compile must be a function/,
    );
  });

  it("disabled plugins contribute zero steps", () => {
    const plugin: Plugin = {
      name: "conditional",
      compile(steps, config) {
        if ((config as { jwt?: unknown }).jwt) {
          steps.push((() => CONTINUE) as PipelineStep);
        }
      },
    };

    const compiled = compileConfig({ plugins: [plugin], headers: false });
    assert.equal(compiled.steps.length, 1);
  });
});
