import { z } from "zod";

const TOP_LEVEL_WEIGHT_TARGET = 100;
const TOP_LEVEL_WEIGHT_TOLERANCE = 0.01;
const MISSING_TOP_LEVEL_WEIGHTS_WARNING = "One or more top-level category weights are missing; weightPct values were preserved as null.";

const blueprintEvidenceSchema = z.object({
  excerpt: z.string().trim().min(1),
  location: z.string().trim().min(1).nullable(),
}).strict();

const blueprintCategorySchema = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  parentCode: z.string().trim().min(1).nullable(),
  weightPct: z.number().min(0).max(100).nullable(),
  sortOrder: z.number().int().nonnegative(),
  evidence: z.array(blueprintEvidenceSchema).default([]),
}).strict();

export const blueprintProposalSchema = z.object({
  confidence: z.enum(["high", "medium", "low"]),
  warnings: z.array(z.string().trim().min(1)).default([]),
  categories: z.array(blueprintCategorySchema).min(1),
}).strict();

export type BlueprintProposal = z.infer<typeof blueprintProposalSchema>;

function normalizeCode(code: string): string;
function normalizeCode(code: null): null;
function normalizeCode(code: string | null): string | null;
function normalizeCode(code: string | null) {
  return code === null ? null : code.toUpperCase();
}

function buildCustomIssue(path: Array<string | number>, message: string): z.ZodIssue {
  return {
    code: z.ZodIssueCode.custom,
    path,
    message,
    input: undefined,
  };
}

function appendGeneratedWarning(warnings: string[], warning: string) {
  if (!warnings.includes(warning)) {
    warnings.push(warning);
  }
}

function formatWeight(weightPct: number) {
  return weightPct.toFixed(2);
}

function buildIncorrectTotalWarning(total: number) {
  return `Top-level category weights total ${formatWeight(total)} instead of ${formatWeight(TOP_LEVEL_WEIGHT_TARGET)}.`;
}

const unsupportedStructuredOutputKeywords = new Set(["default", "minLength"]);

function sanitizeStructuredOutputSchema(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeStructuredOutputSchema);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !unsupportedStructuredOutputKeywords.has(key))
        .map(([key, nestedValue]) => [key, sanitizeStructuredOutputSchema(nestedValue)]),
    );
  }

  return value;
}

export function validateBlueprintProposal(value: unknown): BlueprintProposal {
  const parsed = blueprintProposalSchema.parse(value);
  const categories = parsed.categories.map((category) => ({
    ...category,
    code: normalizeCode(category.code),
    parentCode: normalizeCode(category.parentCode),
  }));
  const issues: z.ZodIssue[] = [];
  const indexByCode = new Map<string, number>();

  categories.forEach((category, index) => {
    if (indexByCode.has(category.code)) {
      issues.push(buildCustomIssue(["categories", index, "code"], "Category code must be unique after normalization."));
      return;
    }

    indexByCode.set(category.code, index);
  });

  categories.forEach((category, index) => {
    if (category.parentCode === null) {
      return;
    }

    if (category.parentCode === category.code) {
      issues.push(buildCustomIssue(["categories", index, "parentCode"], "Category cannot be its own parent."));
      return;
    }

    if (!indexByCode.has(category.parentCode)) {
      issues.push(buildCustomIssue(["categories", index, "parentCode"], "Parent category must reference an existing category code."));
    }

    if (category.weightPct !== null) {
      issues.push(buildCustomIssue(["categories", index, "weightPct"], "Child categories must not define weightPct."));
    }
  });

  categories.forEach((category, index) => {
    if (category.parentCode === null || category.parentCode === category.code || !indexByCode.has(category.parentCode)) {
      return;
    }

    const visited = new Set<string>([category.code]);
    let currentCode: string | null = category.parentCode;

    while (currentCode !== null) {
      if (visited.has(currentCode)) {
        issues.push(buildCustomIssue(["categories", index, "parentCode"], "Category hierarchy must not contain cycles."));
        return;
      }

      visited.add(currentCode);
      const parentIndex = indexByCode.get(currentCode);

      if (parentIndex === undefined) {
        return;
      }

      currentCode = categories[parentIndex]?.parentCode ?? null;
    }
  });

  if (issues.length > 0) {
    throw new z.ZodError(issues);
  }

  const warnings = [...parsed.warnings];
  const topLevelCategories = categories.filter((category) => category.parentCode === null);

  if (topLevelCategories.some((category) => category.weightPct === null)) {
    appendGeneratedWarning(warnings, MISSING_TOP_LEVEL_WEIGHTS_WARNING);
  } else {
    const totalWeight = topLevelCategories.reduce((sum, category) => sum + (category.weightPct ?? 0), 0);

    if (Math.abs(totalWeight - TOP_LEVEL_WEIGHT_TARGET) > TOP_LEVEL_WEIGHT_TOLERANCE) {
      appendGeneratedWarning(warnings, buildIncorrectTotalWarning(totalWeight));
    }
  }

  return {
    ...parsed,
    warnings,
    categories,
  };
}

const { $schema: _ignoredSchema, ...jsonSchema } = z.toJSONSchema(blueprintProposalSchema, {
  target: "draft-7",
  unrepresentable: "any",
});

export const blueprintProposalJsonSchema = sanitizeStructuredOutputSchema(jsonSchema) as Record<string, unknown>;
