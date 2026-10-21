import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ENDPOINTS, ERROR_CODES, WEBHOOK_EVENTS } from "./apiSpec";
import { ALL_STATUSES, ALLOWED_TRANSITIONS } from "@/domain/status";
import { DEMO_API_KEYS } from "@/domain/webhook";

const doc = readFileSync("docs/API.md", "utf8");
const readme = readFileSync("README.md", "utf8");

describe("illustrative API specification ↔ documentation", () => {
  it("every endpoint of the developer page appears in docs/API.md", () => {
    for (const e of ENDPOINTS) expect(doc, `${e.method} ${e.path}`).toContain(`\`${e.method} ${e.path}\``);
  });

  it("every webhook event and every error code is documented", () => {
    for (const ev of WEBHOOK_EVENTS) expect(doc, ev.type).toContain(ev.type);
    for (const c of ERROR_CODES) expect(doc, c.code).toContain(c.code);
  });

  it("the documented transition table matches the code's state machine", () => {
    for (const s of ALL_STATUSES) {
      for (const to of ALLOWED_TRANSITIONS[s]) {
        const row = doc.split("\n").find((l) => l.startsWith(`| \`${s}\``));
        if (s === "failed" || s === "cancelled" || s === "refunded") continue;
        expect(row, `row of ${s}`).toBeDefined();
        expect(row!, `${s} → ${to}`).toContain(`\`${to}\``);
      }
    }
  });

  it("the displayed keys are fictitious and the documentation says so", () => {
    for (const k of Object.values(DEMO_API_KEYS)) expect(doc).toContain(k);
    expect(doc).toMatch(/not implemented/i);
    expect(doc).toMatch(/fictitious/i);
  });

  it("the README clearly states there is no real payment and no license", () => {
    expect(readme).toMatch(/No real payment/i);
    expect(readme).toMatch(/No license/i);
  });
});
