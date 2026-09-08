import { createHash } from "node:crypto";

export function hash(
  value: string,
  algorithm: "sha256" | "sha512" = "sha256",
): string {
  return createHash(algorithm).update(value).digest("hex");
}
