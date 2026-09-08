import type { ReadonlyHeaderMap } from "../types/context.js";

function normalizeHeaderName(name: string): string {
  return name.toLowerCase();
}

export function createReadonlyHeaderMap(
  source: Readonly<Record<string, string | readonly string[] | undefined>>,
): ReadonlyHeaderMap {
  const normalized = new Map<string, string>();

  for (const [name, value] of Object.entries(source)) {
    if (value === undefined) {
      continue;
    }

    const key = normalizeHeaderName(name);
    if (Array.isArray(value)) {
      normalized.set(key, value.map(String).join(", "));
    } else {
      normalized.set(key, String(value));
    }
  }

  return {
    get(name: string): string | undefined {
      return normalized.get(normalizeHeaderName(name));
    },
    has(name: string): boolean {
      return normalized.has(normalizeHeaderName(name));
    },
    byteLength(): number {
      let total = 0;
      for (const [name, value] of normalized) {
        total += name.length + value.length + 4;
      }
      return total;
    },
    count(): number {
      return normalized.size;
    },
  };
}
