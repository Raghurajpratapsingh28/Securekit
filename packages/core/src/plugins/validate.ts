import { ConfigurationError } from "../errors/configuration-error.js";
import type { Plugin } from "../types/plugin.js";

/** Validates plugin list shape, uniqueness, and compile-time invariants. */
export function validatePluginList(plugins: readonly Plugin[]): readonly Plugin[] {
  const seen = new Set<string>();

  for (let i = 0; i < plugins.length; i++) {
    const plugin = plugins[i];
    if (plugin === undefined) {
      continue;
    }
    if (seen.has(plugin.name)) {
      throw new ConfigurationError(`Duplicate plugin name "${plugin.name}"`, {
        field: `plugins[${i}].name`,
        received: plugin.name,
        suggestion: "Each plugin.name must be unique within the plugins array.",
      });
    }
    seen.add(plugin.name);
  }

  return plugins;
}

/**
 * Applies plugins in registration order after all built-in modules.
 * Plugins contribute pipeline steps at compile time only — never a per-request wrapper.
 */
export function compilePluginSteps(
  steps: import("../types/step.js").PipelineStep[],
  plugins: readonly Plugin[] | undefined,
  config: Readonly<import("../types/config.js").SecureKitConfig>,
): void {
  if (plugins === undefined) {
    return;
  }

  for (const plugin of plugins) {
    plugin.compile(steps, config);
  }
}
