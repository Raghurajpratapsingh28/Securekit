import { createHmac } from "node:crypto";

export function hmac(
  value: string,
  secret: string,
  algorithm: "sha256" | "sha512" = "sha256",
): string {
  return createHmac(algorithm, secret).update(value).digest("hex");
}
