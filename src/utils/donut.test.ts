import { describe, expect, it } from "vitest";
import { computeBreakdown, computeDonutSegments, DONUT_CIRCUMFERENCE, type DonutItem } from "./donut";

// Tests carried over from the source application (expense categories) and adapted to generic items.
const ITEMS: DonutItem[] = [
  { key: "housing", label: "Housing", color: "#00918B" },
  { key: "food", label: "Food", color: "#B95C3A" },
  { key: "transport", label: "Transport", color: "#467AC6" },
  { key: "other", label: "Other", color: "#6E861B" },
];

describe("computeBreakdown", () => {
  it("computes the percentages from the totals per key", () => {
    const totals = { housing: 45000, food: 28500, transport: 12000 };
    const breakdown = computeBreakdown(ITEMS, totals);

    const housing = breakdown.find((b) => b.item.key === "housing")!;
    expect(housing.total).toBe(45000);
    expect(housing.percent).toBe(53); // 45000 / 85500 ≈ 52.6% rounded to 53

    const other = breakdown.find((b) => b.item.key === "other")!;
    expect(other.total).toBe(0);
    expect(other.percent).toBe(0);
  });

  it("sorts the entries by decreasing amount", () => {
    const totals = { transport: 100, housing: 500, food: 300 };
    const breakdown = computeBreakdown(ITEMS, totals);
    const order = breakdown.filter((b) => b.total > 0).map((b) => b.item.key);
    expect(order).toEqual(["housing", "food", "transport"]);
  });

  it("does not divide by zero when there is no amount", () => {
    const breakdown = computeBreakdown(ITEMS, {});
    expect(breakdown.every((b) => b.percent === 0)).toBe(true);
  });
});

describe("computeDonutSegments", () => {
  it("ignores zero entries and only returns the active segments", () => {
    const breakdown = computeBreakdown(ITEMS, { housing: 100 });
    const segments = computeDonutSegments(breakdown);
    expect(segments).toHaveLength(1);
    expect(segments[0].item.key).toBe("housing");
  });

  it("the first segment starts with no offset and covers its percentage of the circumference", () => {
    const breakdown = computeBreakdown(ITEMS, { housing: 50, food: 50 });
    const segments = computeDonutSegments(breakdown);
    expect(segments[0].dashOffset).toBe(-0);

    const [length] = segments[0].dashArray.split(" ").map(Number);
    expect(length).toBeCloseTo((segments[0].percent / 100) * DONUT_CIRCUMFERENCE, 1);
  });

  it("the following segments are offset cumulatively", () => {
    const breakdown = computeBreakdown(ITEMS, { housing: 60, food: 40 });
    const segments = computeDonutSegments(breakdown);
    const firstPercent = segments[0].percent;
    const expectedOffset = -((firstPercent / 100) * DONUT_CIRCUMFERENCE);
    expect(segments[1].dashOffset).toBeCloseTo(expectedOffset, 1);
  });

  it("(addition) the segments exactly cover the circumference despite rounding", () => {
    const breakdown = computeBreakdown(ITEMS, { housing: 1, food: 1, transport: 1 }); // 3 × 33%
    const segments = computeDonutSegments(breakdown);
    const covered = segments.reduce((acc, s) => acc + Number(s.dashArray.split(" ")[0]), 0);
    expect(covered).toBeCloseTo(DONUT_CIRCUMFERENCE, 1);
  });
});
