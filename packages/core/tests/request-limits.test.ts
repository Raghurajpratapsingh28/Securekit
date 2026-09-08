import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { securekit } from "../dist/kit.js";
import { createSecureKitContextFromHeaders } from "../dist/context/create-context.js";
import { consumeMonitoredBody } from "../dist/request-limits/compile.js";
import { RequestLimitError } from "../dist/errors/request-limit-error.js";
import { parseByteSize } from "../dist/utils/parse-bytes.js";
import { ConfigurationError } from "../dist/errors/configuration-error.js";

describe("request-size limiting module", () => {
  it("parses bodyLimit strings at compile time", () => {
    assert.equal(parseByteSize("1mb"), 1_048_576);
    assert.equal(parseByteSize(512), 512);
  });

  it("rejects invalid bodyLimit strings", () => {
    assert.throws(() => parseByteSize("not-a-size"), ConfigurationError);
  });

  it("rejects oversized Content-Length before body read", async () => {
    const kit = securekit({ headers: false, bodyLimit: "1kb" });
    const ctx = createSecureKitContextFromHeaders({
      method: "POST",
      url: "/upload",
      headers: { "content-length": "5000" },
    });

    const result = await kit.handle(ctx);
    assert.equal(result.kind, "respond");
    if (result.kind === "respond") {
      assert.equal(result.status, 413);
      assert.ok(result.error instanceof RequestLimitError);
      assert.equal(result.error.limitType, "body");
    }
  });

  it("rejects URLs exceeding max length", async () => {
    const kit = securekit({ headers: false, bodyLimit: 1024 });
    const ctx = createSecureKitContextFromHeaders({
      method: "GET",
      url: `/${"a".repeat(9000)}`,
      headers: {},
    });

    const result = await kit.handle(ctx);
    assert.equal(result.kind, "respond");
    if (result.kind === "respond") {
      assert.ok(result.error instanceof RequestLimitError);
      assert.equal(result.error.limitType, "url");
    }
  });

  it("enforces streaming body limits via monitoredBody", async () => {
    const kit = securekit({ headers: false, bodyLimit: 10 });

    async function* makeBody(): AsyncGenerator<Buffer> {
      yield Buffer.from("12345");
      yield Buffer.from("6789012345");
    }

    const ctx = createSecureKitContextFromHeaders({
      method: "POST",
      url: "/upload",
      headers: {},
      body: makeBody(),
    });

    const pipelineResult = await kit.handle(ctx);
    assert.equal(pipelineResult.kind, "continue");

    await assert.rejects(() => consumeMonitoredBody(ctx), RequestLimitError);
  });

  it("always applies structural limits; body limits require bodyLimit", async () => {
    const kit = securekit({ headers: false });
    assert.ok(kit.config.sizeLimits.maxUrlLength > 0);
    assert.equal(kit.config.sizeLimits.maxBodyBytes, undefined);
    assert.ok(kit.config.steps.length >= 1);

    const ctx = createSecureKitContextFromHeaders({
      method: "GET",
      url: `/${"a".repeat(9000)}`,
      headers: {},
    });
    const result = await kit.handle(ctx);
    assert.equal(result.kind, "respond");
    kit.destroy();
  });
});
