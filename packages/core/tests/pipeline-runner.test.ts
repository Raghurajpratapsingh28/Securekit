import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { securekit } from "../dist/kit.js";
import { createRunner } from "../dist/pipeline/runner.js";
import { CONTINUE, respond } from "../dist/pipeline/result.js";
import { createSecureKitContextFromHeaders } from "../dist/context/create-context.js";
import type { PipelineStep } from "../dist/types/step.js";

function makeContext() {
  return createSecureKitContextFromHeaders({
    method: "GET",
    url: "/test",
    headers: {},
  });
}

describe("pipeline runner", () => {
  it("returns CONTINUE for zero steps", async () => {
    const kit = securekit({ headers: false });
    const result = await kit.handle(makeContext());
    assert.deepEqual(result, CONTINUE);
  });

  it("runs a single continue step", async () => {
    let called = false;
    const step: PipelineStep = () => {
      called = true;
      return CONTINUE;
    };

    const handle = createRunner([step]);
    const result = await handle(makeContext());

    assert.equal(called, true);
    assert.deepEqual(result, CONTINUE);
  });

  it("runs multiple steps in order", async () => {
    const order: number[] = [];
    const steps: PipelineStep[] = [
      () => {
        order.push(1);
        return CONTINUE;
      },
      () => {
        order.push(2);
        return CONTINUE;
      },
      () => {
        order.push(3);
        return CONTINUE;
      },
    ];

    const handle = createRunner(steps);
    await handle(makeContext());

    assert.deepEqual(order, [1, 2, 3]);
  });

  it("short-circuits on respond and skips later steps", async () => {
    const order: number[] = [];
    const steps: PipelineStep[] = [
      () => {
        order.push(1);
        return CONTINUE;
      },
      () => {
        order.push(2);
        return respond(403, { body: "denied" });
      },
      () => {
        order.push(3);
        return CONTINUE;
      },
    ];

    const handle = createRunner(steps);
    const result = await handle(makeContext());

    assert.deepEqual(order, [1, 2]);
    assert.equal(result.kind, "respond");
    if (result.kind === "respond") {
      assert.equal(result.status, 403);
      assert.equal(result.body, "denied");
    }
  });

  it("awaits async steps", async () => {
    const steps: PipelineStep[] = [
      async () => {
        await Promise.resolve();
        return CONTINUE;
      },
    ];

    const handle = createRunner(steps);
    const result = await handle(makeContext());
    assert.deepEqual(result, CONTINUE);
  });

  it("supports mixed sync and async steps", async () => {
    const order: number[] = [];
    const steps: PipelineStep[] = [
      () => {
        order.push(1);
        return CONTINUE;
      },
      async () => {
        await Promise.resolve();
        order.push(2);
        return respond(400);
      },
    ];

    const handle = createRunner(steps);
    const result = await handle(makeContext());

    assert.deepEqual(order, [1, 2]);
    assert.equal(result.kind, "respond");
  });

  it("does not inspect configuration at request time", async () => {
    const kit = securekit({ headers: false, cors: { origins: ["https://example.com"] } });
    const configDescriptor = Object.getOwnPropertyDescriptor(kit, "config");

    assert.equal(configDescriptor?.writable, false);
    assert.equal(kit.config.steps.length, 2);

    const result = await kit.handle(makeContext());
    assert.deepEqual(result, CONTINUE);
  });
});
