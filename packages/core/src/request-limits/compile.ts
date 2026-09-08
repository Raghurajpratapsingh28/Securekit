import { RequestLimitError, type RequestLimitType } from "../errors/request-limit-error.js";
import type { RequestLimitRejectedListener } from "../observability/events.js";
import { notifyListeners } from "../observability/events.js";
import type { CompiledSizeLimits, SecureKitConfig } from "../types/config.js";
import type { SecureKitContext } from "../types/context.js";
import type { PipelineStep } from "../types/step.js";
import { parseByteSize } from "../utils/parse-bytes.js";
import { CONTINUE, respond } from "../pipeline/result.js";

export const DEFAULT_MAX_HEADER_BYTES = 8_192;
export const DEFAULT_MAX_HEADER_COUNT = 100;
export const DEFAULT_MAX_URL_LENGTH = 8_192;

const ALLOWED_METHODS = new Set([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "TRACE",
  "CONNECT",
]);

export function compileSizeLimits(
  config: Readonly<SecureKitConfig>,
): CompiledSizeLimits {
  const structural = Object.freeze({
    maxHeaderBytes: DEFAULT_MAX_HEADER_BYTES,
    maxHeaderCount: DEFAULT_MAX_HEADER_COUNT,
    maxUrlLength: DEFAULT_MAX_URL_LENGTH,
    maxBodyBytes: config.bodyLimit === undefined
      ? undefined
      : parseByteSize(config.bodyLimit, "bodyLimit"),
  });

  return structural;
}

function rejectRequestLimit(
  limitType: RequestLimitType,
  limitBytes: number,
  onRejected: readonly RequestLimitRejectedListener[] = [],
  actualBytes?: number,
): ReturnType<typeof respond> {
  notifyListeners(onRejected, { limitType, limitBytes, ...(actualBytes === undefined ? {} : { actualBytes }) });
  const error = new RequestLimitError(limitType, limitBytes);
  return respond(error.statusCode, { error, body: error.message });
}

export function compileRequestLimitSteps(
  steps: PipelineStep[],
  limits: CompiledSizeLimits,
  onRejected: readonly RequestLimitRejectedListener[] = [],
): void {
  steps.push((ctx: SecureKitContext) => {
    const method = ctx.method.toUpperCase();
    if (!ALLOWED_METHODS.has(method)) {
      return respond(405, { body: "Method Not Allowed" });
    }

    if (ctx.url.length > limits.maxUrlLength) {
      return rejectRequestLimit("url", limits.maxUrlLength, onRejected);
    }

    if (ctx.headers.count() > limits.maxHeaderCount) {
      return rejectRequestLimit("header", limits.maxHeaderBytes, onRejected);
    }

    if (ctx.headers.byteLength() > limits.maxHeaderBytes) {
      return rejectRequestLimit("header", limits.maxHeaderBytes, onRejected);
    }

    return CONTINUE;
  });

  if (limits.maxBodyBytes === undefined) {
    return;
  }

  const maxBodyBytes = limits.maxBodyBytes!;

  steps.push((ctx: SecureKitContext) => {
    const contentLengthHeader = ctx.headers.get("content-length");
    if (contentLengthHeader === undefined) {
      return CONTINUE;
    }

    const contentLength = Number(contentLengthHeader);
    if (!Number.isFinite(contentLength) || contentLength < 0) {
      return respond(400, { body: "Invalid Content-Length" });
    }

    if (contentLength > maxBodyBytes) {
      return rejectRequestLimit("body", maxBodyBytes, onRejected, contentLength);
    }

    return CONTINUE;
  });
}

export function compileRequestLimitStreamStep(
  steps: PipelineStep[],
  limits: CompiledSizeLimits,
  onRejected: readonly RequestLimitRejectedListener[] = [],
): void {
  if (limits.maxBodyBytes === undefined) {
    return;
  }

  const maxBodyBytes = limits.maxBodyBytes!;

  steps.push((ctx: SecureKitContext) => {
    if (ctx.body === undefined) {
      return CONTINUE;
    }

    ctx.state.monitoredBody = createLimitedBody(ctx.body, maxBodyBytes, onRejected);
    return CONTINUE;
  });
}

async function* createLimitedBody(
  source: AsyncIterable<Buffer>,
  maxBytes: number,
  onRejected: readonly RequestLimitRejectedListener[] = [],
): AsyncGenerator<Buffer> {
  let total = 0;

  for await (const chunk of source) {
    total += chunk.length;
    if (total > maxBytes) {
      notifyListeners(onRejected, { limitType: "body", limitBytes: maxBytes, actualBytes: total });
      throw new RequestLimitError("body", maxBytes);
    }
    yield chunk;
  }
}

export async function consumeMonitoredBody(
  ctx: SecureKitContext,
): Promise<Buffer> {
  const stream = ctx.state.monitoredBody ?? ctx.body;
  if (stream === undefined) {
    return Buffer.alloc(0);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}
