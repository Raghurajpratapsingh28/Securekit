import { createHash, timingSafeEqual } from "node:crypto";

const SHA256_DIGEST_BYTES = 32;

/** Hash a presented API key to a fixed-length digest for constant-time comparison. */
export function digestApiKey(key: string): Buffer {
  return createHash("sha256").update(key).digest();
}

/**
 * Constant-time API key verification.
 * Keys are hashed to a fixed-length digest before comparison so key length never
 * leaks via timingSafeEqual's equal-length requirement.
 */
export function constantTimeKeyCompare(
  presentedKey: string,
  storedKeyHashHex: string,
): boolean {
  const presentedDigest = digestApiKey(presentedKey);
  const storedDigest = parseStoredDigest(storedKeyHashHex);
  return timingSafeEqual(presentedDigest, storedDigest);
}

function parseStoredDigest(storedKeyHashHex: string): Buffer {
  try {
    const digest = Buffer.from(storedKeyHashHex, "hex");
    if (digest.length === SHA256_DIGEST_BYTES) {
      return digest;
    }
  } catch {
    // fall through to fixed-length dummy digest
  }

  return Buffer.alloc(SHA256_DIGEST_BYTES);
}
