// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDatabase } from "@/db/database";
import { LocalPspApi } from "@/services/localApi";
import { computeLedger } from "@/domain/settlement";
import { usePspStore } from "@/store/usePspStore";
import type { Actor, Transaction } from "@/domain/types";
import { forgetMemoryState, renderApp, resetStorageAndStore } from "./renderApp";

const admin: Actor = { name: "Amine Demo", role: "admin" };
const H = (name: string | RegExp) => screen.findByRole("heading", { level: 1, name });

async function createTx(overrides: Record<string, unknown> = {}): Promise<Transaction> {
  const api = new LocalPspApi(getDatabase());
  await api.init();
  return api.createPayment(
    {
      merchantId: "mrc_001",
      customer: { kind: "existing", id: "cus_001" },
      amount: 2_500_000,
      currency: "DZD",
      orderRef: "ORD-UI-TEST",
      description: "UI test order",
      outcome: "created",
      ...overrides,
    },
    { actor: admin }
  );
}

const state = () => usePspStore.getState().data!;

beforeEach(async () => {
  cleanup();
  await resetStorageAndStore();
});

describe("navigation and main pages", () => {
  const routes: [string, string | RegExp][] = [
    ["/", "Dashboard"],
    ["/transactions", "Transactions"],
    ["/collect", "Collect payments"],
    ["/customers", "Customers"],
    ["/merchants", "Merchants"],
    ["/settlements", "Settlements"],
    ["/developers", "Developer area"],
    ["/settings", "Settings"],
    ["/customers/cus_001", "Customer profile"],
    ["/merchants/mrc_001", "Merchant profile"],
    ["/unknown-route", "Page not found"],
  ];

  it.each(routes)("displays the page %s with its title", async (route, title) => {
    await renderApp(route);
    expect(await H(title)).toBeInTheDocument();
    expect(screen.queryByText(/This page ran into a problem/)).not.toBeInTheDocument();
  });

  it("the side navigation leads to every main page", async () => {
    const { user } = await renderApp("/");
    await H("Dashboard");
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    for (const [label, title] of [
      ["Transactions", "Transactions"],
      ["Collect", "Collect payments"],
      ["Customers", "Customers"],
      ["Merchants", "Merchants"],
      ["Settlements", "Settlements"],
      ["Developers", "Developer area"],
      ["Settings", "Settings"],
      ["Dashboard", "Dashboard"],
    ]) {
      await user.click(within(nav).getByRole("link", { name: label }));
      expect(await H(title)).toBeInTheDocument();
    }
  });

  it("no internal link is dead (main pages and anchors)", async () => {
    const pages = ["/", "/transactions", "/collect", "/customers", "/merchants", "/settlements", "/developers", "/settings"];
    const targets = new Set<string>();
    const anchors: [string, string][] = []; // [path, anchor id]
    for (const page of pages) {
      const { unmount } = await renderApp(page);
      await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument());
      for (const a of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
        const href = a.getAttribute("href")!;
        if (href.startsWith("http") || href.startsWith("mailto:")) continue;
        const [path, hash] = href.split("#");
        if (hash) anchors.push([path || page, hash]);
        if (path) targets.add(path);
      }
      unmount();
    }
    expect(targets.size).toBeGreaterThan(15);
    expect(anchors.length).toBeGreaterThan(5);
    for (const href of targets) {
      const { unmount } = await renderApp(href);
      await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument());
      for (const [path, id] of anchors.filter(([p]) => p === href)) {
        expect(document.getElementById(id), `anchor #${id} missing on ${path}`).not.toBeNull();
      }
      expect(screen.queryByText("This page does not exist"), `dead link: ${href}`).not.toBeInTheDocument();
      expect(screen.queryByText(/not found/i), `resource not found: ${href}`).not.toBeInTheDocument();
      unmount();
    }
  }, 60_000);
});

describe("dashboard", () => {
  it("displays the indicators, the demo alerts and the sandbox banner", async () => {
    await renderApp("/");
    await H("Dashboard");
    expect(screen.getByText("Payment volume")).toBeInTheDocument();
    expect(screen.getByText("Success rate")).toBeInTheDocument();
    expect(screen.getAllByText(/Sandbox mode/).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Alerts" })).toBeInTheDocument();
    expect(await screen.findByText(/pending for more than 24 h/)).toBeInTheDocument();
  });

  it("the status filter recomputes the number of displayed transactions", async () => {
    const { user } = await renderApp("/");
    await H("Dashboard");
    const kpis = within(screen.getByRole("region", { name: "Key indicators" }));
    const kpiCount = () => Number(kpis.getByText("Transactions").closest(".card")!.querySelector(".num")!.textContent!.replace(/\s/g, ""));
    const before = kpiCount();
    await user.click(screen.getByRole("button", { name: /^Failed/ }));
    expect(screen.getByRole("button", { name: /^Failed/ })).toHaveAttribute("aria-pressed", "true");
    const after = kpiCount();
    expect(after).toBeLessThan(before);
    // the "Failed" tile counter and the "Transactions" indicator must match
    expect(after).toBe(Number(within(screen.getByRole("button", { name: /^Failed/ })).getByText(/^\d+$/).textContent));
    expect(screen.getByText(/Active filter: "Failed"/)).toBeInTheDocument();
  });

  it("the header period selector changes the analyzed period", async () => {
    const { user } = await renderApp("/");
    await H("Dashboard");
    await user.selectOptions(screen.getByRole("combobox", { name: "Analysis period" }), "all");
    await waitFor(() => expect(usePspStore.getState().period).toBe("all"));
    expect((await screen.findAllByText(/all time/i)).length).toBeGreaterThan(0);
  });
});

describe("full journey: request → payment page → refunds", () => {
  it("validates the form, collects on the hosted page, then refunds without exceeding the balance", async () => {
    const { user } = await renderApp("/collect");
    await H("Collect payments");

    // 1. Validation: empty form
    await user.click(screen.getByRole("button", { name: "Create the payment request" }));
    expect(await screen.findByText("Choose a merchant.")).toBeInTheDocument();
    expect(screen.getByText("Enter an amount.")).toBeInTheDocument();
    expect(screen.getByText("Choose a customer.")).toBeInTheDocument();

    // 2. Invalid amount, then valid
    await user.selectOptions(screen.getByRole("combobox", { name: /Merchant/ }), "mrc_001");
    await user.selectOptions(screen.getByRole("combobox", { name: /^Customer/ }), "cus_002");
    const amount = screen.getByRole("textbox", { name: /Amount/ });
    await user.type(amount, "-50");
    await user.type(screen.getByRole("textbox", { name: /Description/ }), "Quarterly subscription");
    await user.click(screen.getByRole("button", { name: "Create the payment request" }));
    expect(await screen.findByText("The amount must be strictly positive.")).toBeInTheDocument();
    await user.clear(amount);
    await user.type(amount, "25 000");
    await user.click(screen.getByRole("button", { name: "Create the payment request" }));

    // 3. Confirmation with reference
    expect(await screen.findByText("Payment request created")).toBeInTheDocument();
    const reference = document.body.textContent!.match(/PAY-[A-Z0-9]{8}/)![0];
    expect(state().transactions.find((t) => t.reference === reference)?.status).toBe("created");

    // 4. Hosted payment page (sandbox): no card entry
    await user.click(screen.getAllByRole("link", { name: "Open the payment page" })[0]);
    expect(await screen.findByText(/Choose a payment method \(sandbox\)/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/card number/i)).not.toBeInTheDocument();
    expect(document.querySelectorAll("input[type=text], input[type=tel], input[type=password]").length).toBe(0);
    await user.click(screen.getByRole("button", { name: /simulate a success/i }));
    expect(await screen.findByText("Choose a payment method to continue.")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /CIB \(sandbox\)/ }));
    await user.click(screen.getByRole("button", { name: /simulate a success/i }));
    expect(await screen.findByText("Simulated payment succeeded")).toBeInTheDocument();

    // 5. Back to the detail page: status, amounts
    await user.click(screen.getByRole("link", { name: /Back to the back office/ }));
    expect(await H("Transaction details")).toBeInTheDocument();
    expect((await screen.findAllByText("Succeeded")).length).toBeGreaterThan(0);

    // 6. Partial refund
    await user.click(screen.getByRole("button", { name: "Refund" }));
    const dialog = await screen.findByRole("dialog", { name: `Refund ${reference}` });
    const refundAmount = within(dialog).getByRole("textbox", { name: /Amount to refund/ });
    await user.clear(refundAmount);
    await user.type(refundAmount, "10 000");
    await user.click(within(dialog).getByRole("button", { name: "Confirm the refund" }));
    expect(await within(dialog).findByText("Indicate the reason for the refund.")).toBeInTheDocument();
    await user.selectOptions(within(dialog).getByRole("combobox", { name: /Reason/ }), "customer_request");
    await user.click(within(dialog).getByRole("button", { name: "Confirm the refund" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect((await screen.findAllByText("Partially refunded")).length).toBeGreaterThan(0);
    expect(state().transactions.find((t) => t.reference === reference)).toMatchObject({ refunded: 1_000_000, status: "partially_refunded" });
    expect(await screen.findByText(/Refund RFD-[A-Z0-9]{8} of 10.000.DA recorded/)).toBeInTheDocument();

    // 7. Overrun refused
    await user.click(screen.getByRole("button", { name: "Refund" }));
    const dialog2 = await screen.findByRole("dialog");
    const amount2 = within(dialog2).getByRole("textbox", { name: /Amount to refund/ });
    await user.clear(amount2);
    await user.type(amount2, "15 000,01");
    await user.selectOptions(within(dialog2).getByRole("combobox", { name: /Reason/ }), "duplicate");
    await user.click(within(dialog2).getByRole("button", { name: "Confirm the refund" }));
    expect(await within(dialog2).findByText(/Maximum refundable amount: 15.000.DA/)).toBeInTheDocument();
    expect(state().transactions.find((t) => t.reference === reference)!.refunded).toBe(1_000_000);

    // 8. Full refund of the balance
    await user.click(within(dialog2).getByRole("button", { name: "Refund everything" }));
    await user.click(within(dialog2).getByRole("button", { name: "Confirm the refund" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(state().transactions.find((t) => t.reference === reference)).toMatchObject({ refunded: 2_500_000, status: "refunded" });
    expect(screen.queryByRole("button", { name: "Refund" })).not.toBeInTheDocument();
    expect(state().refunds.filter((r) => r.transactionId === state().transactions.find((t) => t.reference === reference)!.id)).toHaveLength(2);
  }, 60_000);

  it("a double click on \"Simulate a success\" records only one status change", async () => {
    const tx = await createTx();
    const { user } = await renderApp(`/transactions/${tx.id}`);
    await H("Transaction details");
    await user.dblClick(await screen.findByRole("button", { name: "Simulate a success" }));
    await waitFor(() => expect(state().transactions.find((t) => t.id === tx.id)!.status).toBe("succeeded"));
    const stored = state().transactions.find((t) => t.id === tx.id)!;
    expect(stored.history.filter((h) => h.to === "succeeded")).toHaveLength(1);
    expect(state().auditLogs.filter((a) => a.entityId === tx.id && a.action === "payment.status_changed")).toHaveLength(1);
  });

  it("an invalid payment link shows a clear message", async () => {
    await renderApp("/pay/unknown");
    expect(await screen.findByText("Payment link not found")).toBeInTheDocument();
  });

  it("the payment page cleanly refuses an already closed payment", async () => {
    const tx = await createTx({ outcome: "failed", method: "cib_sandbox" });
    await renderApp(`/pay/${tx.checkoutToken}`);
    expect(await screen.findByText("Payment declined (simulation)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /simulate a success/i })).not.toBeInTheDocument();
  });
});

describe("keyboard accessibility", () => {
  it("a dialog takes focus, keeps it (Tab / Shift+Tab), closes with Escape and returns it to the trigger", async () => {
    const tx = await createTx({ outcome: "succeeded", method: "cib_sandbox" });
    const { user } = await renderApp(`/transactions/${tx.id}`);
    const trigger = await screen.findByRole("button", { name: "Refund" });
    await user.click(trigger);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog.contains(document.activeElement)).toBe(true);
    for (let i = 0; i < 12; i++) {
      await user.tab();
      expect(dialog.contains(document.activeElement), `Tab #${i + 1} leaves the dialog`).toBe(true);
    }
    for (let i = 0; i < 12; i++) {
      await user.tab({ shift: true });
      expect(dialog.contains(document.activeElement), `Shift+Tab #${i + 1} leaves the dialog`).toBe(true);
    }
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("the skip link leads to the content and the tables have a caption and column headers", async () => {
    await renderApp("/transactions");
    await H("Transactions");
    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute("href", "#content");
    expect(document.getElementById("content")).toBeInTheDocument();
    const table = await screen.findByRole("table", { name: /Transaction list/ });
    expect(within(table).getAllByRole("columnheader").length).toBeGreaterThanOrEqual(6);
  });

  it("announces successes in a live region (role=status)", async () => {
    const tx = await createTx();
    const { user } = await renderApp(`/transactions/${tx.id}`);
    await user.click(await screen.findByRole("button", { name: "Simulate a success" }));
    const live = screen.getAllByRole("status").find((el) => el.getAttribute("aria-live") === "polite")!;
    await waitFor(() => expect(live).toHaveTextContent(tx.reference));
    expect(live).toHaveTextContent(/Succeeded/);
  });
});

describe("transaction list: search, filters, sorting, export", () => {
  it("searches by reference, filters by status and resets", async () => {
    const tx = await createTx({ outcome: "succeeded", method: "wallet_sandbox" });
    const { user } = await renderApp("/transactions");
    await H("Transactions");
    await user.type(screen.getByRole("searchbox", { name: "Search for a transaction" }), tx.reference);
    const table = await screen.findByRole("table", { name: /Transaction list/ });
    await waitFor(() => expect(within(table).getAllByRole("row")).toHaveLength(2)); // header + 1 result
    expect(within(table).getByRole("link", { name: tx.reference })).toBeInTheDocument();

    await user.clear(screen.getByRole("searchbox"));
    await user.click(screen.getByRole("button", { name: /Filters/ }));
    await user.click(screen.getByRole("button", { name: "Failed" }));
    await waitFor(() => {
      const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) expect(within(r).getByText("Failed")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument());
  });

  it("regression: a filter clicked while typing is not overwritten by the search debounce", async () => {
    const { user } = await renderApp("/transactions");
    await H("Transactions");
    usePspStore.getState().setPeriod("all");
    await user.click(screen.getByRole("button", { name: /Filters/ }));
    await user.type(screen.getByRole("searchbox"), "ORD-1"); // the debounce (250 ms) has not completed yet
    await user.click(screen.getByRole("button", { name: "Failed" })); // immediate click on a filter
    await new Promise((r) => setTimeout(r, 500)); // let the debounce run
    expect(screen.getByRole("button", { name: "Failed" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("searchbox")).toHaveValue("ORD-1");
    const rows = within(await screen.findByRole("table")).getAllByRole("row").slice(1);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(within(r).getByText("Failed")).toBeInTheDocument();
      expect(r.textContent).toMatch(/ORD-1/);
    }
  });

  it("displays an explicit empty state when nothing matches", async () => {
    const { user } = await renderApp("/transactions");
    await H("Transactions");
    await user.type(screen.getByRole("searchbox"), "zzzz-not-found");
    expect(await screen.findByText("No transaction matches")).toBeInTheDocument();
  });

  it("sorts by amount (aria-sort) and paginates", async () => {
    const { user } = await renderApp("/transactions?period=all");
    await H("Transactions");
    usePspStore.getState().setPeriod("all");
    await user.click(await screen.findByRole("button", { name: /Sort by amount/ }));
    await waitFor(() => expect(screen.getByRole("columnheader", { name: /Amount/ })).toHaveAttribute("aria-sort", "descending"));
    const amounts = within(screen.getByRole("table")).getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell")[5].textContent!);
    expect(amounts.length).toBeGreaterThan(1);
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByText(/Page 2 \//)).toBeInTheDocument();
  });

  it("exports the filtered transactions to CSV and logs the export", async () => {
    let exported: Blob | null = null;
    const spy = vi.spyOn(URL, "createObjectURL").mockImplementation((b) => {
      exported = b as Blob;
      return "blob:test";
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined); // avoids jsdom navigation
    const { user } = await renderApp("/transactions?status=failed");
    await H("Transactions");
    usePspStore.getState().setPeriod("all");
    await user.click(await screen.findByRole("button", { name: "Export to CSV" }));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(exported!);
    });
    const lines = text.replace("﻿", "").trim().split("\r\n");
    expect(lines[0]).toContain("reference;created_at");
    expect(lines.length - 1).toBe(state().transactions.filter((t) => t.status === "failed").length);
    expect(lines.slice(1).every((l) => l.includes(";Failed;"))).toBe(true);
    await waitFor(() => expect(state().auditLogs[0].action).toBe("export.csv"));
    expect(click).toHaveBeenCalled();
    click.mockRestore();
    spy.mockRestore();
  });

  it("creates a test transaction with a simulated outcome from the list", async () => {
    const { user } = await renderApp("/transactions");
    await H("Transactions");
    await user.click(screen.getByRole("button", { name: "Test transaction" }));
    const dialog = await screen.findByRole("dialog", { name: "New test transaction" });
    await user.selectOptions(within(dialog).getByRole("combobox", { name: /Merchant/ }), "mrc_002");
    await user.selectOptions(within(dialog).getByRole("combobox", { name: /^Customer/ }), "cus_003");
    await user.type(within(dialog).getByRole("textbox", { name: /Amount/ }), "8 500");
    await user.type(within(dialog).getByRole("textbox", { name: /Description/ }), "Decline test");
    await user.selectOptions(within(dialog).getByRole("combobox", { name: /Outcome to apply/ }), "failed");
    await user.click(within(dialog).getByRole("button", { name: "Create the test transaction" }));
    expect(await H("Transaction details")).toBeInTheDocument();
    expect((await screen.findAllByText("Failed")).length).toBeGreaterThan(0);
    expect(state().transactions.some((t) => t.origin === "test" && t.status === "failed" && t.amount === 850_000)).toBe(true);
  });
});

describe("settlements, roles and settings", () => {
  it("generates simulated batches while keeping the ledger consistent", async () => {
    const { user } = await renderApp("/settlements");
    await H("Settlements");
    expect(screen.getByText(/no real bank transfer/i)).toBeInTheDocument();
    const before = state().settlements.length;
    await user.click(await screen.findByRole("button", { name: /Generate batches/ }));
    await user.click(await screen.findByRole("button", { name: "Generate (simulation)" }));
    await waitFor(() => expect(state().settlements.length).toBeGreaterThan(before));
    const l = computeLedger(state().transactions, state().refunds, state().settlements);
    expect(l.settled + l.inFlight + l.unbatched).toBe(l.net);
    expect(await screen.findByText(/batch(es)? generated/)).toBeInTheDocument();
  });

  it("the Operator role has no access to settlement actions or to the reset", async () => {
    const { user } = await renderApp("/settlements");
    await H("Settlements");
    await user.click(screen.getByRole("button", { name: /Profile: Amine Demo/ }));
    await user.click(screen.getByRole("button", { name: "Operator" }));
    await waitFor(() => expect(state().settings.currentRole).toBe("operator"));
    expect(screen.queryByRole("button", { name: /Generate batches/ })).not.toBeInTheDocument();
    expect(state().auditLogs[0].action).toBe("role.switched");
  });

  it("edits the organization profile with validation, then logs the change", async () => {
    const { user } = await renderApp("/settings");
    await H("Settings");
    const name = screen.getByRole("textbox", { name: /Business name/ });
    await user.clear(name);
    await user.type(name, "Atlas Payments Demo");
    const email = screen.getByRole("textbox", { name: /Contact email/ });
    await user.clear(email);
    await user.type(email, "not-an-email");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Invalid email address.")).toBeInTheDocument();
    await user.clear(email);
    await user.type(email, "contact@atlas.example");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(state().settings.organization.name).toBe("Atlas Payments Demo"));
    expect(state().auditLogs[0].action).toBe("settings.updated");
  });

  it("resets the demo after confirmation and restores the original dataset", async () => {
    const tx = await createTx();
    const { user } = await renderApp("/settings?tab=demo");
    await H("Settings");
    expect(state().transactions.some((t) => t.id === tx.id)).toBe(true);
    await user.click(screen.getByRole("button", { name: "Reset the demo" }));
    await user.click(await screen.findByRole("button", { name: "Yes, reset" }));
    await waitFor(() => expect(state().transactions.some((t) => t.id === tx.id)).toBe(false));
    expect(state().transactions.length).toBeGreaterThan(200);
    expect(state().auditLogs.some((a) => a.action === "demo.reset")).toBe(true);
  });

  it("displays the audit log and filters it by action type", async () => {
    await createTx();
    const { user } = await renderApp("/settings?tab=audit");
    await H("Settings");
    await user.selectOptions(screen.getByRole("combobox", { name: "Action type" }), "payment.created");
    const table = await screen.findByRole("table", { name: "Audit log" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(within(r).getByText("Payment created")).toBeInTheDocument();
  });
});

describe("persistence after refresh", () => {
  it("finds a created transaction after a reload (in-memory state lost, IndexedDB kept)", async () => {
    const tx = await createTx({ orderRef: "ORD-PERSIST" });
    const first = await renderApp("/transactions");
    await H("Transactions");
    first.unmount();
    forgetMemoryState();

    const { user } = await renderApp("/transactions");
    await H("Transactions");
    await user.type(screen.getByRole("searchbox"), "ORD-PERSIST");
    expect(await screen.findByRole("link", { name: tx.reference })).toBeInTheDocument();
  });

  it("shows a clear error with a retry button if the storage is unavailable", async () => {
    const spy = vi.spyOn(LocalPspApi.prototype, "init").mockRejectedValueOnce(new Error("IndexedDB blocked"));
    await renderApp("/");
    expect(await screen.findByText("Local storage is unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    spy.mockRestore();
  });
});
