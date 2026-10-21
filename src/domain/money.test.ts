import { describe, expect, it } from "vitest";
import {
  applyBps,
  formatBps,
  formatDA,
  formatDecimalComma,
  formatPercent,
  MAX_PAYMENT,
  MIN_PAYMENT,
  minorToInput,
  parseAmountInput,
  paymentAmountError,
  prorate,
} from "./money";

describe("parseAmountInput", () => {
  it.each([
    ["1000", 100_000],
    ["12 500", 1_250_000],
    ["12 500,50", 1_250_050],
    ["12500.5", 1_250_050],
    ["0,05", 5],
    ["  75 ", 7_500],
    ["1200,", 120_000],
  ])("accepts %j → %i centimes", (input, minor) => {
    expect(parseAmountInput(input)).toEqual({ ok: true, minor });
  });

  it("introduces no floating-point error (19.99 DA)", () => {
    expect(parseAmountInput("19,99")).toEqual({ ok: true, minor: 1999 });
    expect(parseAmountInput("0.29")).toEqual({ ok: true, minor: 29 });
  });

  it.each(["", "   ", "abc", "12a", "1,2,3", "1e5", "--5", "12 500 DA"])("rejects %j", (input) => {
    expect(parseAmountInput(input).ok).toBe(false);
  });

  it("rejects zero, negatives and more than 2 decimal places", () => {
    expect(parseAmountInput("0")).toMatchObject({ ok: false });
    expect(parseAmountInput("0,00")).toMatchObject({ ok: false });
    expect(parseAmountInput("-100")).toMatchObject({ ok: false, error: expect.stringContaining("positive") });
    expect(parseAmountInput("−100")).toMatchObject({ ok: false });
    expect(parseAmountInput("10,555")).toMatchObject({ ok: false, error: expect.stringContaining("decimal") });
  });

  it("rejects absurd amounts (more than 9 digits)", () => {
    expect(parseAmountInput("1234567890")).toMatchObject({ ok: false });
  });
});

describe("paymentAmountError", () => {
  it("applies the explicit sandbox limits", () => {
    expect(paymentAmountError(MIN_PAYMENT)).toBeNull();
    expect(paymentAmountError(MAX_PAYMENT)).toBeNull();
    expect(paymentAmountError(MIN_PAYMENT - 1)).toMatch(/minimum/i);
    expect(paymentAmountError(MAX_PAYMENT + 1)).toMatch(/maximum/i);
  });

  it("rejects invalid values (NaN, floats, negatives, zero)", () => {
    for (const bad of [NaN, Infinity, 0, -5, 100.5]) {
      expect(paymentAmountError(bad)).not.toBeNull();
    }
  });
});

describe("formatDA", () => {
  it("formats with French separators and DA", () => {
    expect(formatDA(1_250_000)).toBe("12 500 DA");
    expect(formatDA(1_250_050)).toBe("12 500,50 DA");
    expect(formatDA(0)).toBe("0 DA");
    expect(formatDA(100_000_000)).toBe("1 000 000 DA");
  });

  it("handles options and negative amounts", () => {
    expect(formatDA(1_250_000, { currency: false })).toBe("12 500");
    expect(formatDA(1_250_000, { decimals: "always" })).toBe("12 500,00 DA");
    expect(formatDA(-5_000)).toBe("−50 DA");
    expect(formatDA(5_000, { signed: true })).toBe("+50 DA");
    expect(formatDA(5, { decimals: "auto" })).toBe("0,05 DA");
  });
});

describe("conversions and calculations", () => {
  it("formatDecimalComma / minorToInput", () => {
    expect(formatDecimalComma(1_250_050)).toBe("12500,50");
    expect(formatDecimalComma(5)).toBe("0,05");
    expect(formatDecimalComma(-1_050)).toBe("-10,50");
    expect(minorToInput(1_250_000)).toBe("12500");
    expect(minorToInput(1_250_050)).toBe("12500,50");
  });

  it("applyBps rounds to the centime", () => {
    expect(applyBps(100_000, 190)).toBe(1_900); // 1.90% of 1,000 DA = 19 DA
    expect(applyBps(333, 190)).toBe(6); // 6.327 → 6
    expect(applyBps(0, 190)).toBe(0);
  });

  it("prorate splits proportionally and stays bounded", () => {
    expect(prorate(1_900, 50_000, 100_000)).toBe(950);
    expect(prorate(1_900, 100_000, 100_000)).toBe(1_900);
    expect(prorate(1_900, 10, 0)).toBe(0);
  });

  it("formats bps and percentages", () => {
    expect(formatBps(190)).toBe("1,9 %");
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(97.3)).toBe("97,3 %");
  });
});
