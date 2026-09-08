import { ConfigurationError } from "../errors/configuration-error.js";
import { generateRequestId } from "../crypto/generate-request-id.js";
import type { RequestIdConfig, SecureKitConfig } from "../types/config.js";
import type { SecureKitContext } from "../types/context.js";
import type { PipelineStep } from "../types/step.js";
import { CONTINUE } from "../pipeline/result.js";

const DEFAULT_REQUEST_ID_HEADER = "x-request-id";

function resolveRequestIdConfig(
  requestId: boolean | RequestIdConfig | undefined,
): RequestIdConfig | undefined {
  if (requestId === false || requestId === undefined) {
    return undefined;
  }

  if (requestId === true) {
    return {};
  }

  if (typeof requestId !== "object" || requestId === null) {
    throw new ConfigurationError("requestId must be a boolean or configuration object", {
      field: "requestId",
      received: requestId,
    });
  }

  return requestId;
}

export interface CompiledRequestId {
  readonly headerName: string;
  readonly trustIncoming: boolean;
}

export function compileRequestId(
  config: Readonly<SecureKitConfig>,
): CompiledRequestId | undefined {
  const resolved = resolveRequestIdConfig(config.requestId);
  if (resolved === undefined) {
    return undefined;
  }

  const headerName = (resolved.header ?? DEFAULT_REQUEST_ID_HEADER).toLowerCase();

  return Object.freeze({
    headerName,
    trustIncoming: resolved.trustIncoming !== false,
  });
}

export function compileRequestIdSteps(
  steps: PipelineStep[],
  compiled: CompiledRequestId | undefined,
): void {
  if (compiled === undefined) {
    return;
  }

  steps.push((ctx: SecureKitContext) => {
    let requestId: string | undefined;

    if (compiled.trustIncoming) {
      requestId = ctx.headers.get(compiled.headerName);
    }

    if (requestId === undefined || requestId.length === 0) {
      requestId = generateRequestId();
    }

    ctx.state.requestId = requestId;
    ctx.responseHeaders.set(compiled.headerName, requestId);

    return CONTINUE;
  });
}
