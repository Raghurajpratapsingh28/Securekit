import { createReadonlyHeaderMap } from "./header-map.js";
import { createHeaderWriter } from "./header-writer.js";
import type {
  SecureKitContext,
  SecureKitContextInit,
  SecureKitState,
} from "../types/context.js";

function createInitialState(): SecureKitState {
  return {
    requestId: undefined,
    rateLimit: undefined,
    apiKey: undefined,
    rateLimitKeyMaterial: undefined,
    monitoredBody: undefined,
  };
}

export function resetSecureKitState(state: SecureKitState): void {
  state.requestId = undefined;
  state.rateLimit = undefined;
  state.apiKey = undefined;
  state.rateLimitKeyMaterial = undefined;
  state.monitoredBody = undefined;
}

export function createSecureKitContext(
  init: SecureKitContextInit,
): SecureKitContext {
  const state = createInitialState();

  return {
    method: init.method,
    url: init.url,
    headers: init.headers,
    remoteAddress: init.remoteAddress,
    body: init.body,
    responseHeaders: createHeaderWriter(),
    state,
  };
}

export function createSecureKitContextFromHeaders(
  init: Omit<SecureKitContextInit, "headers"> & {
    readonly headers: Readonly<
      Record<string, string | readonly string[] | undefined>
    >;
  },
): SecureKitContext {
  return createSecureKitContext({
    method: init.method,
    url: init.url,
    headers: createReadonlyHeaderMap(init.headers),
    remoteAddress: init.remoteAddress,
    body: init.body,
  });
}
