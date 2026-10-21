import { describe, expect, it } from "vitest";
import { buildSeries, summarize, variation, volumeByMethod } from "./aggregates";
import { resolvePeriod, DAY_MS } from "./period";
import { makeTx, NOW } from "@/test/factories";

describe("summarize", () => {
  const txs = [
    makeTx({ status: "succeeded", amount: 100_000 }),
    makeTx({ status: "succeeded", amount: 200_000 }),
    makeTx({ status: "partially_refunded", amount: 300_000, refunded: 100_000 }),
    makeTx({ status: "refunded", amount: 50_000, refunded: 50_000 }),
    makeTx({ status: "failed", amount: 999_999, paidAt: undefined, fee: 0 }),
    makeTx({ status: "pending", amount: 40_000, paidAt: undefined, fee: 0 }),
    makeTx({ status: "created", amount: 40_000, paidAt: undefined, fee: 0, method: null }),
    makeTx({ status: "cancelled", amount: 40_000, paidAt: undefined, fee: 0 }),
  ];
  const s = summarize(txs);

  it("counts transactions by status", () => {
    expect(s.count).toBe(8);
    expect(s.byStatus).toMatchObject({ succeeded: 2, partially_refunded: 1, refunded: 1, failed: 1, pending: 1, created: 1, cancelled: 1 });
    expect(Object.values(s.byStatus).reduce((a, b) => a + b, 0)).toBe(s.count);
  });

  it("volume only counts collected payments (including those refunded afterwards)", () => {
    expect(s.volume).toBe(650_000);
    expect(s.capturedCount).toBe(4);
    expect(s.refundedAmount).toBe(150_000);
    expect(s.netVolume).toBe(500_000);
    expect(s.averageTicket).toBe(162_500);
  });

  it("groups into open / failed / cancelled / refunded", () => {
    expect(s).toMatchObject({ openCount: 2, failedCount: 1, cancelledCount: 1, refundedCount: 2 });
  });

  it("success rate = collected / (collected + failed), excluding open and cancelled", () => {
    expect(s.successRate).toBe(80); // 4 / (4 + 1)
  });

  it("handles the empty set without dividing by zero", () => {
    const empty = summarize([]);
    expect(empty).toMatchObject({ count: 0, volume: 0, averageTicket: 0, successRate: null, netVolume: 0 });
    expect(summarize([makeTx({ status: "pending", paidAt: undefined })]).successRate).toBeNull();
  });
});

describe("variation", () => {
  it("computes the relative variation rounded to 0.1%", () => {
    expect(variation(120, 100)).toBe(20);
    expect(variation(50, 100)).toBe(-50);
    expect(variation(103, 100)).toBe(3);
    expect(variation(1, 3)).toBe(-66.7);
  });
  it("returns null if the reference is zero", () => {
    expect(variation(10, 0)).toBeNull();
  });
});

describe("buildSeries", () => {
  it("splits 7 days into 7 daily buckets without gaps and sums the amounts per group", () => {
    const period = resolvePeriod("7d", NOW);
    const txs = [
      makeTx({ createdAt: new Date(NOW - 1 * 3600_000).toISOString(), status: "succeeded", amount: 100_000 }),
      makeTx({ createdAt: new Date(NOW - 2 * 3600_000).toISOString(), status: "failed", amount: 30_000 }),
      makeTx({ createdAt: new Date(NOW - 3 * DAY_MS).toISOString(), status: "pending", amount: 20_000 }),
    ];
    const { granularity, buckets } = buildSeries(txs, period.range, NOW);
    expect(granularity).toBe("day");
    expect(buckets).toHaveLength(7);
    const last = buckets.at(-1)!;
    expect(last.captured).toEqual({ count: 1, amount: 100_000 });
    expect(last.failed).toEqual({ count: 1, amount: 30_000 });
    const totalCount = buckets.reduce((a, b) => a + b.captured.count + b.open.count + b.failed.count + b.cancelled.count, 0);
    expect(totalCount).toBe(3);
  });

  it("switches to weeks for 90 days and keeps the total", () => {
    const period = resolvePeriod("90d", NOW);
    const txs = Array.from({ length: 20 }, (_, i) =>
      makeTx({ createdAt: new Date(NOW - i * 4 * DAY_MS).toISOString(), status: "succeeded", amount: 10_000 })
    );
    const { granularity, buckets } = buildSeries(txs, period.range, NOW);
    expect(granularity).toBe("week");
    expect(buckets.length).toBeGreaterThanOrEqual(12);
    expect(buckets.reduce((a, b) => a + b.captured.amount, 0)).toBe(200_000);
    for (let i = 1; i < buckets.length; i++) expect(buckets[i].from).toBeGreaterThan(buckets[i - 1].from);
  });

  it("handles the absence of transactions and the \"all time\" period", () => {
    expect(buildSeries([], null, NOW).buckets.length).toBeGreaterThanOrEqual(1);
    const old = makeTx({ createdAt: new Date(NOW - 300 * DAY_MS).toISOString() });
    const { granularity } = buildSeries([old], null, NOW);
    expect(granularity).toBe("month");
  });
});

describe("volumeByMethod", () => {
  it("aggregates the collected volume by method, sorted, without uncollected payments", () => {
    const slices = volumeByMethod([
      makeTx({ method: "cib_sandbox", amount: 300_000 }),
      makeTx({ method: "cib_sandbox", amount: 100_000 }),
      makeTx({ method: "edahabia_sandbox", amount: 100_000 }),
      makeTx({ method: "wallet_sandbox", amount: 999, status: "failed" }),
    ]);
    expect(slices.map((s) => s.key)).toEqual(["cib_sandbox", "edahabia_sandbox"]);
    expect(slices[0]).toMatchObject({ total: 400_000, percent: 80 });
  });
});
