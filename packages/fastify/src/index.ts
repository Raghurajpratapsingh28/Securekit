import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import type { CompiledSecureKit } from "@securekit/core";
import {
  createSecureKitContext,
  createReadonlyHeaderMap,
  mergeResponseHeaders,
} from "@securekit/core/internal";
import type { MutableHeaderWriter, SecureKitState, StepResult } from "@securekit/core/internal";

export type SecureKitFastifyRequest = FastifyRequest & {
  securekit?: SecureKitState;
};

export function toFastifyContext(request: FastifyRequest) {
  const headers: Record<string, string | readonly string[] | undefined> = {};
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined) {
      continue;
    }
    headers[name] = Array.isArray(value) ? value : String(value);
  }

  return createSecureKitContext({
    method: request.method,
    url: request.url,
    headers: createReadonlyHeaderMap(headers),
    remoteAddress: request.socket.remoteAddress,
    body: request.raw.readable ? (request.raw as AsyncIterable<Buffer>) : undefined,
  });
}

export function applyFastifyResult(reply: FastifyReply, result: StepResult): void {
  if (result.kind !== "respond") {
    return;
  }

  if (result.headers !== undefined) {
    for (const [name, value] of Object.entries(result.headers)) {
      reply.header(name, value);
    }
  }

  void reply.status(result.status).send(result.body ?? "");
}

function createSecurekitPlugin(kit: CompiledSecureKit): FastifyPluginAsync {
  return async (app) => {
    app.addHook("onRequest", async (request, reply) => {
      const ctx = toFastifyContext(request);
      const result = await kit.handle(ctx);
      const merged = mergeResponseHeaders(ctx, result);

      if (merged.kind === "continue") {
        (request as SecureKitFastifyRequest).securekit = ctx.state;

        const writer = ctx.responseHeaders as MutableHeaderWriter;
        if (typeof writer.entries === "function") {
          for (const [name, values] of writer.entries()) {
            reply.header(name, values.join(", "));
          }
        }

        return;
      }

      applyFastifyResult(reply, merged);
    });
  };
}

export function fastifyPlugin(kit: CompiledSecureKit): FastifyPluginAsync {
  return fp(createSecurekitPlugin(kit), {
    name: "@securekit/fastify",
  });
}

export type { FrameworkAdapterContract } from "@securekit/core/internal";
