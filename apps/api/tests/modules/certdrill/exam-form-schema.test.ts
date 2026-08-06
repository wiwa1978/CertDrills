import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { certdrillExamForms } from "@platform/platform-db";

describe("CertDrill exam form schema", () => {
  it("persists generated assignment metadata", () => {
    const columns = getTableColumns(certdrillExamForms);

    expect(Object.keys(columns)).toEqual(
      expect.arrayContaining([
        "targetQuestionCount",
        "assignmentVersion",
        "allocationSnapshot",
        "generatedAt",
      ]),
    );
  });
});
