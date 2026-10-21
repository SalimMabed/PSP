/**
 * ILLUSTRATIVE webhook signature model (to be implemented server-side).
 *
 *   PSP-Signature: t=<UNIX timestamp in seconds>,v1=<HMAC-SHA256 hex>
 *   v1 = HMAC_SHA256(secret, `${t}.${raw request body}`)
 *
 * The prototype secret is FICTITIOUS. In production, it is generated and stored server-side
 * (secrets manager) and never shipped in a frontend bundle.
 */

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return toHex(await globalThis.crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

export async function signWebhook(secret: string, timestampSeconds: number, rawBody: string): Promise<string> {
  const v1 = await hmacSha256Hex(secret, `${timestampSeconds}.${rawBody}`);
  return `t=${timestampSeconds},v1=${v1}`;
}

/** Constant-time comparison of two hexadecimal strings of the same length. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type VerifyResult = { valid: true } | { valid: false; reason: "malformed" | "stale" | "mismatch" };

/** Full verification: format, clock tolerance (anti-replay), signature. */
export async function verifyWebhook(
  secret: string,
  header: string,
  rawBody: string,
  nowSeconds: number,
  toleranceSeconds = 300
): Promise<VerifyResult> {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!parts.v1 || !Number.isFinite(t)) return { valid: false, reason: "malformed" };
  if (Math.abs(nowSeconds - t) > toleranceSeconds) return { valid: false, reason: "stale" };
  const expected = await hmacSha256Hex(secret, `${t}.${rawBody}`);
  return safeEqual(expected, parts.v1) ? { valid: true } : { valid: false, reason: "mismatch" };
}

/** FICTITIOUS example values displayed in the developer area. */
export const DEMO_API_KEYS = {
  publishable: "pk_test_DEMO_00000000000000000000",
  secret: "sk_test_DEMO_DO_NOT_USE_0000000000",
  webhookSecret: "whsec_DEMO_FICTITIOUS_0000000000000000",
} as const;
