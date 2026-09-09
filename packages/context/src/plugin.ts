import type { Plugin } from "@backend-master/securekit/internal";
import { enterRequestContext } from "./storage.js";

export function contextPlugin(): Plugin {
  return {
    name: "@securekit/context",
    compile(steps) {
      steps.unshift((ctx) => {
        enterRequestContext(ctx);
        return { kind: "continue" as const };
      });
    },
  };
}
