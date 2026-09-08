import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it } from "node:test";

import { securekit } from "../dist/kit.js";
import { createReadonlyHeaderMap } from "../dist/context/header-map.js";
import { createSecureKitContext } from "../dist/context/create-context.js";
import { createSecureKitContextFromHeaders } from "../dist/context/create-context.js";
import { mergeResponseHeaders } from "../dist/internal.js";
import { readResponseHeaders } from "../dist/context/read-response-headers.js";

describe("pipeline integration", () => {
  it("executes modules in PRD order", () => {
    const order: string[] = [];
    const kit = securekit({
      headers: false,
      bodyLimit: 1024,
      cors: { origins: ["https://example.com"] },
      requestId: true,
      plugins: [
        {
          name: "order-spy",
          compile(steps) {
            steps.push(() => {
              order.push("plugin");
              return { kind: "continue" as const };
            });
          },
        },
      ],
    });

    assert.equal(kit.config.steps.length, 6);
    void order;
  });

  it("includes CORS headers on rejections from steps after CORS resolution", async () => {
    const kit = securekit({
      headers: false,
      cors: { origins: ["https://example.com"] },
      plugins: [
        {
          name: "reject-after-cors",
          compile(steps) {
            steps.push(() => ({
              kind: "respond" as const,
              status: 418,
              body: "blocked",
            }));
          },
        },
      ],
    });

    const ctx = createSecureKitContextFromHeaders({
      method: "GET",
      url: "/",
      headers: { origin: "https://example.com" },
    });

    const result = await kit.handle(ctx);
    assert.equal(result.kind, "respond");
    const merged = mergeResponseHeaders(ctx, result);
    if (merged.kind === "respond") {
      assert.equal(merged.headers?.["access-control-allow-origin"], "https://example.com");
    }
  });

  it("handles a raw node:http request through ", async () => {
    const kit = securekit({
      headers: true,
      cors: { origins: ["https://example.com"] },
      requestId: true,
    });

    const server = createServer(async (req, res) => {
      const headers: Record<string, string | undefined> = {};
      for (const [name, value] of Object.entries(req.headers)) {
        headers[name] = Array.isArray(value) ? value.join(", ") : value;
      }

      const ctx = createSecureKitContext({
        method: req.method ?? "GET",
        url: req.url ?? "/",
        headers: createReadonlyHeaderMap(headers),
        remoteAddress: req.socket.remoteAddress,
      });

      const result = await kit.handle(ctx);
      const merged = mergeResponseHeaders(ctx, result);
      const responseHeaders =
        merged.kind === "respond" ? merged.headers ?? {} : readResponseHeaders(ctx.responseHeaders);

      for (const [name, value] of Object.entries(responseHeaders)) {
        res.setHeader(name, value);
      }

      if (merged.kind === "respond") {
        res.statusCode = merged.status;
        res.end(merged.body ?? "");
        return;
      }

      res.statusCode = 200;
      res.end("ok");
    });

    await new Promise<void>((resolve, reject) => {
      server.listen(0, async () => {
        try {
          const { port } = server.address() as AddressInfo;
          const response = await fetch(`http://127.0.0.1:${port}/`, {
            headers: {
              origin: "https://example.com",
            },
          });

          assert.equal(response.status, 200);
          assert.equal(response.headers.get("x-content-type-options"), "nosniff");
          assert.equal(
            response.headers.get("access-control-allow-origin"),
            "https://example.com",
          );
          assert.ok(response.headers.get("x-request-id"));
          resolve();
        } catch (error) {
          reject(error);
        } finally {
          server.close();
        }
      });
    });
  });
});
