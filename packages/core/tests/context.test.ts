import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  createSecureKitContext,
  createSecureKitContextFromHeaders,
  resetSecureKitState,
} from "../dist/context/create-context.js";
import { createReadonlyHeaderMap } from "../dist/context/header-map.js";
import { createHeaderWriter } from "../dist/context/header-writer.js";
import type { MutableHeaderWriter } from "../dist/context/header-writer.js";

describe("SecureKitContext", () => {
  it("creates context with stable expected properties", () => {
    const ctx = createSecureKitContextFromHeaders({
      method: "POST",
      url: "/api/items",
      headers: { "X-Test": "1" },
      remoteAddress: "127.0.0.1",
    });

    assert.equal(ctx.method, "POST");
    assert.equal(ctx.url, "/api/items");
    assert.equal(ctx.remoteAddress, "127.0.0.1");
    assert.equal(ctx.body, undefined);
    assert.equal(ctx.headers.get("x-test"), "1");
    assert.equal(ctx.state.requestId, undefined);
    assert.equal(ctx.state.rateLimit, undefined);
    assert.equal(ctx.state.apiKey, undefined);
    assert.equal(typeof ctx.responseHeaders.set, "function");
  });

  it("supports explicit ReadonlyHeaderMap injection", () => {
    const headers = createReadonlyHeaderMap({
      Authorization: "Bearer token",
    });

    const ctx = createSecureKitContext({
      method: "GET",
      url: "/",
      headers,
    });

    assert.equal(ctx.headers.get("authorization"), "Bearer token");
    assert.equal(ctx.headers.has("Authorization"), true);
  });

  it("resets state without deleting properties", () => {
    const ctx = createSecureKitContextFromHeaders({
      method: "GET",
      url: "/",
      headers: {},
    });

    ctx.state.requestId = "abc";
    ctx.state.apiKey = { tier: "pro" };
    ctx.state.monitoredBody = (async function* () {
      yield Buffer.from("x");
    })();

    resetSecureKitState(ctx.state);

    assert.equal(ctx.state.requestId, undefined);
    assert.equal(ctx.state.apiKey, undefined);
    assert.equal(ctx.state.monitoredBody, undefined);
    assert.equal("requestId" in ctx.state, true);
    assert.equal("rateLimit" in ctx.state, true);
    assert.equal("apiKey" in ctx.state, true);
    assert.equal("monitoredBody" in ctx.state, true);
  });

  it("HeaderWriter set and append are case-insensitive for storage", () => {
    const writer = createHeaderWriter() as MutableHeaderWriter;
    writer.set("X-Frame-Options", "DENY");
    writer.append("Set-Cookie", "a=1");
    writer.append("set-cookie", "b=2");

    const entries = writer.entries();
    assert.equal(entries.get("x-frame-options")?.[0], "DENY");
    assert.deepEqual(entries.get("set-cookie"), ["a=1", "b=2"]);
  });

  it("does not use delete on hot-path source files", () => {
    const srcRoot = new URL("../src", import.meta.url).pathname;
    const files = collectSourceFiles(srcRoot);

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(
        source,
        /\bdelete\s+/,
        `Unexpected delete operator in ${file}`,
      );
    }
  });
});

function collectSourceFiles(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }
    if (entry.name.endsWith(".ts")) {
      files.push(fullPath);
    }
  }

  return files;
}
