import { describe, expect, it } from "vitest";
import { computeBreakdown, computeDonutSegments, DONUT_CIRCUMFERENCE, type DonutItem } from "./donut";

// Tests repris de l'application source (catégories de dépenses) et adaptés aux éléments génériques.
const ITEMS: DonutItem[] = [
  { key: "logement", label: "Logement", color: "#00918B" },
  { key: "alimentation", label: "Alimentation", color: "#B95C3A" },
  { key: "transport", label: "Transport", color: "#467AC6" },
  { key: "autres", label: "Autres", color: "#6E861B" },
];

describe("computeBreakdown", () => {
  it("calcule les pourcentages à partir des totaux par clé", () => {
    const totals = { logement: 45000, alimentation: 28500, transport: 12000 };
    const breakdown = computeBreakdown(ITEMS, totals);

    const logement = breakdown.find((b) => b.item.key === "logement")!;
    expect(logement.total).toBe(45000);
    expect(logement.percent).toBe(53); // 45000 / 85500 ≈ 52,6 % arrondi à 53

    const autres = breakdown.find((b) => b.item.key === "autres")!;
    expect(autres.total).toBe(0);
    expect(autres.percent).toBe(0);
  });

  it("trie les entrées par montant décroissant", () => {
    const totals = { transport: 100, logement: 500, alimentation: 300 };
    const breakdown = computeBreakdown(ITEMS, totals);
    const order = breakdown.filter((b) => b.total > 0).map((b) => b.item.key);
    expect(order).toEqual(["logement", "alimentation", "transport"]);
  });

  it("ne divise pas par zéro quand il n'y a aucun montant", () => {
    const breakdown = computeBreakdown(ITEMS, {});
    expect(breakdown.every((b) => b.percent === 0)).toBe(true);
  });
});

describe("computeDonutSegments", () => {
  it("ignore les entrées à zéro et ne renvoie que les segments actifs", () => {
    const breakdown = computeBreakdown(ITEMS, { logement: 100 });
    const segments = computeDonutSegments(breakdown);
    expect(segments).toHaveLength(1);
    expect(segments[0].item.key).toBe("logement");
  });

  it("le premier segment part sans décalage et couvre son pourcentage de la circonférence", () => {
    const breakdown = computeBreakdown(ITEMS, { logement: 50, alimentation: 50 });
    const segments = computeDonutSegments(breakdown);
    expect(segments[0].dashOffset).toBe(-0);

    const [length] = segments[0].dashArray.split(" ").map(Number);
    expect(length).toBeCloseTo((segments[0].percent / 100) * DONUT_CIRCUMFERENCE, 1);
  });

  it("les segments suivants sont décalés cumulativement", () => {
    const breakdown = computeBreakdown(ITEMS, { logement: 60, alimentation: 40 });
    const segments = computeDonutSegments(breakdown);
    const firstPercent = segments[0].percent;
    const expectedOffset = -((firstPercent / 100) * DONUT_CIRCUMFERENCE);
    expect(segments[1].dashOffset).toBeCloseTo(expectedOffset, 1);
  });

  it("(ajout) la somme des segments couvre exactement la circonférence malgré les arrondis", () => {
    const breakdown = computeBreakdown(ITEMS, { logement: 1, alimentation: 1, transport: 1 }); // 3 × 33 %
    const segments = computeDonutSegments(breakdown);
    const covered = segments.reduce((acc, s) => acc + Number(s.dashArray.split(" ")[0]), 0);
    expect(covered).toBeCloseTo(DONUT_CIRCUMFERENCE, 1);
  });
});
