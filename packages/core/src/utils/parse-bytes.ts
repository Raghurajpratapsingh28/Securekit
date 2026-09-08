import { ConfigurationError } from "../errors/configuration-error.js";

const UNITS: Record<string, number> = {
  b: 1,
  kb: 1024,
  mb: 1024 ** 2,
  gb: 1024 ** 3,
};

export function parseByteSize(value: string | number, field = "bodyLimit"): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) {
      throw new ConfigurationError(`${field} must be a non-negative number`, {
        field,
        received: value,
      });
    }
    return value;
  }

  const trimmed = value.trim().toLowerCase();
  const match = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/.exec(trimmed);

  if (match === null) {
    throw new ConfigurationError(`Invalid ${field} string`, {
      field,
      received: value,
      suggestion: 'Use a byte count or a string like "1mb", "512kb", or 1048576.',
    });
  }

  const amount = Number(match[1]);
  const unit = match[2] ?? "b";
  const multiplier = UNITS[unit];

  if (multiplier === undefined || !Number.isFinite(amount) || amount < 0) {
    throw new ConfigurationError(`Invalid ${field} string`, {
      field,
      received: value,
    });
  }

  return Math.floor(amount * multiplier);
}
