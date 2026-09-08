import type { HeaderWriter } from "../types/context.js";
import type { MutableHeaderWriter } from "./header-writer.js";

export function readResponseHeaders(
  writer: HeaderWriter,
): Readonly<Record<string, string>> {
  const mutable = writer as MutableHeaderWriter;
  if (typeof mutable.entries !== "function") {
    return {};
  }

  const headers: Record<string, string> = {};
  for (const [name, values] of mutable.entries()) {
    headers[name] = values.join(", ");
  }
  return headers;
}
