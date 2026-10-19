import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DEMO_API_KEYS, hmacSha256Hex, safeEqual, signWebhook, verifyWebhook } from "./webhook";

const body = JSON.stringify({ id: "evt_demo_1", type: "payment.succeeded", data: { reference: "PAY-DEMO0001" } });

describe("signature de webhook", () => {
  it("correspond à l'implémentation de référence Node (createHmac) — celle montrée dans l'espace développeur", async () => {
    const t = 1_760_000_000;
    const expected = createHmac("sha256", DEMO_API_KEYS.webhookSecret).update(`${t}.${body}`).digest("hex");
    expect(await hmacSha256Hex(DEMO_API_KEYS.webhookSecret, `${t}.${body}`)).toBe(expected);
    expect(await signWebhook(DEMO_API_KEYS.webhookSecret, t, body)).toBe(`t=${t},v1=${expected}`);
  });

  it("vérifie une signature valide", async () => {
    const t = 1_760_000_000;
    const header = await signWebhook(DEMO_API_KEYS.webhookSecret, t, body);
    expect(await verifyWebhook(DEMO_API_KEYS.webhookSecret, header, body, t + 10)).toEqual({ valid: true });
  });

  it("rejette un corps altéré, une mauvaise clé et un en-tête mal formé", async () => {
    const t = 1_760_000_000;
    const header = await signWebhook(DEMO_API_KEYS.webhookSecret, t, body);
    expect(await verifyWebhook(DEMO_API_KEYS.webhookSecret, header, body + " ", t)).toEqual({ valid: false, reason: "mismatch" });
    expect(await verifyWebhook("whsec_autre", header, body, t)).toEqual({ valid: false, reason: "mismatch" });
    expect(await verifyWebhook(DEMO_API_KEYS.webhookSecret, "n'importe quoi", body, t)).toEqual({ valid: false, reason: "malformed" });
  });

  it("rejette un horodatage hors tolérance (protection contre le rejeu)", async () => {
    const t = 1_760_000_000;
    const header = await signWebhook(DEMO_API_KEYS.webhookSecret, t, body);
    expect(await verifyWebhook(DEMO_API_KEYS.webhookSecret, header, body, t + 301)).toEqual({ valid: false, reason: "stale" });
    expect(await verifyWebhook(DEMO_API_KEYS.webhookSecret, header, body, t + 300)).toEqual({ valid: true });
  });

  it("safeEqual compare sans court-circuit sur le contenu", () => {
    expect(safeEqual("abcd", "abcd")).toBe(true);
    expect(safeEqual("abcd", "abce")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });

  it("les clés d'exemple sont manifestement fictives", () => {
    for (const key of Object.values(DEMO_API_KEYS)) expect(key).toMatch(/DEMO/);
    expect(DEMO_API_KEYS.secret).not.toMatch(/^sk_live/);
  });
});
