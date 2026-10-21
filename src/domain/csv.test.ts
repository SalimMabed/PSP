import { describe, expect, it } from "vitest";
import { csvFilename, escapeCsvCell, neutralizeFormula, TRANSACTION_CSV_HEADERS, transactionsToCsv } from "./csv";
import { buildLookup } from "./filters";
import { makeCustomer, makeMerchant, makeTx, NOW } from "@/test/factories";

describe("escapeCsvCell", () => {
  it("quotes cells containing ; \" or a line break", () => {
    expect(escapeCsvCell("simple")).toBe("simple");
    expect(escapeCsvCell("a;b")).toBe('"a;b"');
    expect(escapeCsvCell('says "yes"')).toBe('"says ""yes"""');
    expect(escapeCsvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(12)).toBe("12");
  });
});

describe("neutralizeFormula (CSV injection)", () => {
  it.each(["=SUM(A1)", "+33123", "-2+3", "@cmd", "\t=1"])("neutralizes %j", (v) => {
    expect(neutralizeFormula(v)).toBe(`'${v}`);
  });
  it("leaves normal text untouched", () => {
    expect(neutralizeFormula("Amine Benali")).toBe("Amine Benali");
  });
});

describe("transactionsToCsv", () => {
  const customer = makeCustomer({ id: "c1", name: "=HYPERLINK(\"http://x\")", email: "a@client-demo.example" });
  const merchant = makeMerchant({ id: "m1", name: "Shop; \"Test\"" });
  const lookup = buildLookup([customer], [merchant]);
  const tx = makeTx({ customerId: "c1", merchantId: "m1", amount: 1_250_050, refunded: 50_000, fee: 23_000, status: "partially_refunded", orderRef: "ORD-9" });

  it("produces BOM + headers + one row per transaction, separated by CRLF", () => {
    const csv = transactionsToCsv([tx, tx], lookup);
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines).toHaveLength(4); // header + 2 rows + empty end
    expect(lines[0]).toBe(TRANSACTION_CSV_HEADERS.join(";"));
    expect(lines[3]).toBe("");
  });

  it("writes amounts in DA with a decimal comma, the English status label, and the SANDBOX marker", () => {
    const row = transactionsToCsv([tx], lookup).slice(1).split("\r\n")[1];
    expect(row).toContain(";Partially refunded;12500,50;DZD;500,00;230,00;CIB (sandbox);");
    expect(row.endsWith(";SANDBOX")).toBe(true);
  });

  it("neutralizes and escapes user-entered fields", () => {
    const row = transactionsToCsv([tx], lookup).slice(1).split("\r\n")[1];
    expect(row).toContain("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(row).toContain('"Shop; ""Test"""');
  });

  it("an empty list only contains the header", () => {
    expect(transactionsToCsv([], lookup).slice(1).split("\r\n")).toEqual([TRANSACTION_CSV_HEADERS.join(";"), ""]);
  });

  it("names the file with today's date (Algiers)", () => {
    expect(csvFilename(NOW)).toBe("transactions-sandbox-2026-10-19.csv");
  });
});
