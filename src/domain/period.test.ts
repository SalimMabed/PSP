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

// --- Tests repris de l'application source (utils/date.test.ts) ---

describe("formatMonthLabel", () => {
  it("formate une clé année-mois en libellé français", () => {
    expect(formatMonthLabel("2026-09")).toBe("Septembre 2026");
    expect(formatMonthLabel("2026-01")).toBe("Janvier 2026");
  });
});

describe("shiftMonth", () => {
  it("avance et recule d'un mois", () => {
    expect(shiftMonth("2026-09", 1)).toBe("2026-10");
    expect(shiftMonth("2026-09", -1)).toBe("2026-08");
  });

  it("gère le changement d'année", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
});

describe("isInMonth", () => {
  it("vérifie qu'une date ISO appartient au mois donné", () => {
    expect(isInMonth("2026-09-21", "2026-09")).toBe(true);
    expect(isInMonth("2026-08-31", "2026-09")).toBe(false);
  });
});

describe("getLastNMonths", () => {
  it("renvoie n mois du plus ancien au plus récent, en incluant le mois de fin", () => {
    expect(getLastNMonths(3, "2026-09")).toEqual(["2026-07", "2026-08", "2026-09"]);
  });
});

// --- Ajouts : fuseau d'Alger (UTC+1), périodes, formats ---

describe("jours algérois (UTC+1, sans heure d'été)", () => {
  it("rattache 23h30 UTC au jour suivant en Algérie", () => {
    expect(dayKey("2026-10-18T23:30:00.000Z")).toBe("2026-10-19");
    expect(dayKey("2026-10-18T22:30:00.000Z")).toBe("2026-10-18");
  });

  it("démarre la journée à 23:00 UTC la veille", () => {
    const start = startOfAlgiersDay(Date.parse("2026-10-19T12:00:00Z"));
    expect(new Date(start).toISOString()).toBe("2026-10-18T23:00:00.000Z");
  });
});

describe("resolvePeriod", () => {
  const now = Date.parse("2026-10-19T14:00:00Z");

  it("« 7d » couvre aujourd'hui et les 6 jours précédents, et la période précédente la suit", () => {
    const p = resolvePeriod("7d", now);
    expect(p.range).not.toBeNull();
    expect(p.range!.to - p.range!.from + 1).toBe(7 * DAY_MS);
    expect(p.previous!.to).toBe(p.range!.from - 1);
    expect(p.previous!.to - p.previous!.from + 1).toBe(7 * DAY_MS);
  });

  it("« month » démarre au 1er du mois algérois", () => {
    const p = resolvePeriod("month", now);
    expect(dayKey(p.range!.from)).toBe("2026-10-01");
  });

  it("« all » n'a ni borne ni période précédente", () => {
    const p = resolvePeriod("all", now);
    expect(p.range).toBeNull();
    expect(p.previous).toBeNull();
  });

  it("inRange inclut les bornes et accepte une plage nulle", () => {
    const { range } = resolvePeriod("today", now);
    expect(inRange("2026-10-19T08:00:00Z", range)).toBe(true);
    expect(inRange("2026-10-18T10:00:00Z", range)).toBe(false);
    expect(inRange("1999-01-01T00:00:00Z", null)).toBe(true);
  });
});

describe("formats", () => {
  it("formate les dates à l'heure d'Alger", () => {
    expect(formatDate("2026-10-18T23:30:00Z")).toBe("19/10/2026");
    expect(formatDateTime("2026-10-19T09:05:00Z")).toBe("19/10/2026 10:05");
  });

  it("abrège les mois", () => {
    expect(formatMonthShort("2026-09")).toBe("sept.");
    expect(formatMonthShort("2026-06")).toBe("juin");
  });

  it("formate l'ancienneté relative", () => {
    const now = Date.parse("2026-10-19T12:00:00Z");
    expect(formatRelative("2026-10-19T11:59:40Z", now)).toBe("à l'instant");
    expect(formatRelative("2026-10-19T11:15:00Z", now)).toBe("il y a 45 min");
    expect(formatRelative("2026-10-19T07:00:00Z", now)).toBe("il y a 5 h");
    expect(formatRelative("2026-10-16T12:00:00Z", now)).toBe("il y a 3 j");
  });
});
