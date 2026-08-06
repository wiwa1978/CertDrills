import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  blueprintProposalJsonSchema,
  blueprintProposalSchema,
  validateBlueprintProposal,
} from "../../../src/modules/certdrill/blueprint-proposal";

function createCategory(overrides: Partial<{
  code: string;
  name: string;
  parentCode: string | null;
  weightPct: number | null;
  sortOrder: number;
  evidence: Array<{ excerpt: string; location: string | null }>;
}> = {}) {
  return {
    code: " D1 ",
    name: " Domain 1 ",
    parentCode: null,
    weightPct: 100,
    sortOrder: 0,
    evidence: [],
    ...overrides,
  };
}

function createProposal(overrides: Partial<{
  confidence: "high" | "medium" | "low";
  warnings: string[];
  categories: unknown[];
}> = {}) {
  return {
    confidence: "high" as const,
    warnings: [],
    categories: [createCategory()],
    ...overrides,
  };
}

function expectValidationError(value: unknown) {
  try {
    validateBlueprintProposal(value);
    throw new Error("Expected validateBlueprintProposal to throw.");
  } catch (error) {
    expect(error).toBeInstanceOf(z.ZodError);
    return error as z.ZodError;
  }
}

function issueMessages(error: z.ZodError) {
  return error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
}

describe("CertDrill blueprint proposal validation", () => {
  it("normalizes codes, trims schema strings, preserves order, and applies defaults", () => {
    const result = validateBlueprintProposal(createProposal({
      confidence: "medium",
      warnings: ["  Preserve vendor terminology.  "],
      categories: [
        createCategory({ code: " d1 ", name: " Domain 1 ", weightPct: 60, sortOrder: 2 }),
        createCategory({
          code: " d1-a ",
          name: " Task 1 ",
          parentCode: " d1 ",
          weightPct: null,
          sortOrder: 3,
          evidence: [{ excerpt: " page 14 objective ", location: " section 1.2 " }],
        }),
        createCategory({ code: " d2 ", name: " Domain 2 ", weightPct: 40, sortOrder: 1 }),
      ],
    }));

    expect(result).toEqual({
      confidence: "medium",
      warnings: ["Preserve vendor terminology."],
      categories: [
        {
          code: "D1",
          name: "Domain 1",
          parentCode: null,
          weightPct: 60,
          sortOrder: 2,
          evidence: [],
        },
        {
          code: "D1-A",
          name: "Task 1",
          parentCode: "D1",
          weightPct: null,
          sortOrder: 3,
          evidence: [{ excerpt: "page 14 objective", location: "section 1.2" }],
        },
        {
          code: "D2",
          name: "Domain 2",
          parentCode: null,
          weightPct: 40,
          sortOrder: 1,
          evidence: [],
        },
      ],
    });
  });

  it("rejects unknown top-level and nested AI-output fields", () => {
    const parsed = blueprintProposalSchema.safeParse({
      confidence: "high",
      warnings: [],
      categories: [
        {
          code: "D1",
          name: "Domain 1",
          parentCode: null,
          weightPct: 100,
          sortOrder: 0,
          evidence: [{ excerpt: "excerpt", location: null, extra: true }],
          extra: true,
        },
      ],
      extra: true,
    });

    expect(parsed.success).toBe(false);

    if (parsed.success) {
      return;
    }

    expect(parsed.error.issues.map((issue) => issue.path.join("."))).toEqual([
      "categories.0.evidence.0",
      "categories.0",
      "",
    ]);
    expect(parsed.error.issues.every((issue) => issue.code === "unrecognized_keys")).toBe(true);
  });

  it("rejects empty category codes after trimming", () => {
    expect(blueprintProposalSchema.safeParse(createProposal({
      categories: [createCategory({ code: "   " })],
    })).success).toBe(false);
  });

  it("rejects duplicate category codes after normalization", () => {
    const error = expectValidationError(createProposal({
      categories: [
        createCategory({ code: " d1 ", weightPct: 60 }),
        createCategory({ code: "D1", name: "Domain 1 duplicate", weightPct: 40, sortOrder: 1 }),
      ],
    }));

    expect(issueMessages(error)).toEqual([
      "categories.1.code: Category code must be unique after normalization.",
    ]);
  });

  it("rejects categories whose parent code does not exist", () => {
    const error = expectValidationError(createProposal({
      categories: [
        createCategory({ code: "D1", weightPct: 100 }),
        createCategory({ code: "D1-A", parentCode: "missing", weightPct: null, sortOrder: 1 }),
      ],
    }));

    expect(issueMessages(error)).toEqual([
      "categories.1.parentCode: Parent category must reference an existing category code.",
    ]);
  });

  it("rejects categories that reference themselves as a parent", () => {
    const error = expectValidationError(createProposal({
      categories: [
        createCategory({ code: "D1", parentCode: "d1", weightPct: null }),
      ],
    }));

    expect(issueMessages(error)).toEqual([
      "categories.0.parentCode: Category cannot be its own parent.",
    ]);
  });

  it("rejects direct parent cycles", () => {
    const error = expectValidationError(createProposal({
      categories: [
        createCategory({ code: "D1", parentCode: "D2", weightPct: null }),
        createCategory({ code: "D2", parentCode: "D1", weightPct: null, sortOrder: 1 }),
      ],
    }));

    expect(issueMessages(error)).toEqual([
      "categories.0.parentCode: Category hierarchy must not contain cycles.",
      "categories.1.parentCode: Category hierarchy must not contain cycles.",
    ]);
  });

  it("rejects indirect parent cycles", () => {
    const error = expectValidationError(createProposal({
      categories: [
        createCategory({ code: "D1", parentCode: "D3", weightPct: null }),
        createCategory({ code: "D2", parentCode: "D1", weightPct: null, sortOrder: 1 }),
        createCategory({ code: "D3", parentCode: "D2", weightPct: null, sortOrder: 2 }),
      ],
    }));

    expect(issueMessages(error)).toEqual([
      "categories.0.parentCode: Category hierarchy must not contain cycles.",
      "categories.1.parentCode: Category hierarchy must not contain cycles.",
      "categories.2.parentCode: Category hierarchy must not contain cycles.",
    ]);
  });

  it("rejects non-null child category weights", () => {
    const error = expectValidationError(createProposal({
      categories: [
        createCategory({ code: "D1", weightPct: 100 }),
        createCategory({ code: "D1-A", parentCode: "D1", weightPct: 25, sortOrder: 1 }),
      ],
    }));

    expect(issueMessages(error)).toEqual([
      "categories.1.weightPct: Child categories must not define weightPct.",
    ]);
  });

  it("rejects out-of-range weights and non-integer sort orders", () => {
    expect(blueprintProposalSchema.safeParse(createProposal({
      categories: [createCategory({ weightPct: -1 })],
    })).success).toBe(false);
    expect(blueprintProposalSchema.safeParse(createProposal({
      categories: [createCategory({ weightPct: 101 })],
    })).success).toBe(false);
    expect(blueprintProposalSchema.safeParse(createProposal({
      categories: [createCategory({ sortOrder: 1.5 })],
    })).success).toBe(false);
  });

  it("preserves missing top-level weights as null and appends one deterministic warning", () => {
    const result = validateBlueprintProposal(createProposal({
      categories: [
        createCategory({ code: "D1", weightPct: null }),
        createCategory({ code: "D2", weightPct: 40, sortOrder: 1 }),
        createCategory({ code: "D3", weightPct: null, sortOrder: 2 }),
      ],
    }));

    expect(result.categories.map((category) => category.weightPct)).toEqual([null, 40, null]);
    expect(result.warnings).toEqual([
      "One or more top-level category weights are missing; weightPct values were preserved as null.",
    ]);
  });

  it("appends a deterministic warning when all top-level weights are known but total is not 100", () => {
    const result = validateBlueprintProposal(createProposal({
      categories: [
        createCategory({ code: "D1", weightPct: 60 }),
        createCategory({ code: "D2", weightPct: 30, sortOrder: 1 }),
      ],
    }));

    expect(result.warnings).toEqual([
      "Top-level category weights total 90.00 instead of 100.00.",
    ]);
  });

  it("does not append a generated warning when top-level weights total 100 within tolerance", () => {
    const result = validateBlueprintProposal(createProposal({
      warnings: ["  Already noted.  "],
      categories: [
        createCategory({ code: "D1", weightPct: 33.33 }),
        createCategory({ code: "D2", weightPct: 33.33, sortOrder: 1 }),
        createCategory({ code: "D3", weightPct: 33.34, sortOrder: 2 }),
      ],
    }));

    expect(result.warnings).toEqual(["Already noted."]);
  });

  it("preserves trimmed warnings and avoids duplicate generated warning strings", () => {
    const result = validateBlueprintProposal(createProposal({
      warnings: [
        "  Keep the intro concise.  ",
        "  One or more top-level category weights are missing; weightPct values were preserved as null.  ",
      ],
      categories: [
        createCategory({ code: "D1", weightPct: null }),
        createCategory({ code: "D2", weightPct: null, sortOrder: 1 }),
      ],
    }));

    expect(result.warnings).toEqual([
      "Keep the intro concise.",
      "One or more top-level category weights are missing; weightPct values were preserved as null.",
    ]);
  });

  it("exports a strict JSON schema suitable for structured output", () => {
    expect(blueprintProposalJsonSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["confidence", "warnings", "categories"],
      properties: {
        confidence: {
          type: "string",
          enum: ["high", "medium", "low"],
        },
        warnings: {
          type: "array",
          default: [],
          items: { type: "string", minLength: 1 },
        },
        categories: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["code", "name", "parentCode", "weightPct", "sortOrder", "evidence"],
          },
        },
      },
    });
  });
});
