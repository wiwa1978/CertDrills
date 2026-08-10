import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { certdrillExamCategories } from "@platform/platform-db";

describe("CertDrill category weight range schema", () => {
  it("stores optional minimum and maximum percentages alongside exact weights", () => {
    const config = getTableConfig(certdrillExamCategories);
    const columns = Object.fromEntries(config.columns.map((column) => [column.name, column]));

    expect(columns.weight_pct).toMatchObject({ columnType: "PgNumeric", notNull: false });
    expect(columns.weight_min_pct).toMatchObject({ columnType: "PgNumeric", notNull: false });
    expect(columns.weight_max_pct).toMatchObject({ columnType: "PgNumeric", notNull: false });
  });
});
