import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  blueprintProposalJsonSchema,
  blueprintProposalSchema,
  validateBlueprintProposal,
} from "../../../src/modules/certdrill/blueprint-proposal";

type CategoryOverride = Partial<{
  code: string;
  name: string;
  parentCode: string | null;
  weightPct: number | null;
  weightMinPct: number | null;
  weightMaxPct: number | null;
  sortOrder: number;
  evidence: Array<{ excerpt: string; location: string | null }>;
}>;

function buildWeightedHeadingEvidence(
  name: string,
  weightPct: number | null,
  weightMinPct: number | null,
  weightMaxPct: number | null,
) {
  const trimmedName = name.trim();

  if (weightPct !== null) {
    return `${trimmedName} (${weightPct}%)`;
  }

  return `${trimmedName} (${weightMinPct}\u2013${weightMaxPct}%)`;
}

function createCategory(overrides: CategoryOverride = {}) {
  const code = overrides.code ?? " D1 ";
  const name = overrides.name ?? " Author and manage workflows ";
  const parentCode = overrides.parentCode ?? null;
  const weightPct = "weightPct" in overrides ? overrides.weightPct ?? null : 20;
  const weightMinPct = "weightMinPct" in overrides ? overrides.weightMinPct ?? null : weightPct;
  const weightMaxPct = "weightMaxPct" in overrides ? overrides.weightMaxPct ?? null : weightPct;
  const sortOrder = overrides.sortOrder ?? 0;
  const evidence = overrides.evidence ?? [{ excerpt: buildWeightedHeadingEvidence(name, weightPct, weightMinPct, weightMaxPct), location: null }];

  return {
    code,
    name,
    parentCode,
    weightPct,
    weightMinPct,
    weightMaxPct,
    sortOrder,
    evidence,
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

const unsupportedStructuredOutputKeywords = [
  "default",
  "minLength",
  "maxLength",
  "pattern",
  "format",
  "minimum",
  "maximum",
  "multipleOf",
  "minItems",
  "maxItems",
  "uniqueItems",
] as const;

function findSchemaKeywordPaths(value: unknown, keyword: string, path = "$"): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findSchemaKeywordPaths(item, keyword, `${path}[${index}]`));
  }

  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([entryKey, entryValue]) => (
      entryKey === keyword
        ? [path]
        : findSchemaKeywordPaths(entryValue, keyword, `${path}.${entryKey}`)
    ));
  }

  return [];
}

function findUnsupportedSchemaKeywords(value: unknown) {
  return Object.fromEntries(
    unsupportedStructuredOutputKeywords.map((keyword) => [keyword, findSchemaKeywordPaths(value, keyword)]),
  );
}

describe("CertDrill blueprint proposal validation", () => {
  it("accepts exact weighted heading categories and normalizes codes", () => {
    const result = validateBlueprintProposal(createProposal({
      confidence: "medium",
      warnings: ["  Preserve vendor terminology.  "],
      categories: [
        createCategory({
          code: " d1 ",
          name: " Author and manage workflows ",
          weightPct: 20,
          weightMinPct: 20,
          weightMaxPct: 20,
          evidence: [{ excerpt: " Author and manage workflows (20%) ", location: " section 1.2 " }],
        }),
      ],
    }));

    expect(result).toEqual({
      confidence: "medium",
      warnings: [
        "Preserve vendor terminology.",
        "Top-level category weights total 20.00 instead of 100.00.",
      ],
      categories: [
        {
          code: "D1",
          name: "Author and manage workflows",
          parentCode: null,
          weightPct: 20,
          weightMinPct: 20,
          weightMaxPct: 20,
          sortOrder: 0,
          evidence: [{ excerpt: "Author and manage workflows (20%)", location: "section 1.2" }],
        },
      ],
    });
  });

  it("accepts weighted heading ranges without midpoint conversion", () => {
    const result = validateBlueprintProposal(createProposal({
      categories: [
        createCategory({
          weightPct: null,
          weightMinPct: 20,
          weightMaxPct: 25,
          evidence: [{ excerpt: " Author and manage workflows (20\u201325%) ", location: null }],
        }),
      ],
    }));

    expect(result.categories).toEqual([
      {
        code: "D1",
        name: "Author and manage workflows",
        parentCode: null,
        weightPct: null,
        weightMinPct: 20,
        weightMaxPct: 25,
        sortOrder: 0,
        evidence: [{ excerpt: "Author and manage workflows (20\u201325%)", location: null }],
      },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("rejects unknown top-level and nested AI-output fields", () => {
    const parsed = blueprintProposalSchema.safeParse({
      confidence: "high",
      warnings: [],
      categories: [
        {
          code: "D1",
          name: "Author and manage workflows",
          parentCode: null,
          weightPct: 20,
          weightMinPct: 20,
          weightMaxPct: 20,
          sortOrder: 0,
          evidence: [{ excerpt: "Author and manage workflows (20%)", location: null, extra: true }],
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

  it("rejects categories missing required percentage range fields", () => {
    expect(blueprintProposalSchema.safeParse(createProposal({
      categories: [
        {
          code: "D1",
          name: "Author and manage workflows",
          parentCode: null,
          weightPct: 20,
          sortOrder: 0,
          evidence: [{ excerpt: "Author and manage workflows (20%)", location: null }],
        },
      ],
    })).success).toBe(false);
  });

  it("rejects empty category codes after trimming", () => {
    expect(blueprintProposalSchema.safeParse(createProposal({
      categories: [createCategory({ code: "   " })],
    })).success).toBe(false);
  });

  it("rejects duplicate category codes after normalization", () => {
    const error = expectValidationError(createProposal({
      categories: [
        createCategory({ code: " d1 " }),
        createCategory({ code: "D1", name: "Different domain", sortOrder: 1 }),
      ],
    }));

    expect(issueMessages(error)).toEqual([
      "categories.1.code: Category code must be unique after normalization.",
    ]);
  });

  it("rejects categories whose weights are all null", () => {
    const error = expectValidationError(createProposal({
      categories: [
        createCategory({
          weightPct: null,
          weightMinPct: null,
          weightMaxPct: null,
          evidence: [{ excerpt: "Author and manage workflows (20%)", location: null }],
        }),
      ],
    }));

    expect(issueMessages(error)).toEqual([
      "categories.0.weightPct: Category must define an exact percentage or percentage range.",
    ]);
  });

  it("rejects percentage ranges with a missing bound", () => {
    const error = expectValidationError(createProposal({
      categories: [
        createCategory({
          weightPct: null,
          weightMinPct: 20,
          weightMaxPct: null,
          evidence: [{ excerpt: "Author and manage workflows (20%)", location: null }],
        }),
      ],
    }));

    expect(issueMessages(error)).toEqual([
      "categories.0.weightPct: Percentage range requires both minimum and maximum values.",
    ]);
  });

  it("rejects percentage ranges whose minimum exceeds their maximum", () => {
    const error = expectValidationError(createProposal({
      categories: [
        createCategory({
          weightPct: null,
          weightMinPct: 25,
          weightMaxPct: 20,
          evidence: [{ excerpt: "Author and manage workflows (25\u201320%)", location: null }],
        }),
      ],
    }));

    expect(issueMessages(error)).toEqual([
      "categories.0.weightMinPct: Percentage range minimum must not exceed maximum.",
    ]);
  });

  it("rejects out-of-range weights and non-integer sort orders", () => {
    expect(blueprintProposalSchema.safeParse(createProposal({
      categories: [createCategory({ weightPct: -1, weightMinPct: -1, weightMaxPct: -1 })],
    })).success).toBe(false);
    expect(blueprintProposalSchema.safeParse(createProposal({
      categories: [createCategory({ weightPct: 101, weightMinPct: 101, weightMaxPct: 101 })],
    })).success).toBe(false);
    expect(blueprintProposalSchema.safeParse(createProposal({
      categories: [createCategory({ weightPct: null, weightMinPct: 0, weightMaxPct: 101 })],
    })).success).toBe(false);
    expect(blueprintProposalSchema.safeParse(createProposal({
      categories: [createCategory({ sortOrder: 1.5 })],
    })).success).toBe(false);
  });

  it("rejects exact percentages that differ from the range bounds", () => {
    const error = expectValidationError(createProposal({
      categories: [
        createCategory({
          weightPct: 20,
          weightMinPct: 20,
          weightMaxPct: 25,
          evidence: [{ excerpt: "Author and manage workflows (20%)", location: null }],
        }),
      ],
    }));

    expect(issueMessages(error)).toEqual([
      "categories.0.weightPct: Exact percentage must equal both percentage range bounds.",
    ]);
  });

  it("rejects categories with a non-null parent code", () => {
    const error = expectValidationError(createProposal({
      categories: [
        createCategory({
          parentCode: "D0",
        }),
      ],
    }));

    expect(issueMessages(error)).toEqual([
      "categories.0.parentCode: Weighted blueprint categories must be top-level.",
    ]);
  });

  it("rejects evidence that omits a percentage sign", () => {
    const error = expectValidationError(createProposal({
      categories: [
        createCategory({
          evidence: [{ excerpt: "Author and manage workflows (20 percent)", location: null }],
        }),
      ],
    }));

    expect(issueMessages(error)).toEqual([
      "categories.0.evidence: Evidence must include the weighted category title and percentage.",
    ]);
  });

  it("rejects evidence with a percentage but without the normalized category title", () => {
    const error = expectValidationError(createProposal({
      categories: [
        createCategory({
          evidence: [{ excerpt: "Manage workflows (20%)", location: null }],
        }),
      ],
    }));

    expect(issueMessages(error)).toEqual([
      "categories.0.evidence: Evidence must include the weighted category title and percentage.",
    ]);
  });

  it("appends a deterministic warning when top-level exact weights do not total 100", () => {
    const result = validateBlueprintProposal(createProposal({
      categories: [
        createCategory({
          code: "D1",
          name: "Domain 1",
          weightPct: 60,
          weightMinPct: 60,
          weightMaxPct: 60,
          evidence: [{ excerpt: "Domain 1 (60%)", location: null }],
        }),
        createCategory({
          code: "D2",
          name: "Domain 2",
          weightPct: 30,
          weightMinPct: 30,
          weightMaxPct: 30,
          sortOrder: 1,
          evidence: [{ excerpt: "Domain 2 (30%)", location: null }],
        }),
      ],
    }));

    expect(result.warnings).toEqual([
      "Top-level category weights total 90.00 instead of 100.00.",
    ]);
  });

  it("does not append a generated warning when exact top-level weights total 100 within tolerance", () => {
    const result = validateBlueprintProposal(createProposal({
      warnings: ["  Already noted.  "],
      categories: [
        createCategory({
          code: "D1",
          name: "Domain 1",
          weightPct: 33.33,
          weightMinPct: 33.33,
          weightMaxPct: 33.33,
          evidence: [{ excerpt: "Domain 1 (33.33%)", location: null }],
        }),
        createCategory({
          code: "D2",
          name: "Domain 2",
          weightPct: 33.33,
          weightMinPct: 33.33,
          weightMaxPct: 33.33,
          sortOrder: 1,
          evidence: [{ excerpt: "Domain 2 (33.33%)", location: null }],
        }),
        createCategory({
          code: "D3",
          name: "Domain 3",
          weightPct: 33.34,
          weightMinPct: 33.34,
          weightMaxPct: 33.34,
          sortOrder: 2,
          evidence: [{ excerpt: "Domain 3 (33.34%)", location: null }],
        }),
      ],
    }));

    expect(result.warnings).toEqual(["Already noted."]);
  });

  it("exports a strict JSON schema suitable for structured output", () => {
    expect(findUnsupportedSchemaKeywords(blueprintProposalJsonSchema)).toEqual({
      default: [],
      minLength: [],
      maxLength: [],
      pattern: [],
      format: [],
      minimum: [],
      maximum: [],
      multipleOf: [],
      minItems: [],
      maxItems: [],
      uniqueItems: [],
    });

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
          items: { type: "string" },
        },
        categories: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["code", "name", "parentCode", "weightPct", "weightMinPct", "weightMaxPct", "sortOrder", "evidence"],
            properties: {
              code: {
                type: "string",
              },
              name: {
                type: "string",
              },
              parentCode: {
                anyOf: [{ type: "string" }, { type: "null" }],
              },
              weightPct: {
                anyOf: [
                  { type: "number" },
                  { type: "null" },
                ],
              },
              weightMinPct: {
                anyOf: [
                  { type: "number" },
                  { type: "null" },
                ],
              },
              weightMaxPct: {
                anyOf: [
                  { type: "number" },
                  { type: "null" },
                ],
              },
              sortOrder: {
                type: "integer",
              },
              evidence: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["excerpt", "location"],
                  properties: {
                    excerpt: {
                      type: "string",
                    },
                    location: {
                      anyOf: [{ type: "string" }, { type: "null" }],
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
  });
});
