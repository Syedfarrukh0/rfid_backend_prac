import crypto from "crypto";

/**
 * Custom UUID v4 generator — behaves like `uuid.v4()`
 * No external dependencies, works in both ESM & CommonJS
 */
export function v4(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  // Manual fallback for environments without crypto.randomUUID()
  const bytes = crypto.randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
    12,
    16
  )}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
