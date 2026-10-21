// @vitest-environment jsdom
import { cleanup, screen, waitFor } from "@testing-library/react";
import axe, { type Result } from "axe-core";
import { beforeEach, describe, expect, it } from "vitest";
import { getDatabase } from "@/db/database";
import { LocalPspApi } from "@/services/localApi";
import { renderApp, resetStorageAndStore } from "./renderApp";

/**
 * Automated axe-core audit (WCAG 2.x A/AA rules that can run in jsdom: accessible names, labels,
 * valid roles/ARIA, unique identifiers, table structure, heading hierarchy…).
 * Color contrast cannot be computed in jsdom: it is checked separately (see the README).
 */
async function violations(): Promise<Result[]> {
  const results = await axe.run(document.body, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] },
    rules: {
      "color-contrast": { enabled: false }, // cannot be computed without a rendering engine
      region: { enabled: false }, // demo pages: landmarks are already provided by header/main/nav
    },
  });
  return results.violations;
}

function describeViolations(list: Result[]): string {
  return list.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("\n  ")}`).join("\n");
}

// axe-core checks for icon ligatures through <canvas>; jsdom does not implement it (returns null: handled by axe).
HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;

beforeEach(async () => {
  cleanup();
  await resetStorageAndStore();
});

describe("automated accessibility (axe-core)", () => {
  const pages: [string, RegExp | string][] = [
    ["/", "Dashboard"],
    ["/transactions", "Transactions"],
    ["/collect", "Collect payments"],
    ["/customers", "Customers"],
    ["/merchants", "Merchants"],
    ["/settlements", "Settlements"],
    ["/developers", "Developer area"],
    ["/settings", "Settings"],
    ["/settings?tab=roles", "Settings"],
    ["/settings?tab=audit", "Settings"],
    ["/settings?tab=demo", "Settings"],
    ["/customers/cus_001", "Customer profile"],
    ["/merchants/mrc_001", "Merchant profile"],
  ];

  it.each(pages)("%s has no axe violation", async (route, title) => {
    await renderApp(route);
    await screen.findByRole("heading", { level: 1, name: title });
    await waitFor(() => expect(document.body.textContent).not.toMatch(/Loading the sandbox/));
    const found = await violations();
    expect(found, describeViolations(found)).toEqual([]);
  }, 30_000);

  it("the transaction page, the hosted payment page and the refund dialog are compliant", async () => {
    const api = new LocalPspApi(getDatabase());
    await api.init();
    const tx = await api.createPayment(
      {
        merchantId: "mrc_001",
        customer: { kind: "existing", id: "cus_001" },
        amount: 1_000_000,
        currency: "DZD",
        orderRef: "ORD-A11Y",
        description: "Accessibility test",
        outcome: "succeeded",
        method: "cib_sandbox",
      },
      { actor: { name: "Amine Demo", role: "admin" } }
    );
    const open = await api.createPayment(
      {
        merchantId: "mrc_001",
        customer: { kind: "existing", id: "cus_001" },
        amount: 500_000,
        currency: "DZD",
        orderRef: "ORD-A11Y-2",
        description: "Accessibility test (open)",
        outcome: "created",
      },
      { actor: { name: "Amine Demo", role: "admin" } }
    );

    const detail = await renderApp(`/transactions/${tx.id}`);
    await screen.findByRole("heading", { level: 2, name: tx.reference });
    let found = await violations();
    expect(found, describeViolations(found)).toEqual([]);

    await detail.user.click(screen.getByRole("button", { name: "Refund" }));
    await screen.findByRole("dialog");
    found = await violations();
    expect(found, describeViolations(found)).toEqual([]);
    detail.unmount();

    const checkout = await renderApp(`/pay/${open.checkoutToken}`);
    await screen.findByText(/Choose a payment method/);
    found = await violations();
    expect(found, describeViolations(found)).toEqual([]);
    checkout.unmount();
  }, 30_000);
});
