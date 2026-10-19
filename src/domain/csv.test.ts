import { describe, expect, it } from "vitest";
import { csvFilename, escapeCsvCell, neutralizeFormula, TRANSACTION_CSV_HEADERS, transactionsToCsv } from "./csv";
import { buildLookup } from "./filters";
import { makeCustomer, makeMerchant, makeTx, NOW } from "@/test/factories";

describe("escapeCsvCell", () => {
  it("met entre guillemets les cellules contenant ; \" ou un saut de ligne", () => {
    expect(escapeCsvCell("simple")).toBe("simple");
    expect(escapeCsvCell("a;b")).toBe('"a;b"');
    expect(escapeCsvCell('dit "oui"')).toBe('"dit ""oui"""');
    expect(escapeCsvCell("ligne1\nligne2")).toBe('"ligne1\nligne2"');
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(12)).toBe("12");
  });
});

describe("neutralizeFormula (injection CSV)", () => {
  it.each(["=SUM(A1)", "+33123", "-2+3", "@cmd", "\t=1"])("neutralise %j", (v) => {
    expect(neutralizeFormula(v)).toBe(`'${v}`);
  });
  it("laisse intact le texte normal", () => {
    expect(neutralizeFormula("Amine Benali")).toBe("Amine Benali");
  });
});

describe("transactionsToCsv", () => {
  const customer = makeCustomer({ id: "c1", name: "=HYPERLINK(\"http://x\")", email: "a@client-demo.example" });
  const merchant = makeMerchant({ id: "m1", name: "Boutique; \"Test\"" });
  const lookup = buildLookup([customer], [merchant]);
  const tx = makeTx({ customerId: "c1", merchantId: "m1", amount: 1_250_050, refunded: 50_000, fee: 23_000, status: "partially_refunded", orderRef: "CMD-9" });

  it("produit BOM + en-têtes + une ligne par transaction, séparées par CRLF", () => {
    const csv = transactionsToCsv([tx, tx], lookup);
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines).toHaveLength(4); // en-tête + 2 lignes + fin vide
    expect(lines[0]).toBe(TRANSACTION_CSV_HEADERS.join(";"));
    expect(lines[3]).toBe("");
  });

  it("écrit montants en DA avec virgule décimale, statut en français, mention SANDBOX", () => {
    const row = transactionsToCsv([tx], lookup).slice(1).split("\r\n")[1];
    expect(row).toContain(";Partiellement remboursé;12500,50;DZD;500,00;230,00;CIB (sandbox);");
    expect(row.endsWith(";SANDBOX")).toBe(true);
  });

  it("neutralise et échappe les champs saisis par des utilisateurs", () => {
    const row = transactionsToCsv([tx], lookup).slice(1).split("\r\n")[1];
    expect(row).toContain("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(row).toContain('"Boutique; ""Test"""');
  });

  it("une liste vide ne contient que l'en-tête", () => {
    expect(transactionsToCsv([], lookup).slice(1).split("\r\n")).toEqual([TRANSACTION_CSV_HEADERS.join(";"), ""]);
  });

  it("nomme le fichier avec la date du jour (Alger)", () => {
    expect(csvFilename(NOW)).toBe("transactions-sandbox-2026-10-19.csv");
  });
});
