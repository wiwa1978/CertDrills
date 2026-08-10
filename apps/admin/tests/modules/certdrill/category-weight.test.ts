import { describe, expect, it } from "vitest";

import { formatCategoryWeight } from "@/modules/certdrill/category-weight";

describe("formatCategoryWeight", () => {
  it("shows persisted exact and ranged blueprint weights", () => {
    expect(formatCategoryWeight({ weightPct: "25.00", weightMinPct: "25.00", weightMaxPct: "25.00" })).toBe("25%");
    expect(formatCategoryWeight({ weightPct: null, weightMinPct: "20.00", weightMaxPct: "25.00" })).toBe("20–25%");
  });

  it("supports legacy exact weights and missing weights", () => {
    expect(formatCategoryWeight({ weightPct: "30.00" })).toBe("30%");
    expect(formatCategoryWeight({ weightPct: null })).toBe("-");
  });
});
