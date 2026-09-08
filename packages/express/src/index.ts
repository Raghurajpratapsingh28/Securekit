import type { IncomingMessage } from "node:http";
import type { Request, Response } from "express";
import type { CompiledSecureKit } from "@securekit/core";
import {
  createSecureKitContext,
  createReadonlyHeaderMap,
  mergeResponseHeaders,
} from "@securekit/core/internal";
import type { MutableHeaderWriter, SecureKitState, StepResult } from "@securekit/core/internal";

export type SecureKitExpressRequest = Request & {
  securekit?: SecureKitState;
};

export function toExpressContext(req: Request, _res: Response) {
  const headers: Record<string, string | readonly string[] | undefined> = {};
  for (const [name, value] of Object.entries(req.headers)) {
    headers[name] = value;
  }

  return createSecureKitContext({
    method: req.method,
    url: req.originalUrl || req.url,
    headers: createReadonlyHeaderMap(headers),
    remoteAddress: req.socket.remoteAddress,
    body: req.readable ? (req as IncomingMessage as AsyncIterable<Buffer>) : undefined,
  });
}

export function applyExpressResult(res: Response, result: StepResult): void {
  if (result.kind !== "respond") {
    return;
  }

  res.status(result.status);

  if (result.headers !== undefined) {
    for (const [name, value] of Object.entries(result.headers)) {
      res.setHeader(name, value);
    }
  }

  if (result.body !== undefined) {
    res.send(result.body);
    return;
  }

  res.end();
}

export function expressAdapter(kit: CompiledSecureKit) {
  return async (req: Request, res: Response, next: (err?: unknown) => void) => {
    try {
      const ctx = toExpressContext(req, res);
      const result = await kit.handle(ctx);
      const merged = mergeResponseHeaders(ctx, result);

      if (merged.kind === "continue") {
        (req as SecureKitExpressRequest).securekit = ctx.state;

        const writer = ctx.responseHeaders as MutableHeaderWriter;
        if (typeof writer.entries === "function") {
          for (const [name, values] of writer.entries()) {
            res.setHeader(name, values.join(", "));
          }
        }

        return next();
      }

      applyExpressResult(res, merged);
    } catch (error) {
      next(error);
    }
  };
}

export type { FrameworkAdapterContract } from "@securekit/core/internal";
