import type { HeaderWriter } from "../types/context.js";

export interface MutableHeaderWriter extends HeaderWriter {
  entries(): ReadonlyMap<string, readonly string[]>;
}

export function createHeaderWriter(): MutableHeaderWriter {
  const values = new Map<string, string[]>();

  return {
    set(name: string, value: string): void {
      values.set(name.toLowerCase(), [value]);
    },
    append(name: string, value: string): void {
      const key = name.toLowerCase();
      const existing = values.get(key);
      if (existing === undefined) {
        values.set(key, [value]);
        return;
      }
      existing.push(value);
    },
    entries(): ReadonlyMap<string, readonly string[]> {
      return values;
    },
  };
}
