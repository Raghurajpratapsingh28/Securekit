import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import type { SecureKitConfig } from "@backend-master/securekit";

export async function loadConfigFromFile(path: string): Promise<SecureKitConfig | undefined> {
  const source = await readFile(path, "utf8");

  if (path.endsWith(".json")) {
    const parsed: unknown = JSON.parse(source);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Config JSON must be an object");
    }
    return parsed as SecureKitConfig;
  }

  if (path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".cjs")) {
    const module = await import(pathToFileURL(path).href);
    const exported = module.default ?? module.config ?? module.securekitConfig;
    if (exported === undefined) {
      throw new Error("Config module must default-export a SecureKitConfig object");
    }
    return exported as SecureKitConfig;
  }

  throw new Error("Unsupported config file extension — use .json, .js, or .mjs");
}

export function parseInlineConfigJson(raw: string): SecureKitConfig | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  const parsed: unknown = JSON.parse(trimmed);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Inline config JSON must be an object");
  }
  return parsed as SecureKitConfig;
}
