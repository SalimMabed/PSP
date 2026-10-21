import { describe, expect, it } from "vitest";
import {
  dayKey,
  formatDate,
  formatDateTime,
  formatMonthLabel,
  formatMonthShort,
  formatRelative,
  getLastNMonths,
  inRange,
  isInMonth,
  resolvePeriod,
  shiftMonth,
  startOfAlgiersDay,
  DAY_MS,
} from "./period";

// --- Tests carried over from the source application (utils/date.test.ts), month names now in English ---

describe("formatMonthLabel", () => {
  it("formats a year-month key into an English label", () => {
    expect(formatMonthLabel("2026-09")).toBe("September 2026");
    expect(formatMonthLabel("2026-01")).toBe("January 2026");
  });
});

describe("shiftMonth", () => {
  it("moves forward and back by one month", () => {
    expect(shiftMonth("2026-09", 1)).toBe("2026-10");
    expect(shiftMonth("2026-09", -1)).toBe("2026-08");
  });

  it("handles the year change", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
});

describe("isInMonth", () => {
  it("checks that an ISO date belongs to the given month", () => {
    expect(isInMonth("2026-09-21", "2026-09")).toBe(true);
    expect(isInMonth("2026-08-31", "2026-09")).toBe(false);
  });
});

describe("getLastNMonths", () => {
  it("returns n months from oldest to most recent, including the end month", () => {
    expect(getLastNMonths(3, "2026-09")).toEqual(["2026-07", "2026-08", "2026-09"]);
  });
});

// --- Additions: Algiers time zone (UTC+1), periods, formats ---

describe("Algiers days (UTC+1, no daylight saving time)", () => {
  it("assigns 23:30 UTC to the next day in Algeria", () => {
    expect(dayKey("2026-10-18T23:30:00.000Z")).toBe("2026-10-19");
    expect(dayKey("2026-10-18T22:30:00.000Z")).toBe("2026-10-18");
  });

  it("starts the day at 23:00 UTC the day before", () => {
    const start = startOfAlgiersDay(Date.parse("2026-10-19T12:00:00Z"));
    expect(new Date(start).toISOString()).toBe("2026-10-18T23:00:00.000Z");
  });
});

describe("resolvePeriod", () => {
  const now = Date.parse("2026-10-19T14:00:00Z");

  it("\"7d\" covers today and the previous 6 days, and the previous period follows it", () => {
    const p = resolvePeriod("7d", now);
    expect(p.range).not.toBeNull();
    expect(p.range!.to - p.range!.from + 1).toBe(7 * DAY_MS);
    expect(p.previous!.to).toBe(p.range!.from - 1);
    expect(p.previous!.to - p.previous!.from + 1).toBe(7 * DAY_MS);
  });

  it("\"month\" starts on the 1st of the Algiers month", () => {
    const p = resolvePeriod("month", now);
    expect(dayKey(p.range!.from)).toBe("2026-10-01");
  });

  it("\"all\" has neither bound nor previous period", () => {
    const p = resolvePeriod("all", now);
    expect(p.range).toBeNull();
    expect(p.previous).toBeNull();
  });

  it("inRange includes the bounds and accepts a null range", () => {
    const { range } = resolvePeriod("today", now);
    expect(inRange("2026-10-19T08:00:00Z", range)).toBe(true);
    expect(inRange("2026-10-18T10:00:00Z", range)).toBe(false);
    expect(inRange("1999-01-01T00:00:00Z", null)).toBe(true);
  });
});

describe("formats", () => {
  it("formats dates in Algiers time", () => {
    expect(formatDate("2026-10-18T23:30:00Z")).toBe("19/10/2026");
    expect(formatDateTime("2026-10-19T09:05:00Z")).toBe("19/10/2026 10:05");
  });

  it("abbreviates months", () => {
    expect(formatMonthShort("2026-09")).toBe("Sep");
    expect(formatMonthShort("2026-06")).toBe("Jun");
  });

  it("formats the relative age", () => {
    const now = Date.parse("2026-10-19T12:00:00Z");
    expect(formatRelative("2026-10-19T11:59:40Z", now)).toBe("just now");
    expect(formatRelative("2026-10-19T11:15:00Z", now)).toBe("45 min ago");
    expect(formatRelative("2026-10-19T07:00:00Z", now)).toBe("5 h ago");
    expect(formatRelative("2026-10-16T12:00:00Z", now)).toBe("3 d ago");
  });
});
