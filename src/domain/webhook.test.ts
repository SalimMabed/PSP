import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DEMO_API_KEYS, hmacSha256Hex, safeEqual, signWebhook, verifyWebhook } from "./webhook";

const body = JSON.stringify({ id: "evt_demo_1", type: "payment.succeeded", data: { reference: "PAY-DEMO0001" } });

describe("webhook signature", () => {
  it("matches the Node reference implementation (createHmac), the one shown in the developer area", async () => {
    const t = 1_760_000_000;
    const expected = createHmac("sha256", DEMO_API_KEYS.webhookSecret).update(`${t}.${body}`).digest("hex");
    expect(await hmacSha256Hex(DEMO_API_KEYS.webhookSecret, `${t}.${body}`)).toBe(expected);
    expect(await signWebhook(DEMO_API_KEYS.webhookSecret, t, body)).toBe(`t=${t},v1=${expected}`);
  });

  it("verifies a valid signature", async () => {
    const t = 1_760_000_000;
    const header = await signWebhook(DEMO_API_KEYS.webhookSecret, t, body);
    expect(await verifyWebhook(DEMO_API_KEYS.webhookSecret, header, body, t + 10)).toEqual({ valid: true });
  });

  it("rejects a tampered body, a wrong key and a malformed header", async () => {
    const t = 1_760_000_000;
    const header = await signWebhook(DEMO_API_KEYS.webhookSecret, t, body);
    expect(await verifyWebhook(DEMO_API_KEYS.webhookSecret, header, body + " ", t)).toEqual({ valid: false, reason: "mismatch" });
    expect(await verifyWebhook("whsec_other", header, body, t)).toEqual({ valid: false, reason: "mismatch" });
    expect(await verifyWebhook(DEMO_API_KEYS.webhookSecret, "anything", body, t)).toEqual({ valid: false, reason: "malformed" });
  });

  it("rejects a timestamp outside the tolerance (replay protection)", async () => {
    const t = 1_760_000_000;
    const header = await signWebhook(DEMO_API_KEYS.webhookSecret, t, body);
    expect(await verifyWebhook(DEMO_API_KEYS.webhookSecret, header, body, t + 301)).toEqual({ valid: false, reason: "stale" });
    expect(await verifyWebhook(DEMO_API_KEYS.webhookSecret, header, body, t + 300)).toEqual({ valid: true });
  });

  it("safeEqual compares without short-circuiting on the content", () => {
    expect(safeEqual("abcd", "abcd")).toBe(true);
    expect(safeEqual("abcd", "abce")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });

  it("the example keys are obviously fictitious", () => {
    for (const key of Object.values(DEMO_API_KEYS)) expect(key).toMatch(/DEMO/);
    expect(DEMO_API_KEYS.secret).not.toMatch(/^sk_live/);
  });
});
