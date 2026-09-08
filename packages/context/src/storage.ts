import { AsyncLocalStorage } from "node:async_hooks";
import type { SecureKitContext, SecureKitState } from "@securekit/core/internal";

const requestContext = new AsyncLocalStorage<SecureKitContext>();

export function getRequestContext(): SecureKitContext | undefined {
  return requestContext.getStore();
}

export function getSecureKitState(): SecureKitState | undefined {
  return requestContext.getStore()?.state;
}

export function enterRequestContext(ctx: SecureKitContext): void {
  requestContext.enterWith(ctx);
}

export { requestContext };
