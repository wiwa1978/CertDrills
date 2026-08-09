import { z } from "zod";

const TOP_LEVEL_WEIGHT_TARGET = 100;
const TOP_LEVEL_WEIGHT_TOLERANCE = 0.01;

const blueprintEvidenceSchema = z.object({
  excerpt: z.string().trim().min(1),
  location: z.string().trim().min(1).nullable(),
}).strict();

const blueprintCategorySchema = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  parentCode: z.string().trim().min(1).nullable(),
  weightPct: z.number().min(0).max(100).nullable(),
  weightMinPct: z.number().min(0).max(100).nullable(),
  weightMaxPct: z.number().min(0).max(100).nullable(),
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

function normalizeEvidenceText(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}%]+/gu, " ").trim();
}

function hasNormalizedWholeTitleMatch(excerpt: string, name: string) {
  return ` ${excerpt} `.includes(` ${name} `);
}

function hasWeightedHeadingEvidence(category: BlueprintProposal["categories"][number]) {
  const normalizedName = normalizeEvidenceText(category.name);

  return category.evidence.some((item) => {
    if (!item.excerpt.includes("%")) {
      return false;
    }

    return hasNormalizedWholeTitleMatch(normalizeEvidenceText(item.excerpt), normalizedName);
  });
}

function formatWeight(weightPct: number) {
  return weightPct.toFixed(2);
}

function buildIncorrectTotalWarning(total: number) {
  return `Top-level category weights total ${formatWeight(total)} instead of ${formatWeight(TOP_LEVEL_WEIGHT_TARGET)}.`;
}

const unsupportedStructuredOutputKeywords = new Set([
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
]);

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
  const normalizedCodes = new Set<string>();

  categories.forEach((category, index) => {
    if (normalizedCodes.has(category.code)) {
      issues.push(buildCustomIssue(["categories", index, "code"], "Category code must be unique after normalization."));
      return;
    }

    normalizedCodes.add(category.code);
  });

  categories.forEach((category, index) => {
    if (category.parentCode !== null) {
      issues.push(buildCustomIssue(["categories", index, "parentCode"], "Weighted blueprint categories must be top-level."));
    }

    const hasExactWeight = category.weightPct !== null;
    const hasMinimumWeight = category.weightMinPct !== null;
    const hasMaximumWeight = category.weightMaxPct !== null;
    const minimumWeight = category.weightMinPct;
    const maximumWeight = category.weightMaxPct;

    if (!hasExactWeight && !hasMinimumWeight && !hasMaximumWeight) {
      issues.push(buildCustomIssue(["categories", index, "weightPct"], "Category must define an exact percentage or percentage range."));
    } else if (hasMinimumWeight !== hasMaximumWeight) {
      issues.push(buildCustomIssue(["categories", index, "weightPct"], "Percentage range requires both minimum and maximum values."));
    } else if (minimumWeight !== null && maximumWeight !== null && minimumWeight > maximumWeight) {
      issues.push(buildCustomIssue(["categories", index, "weightMinPct"], "Percentage range minimum must not exceed maximum."));
    } else if (
      hasExactWeight
      && (minimumWeight === null || maximumWeight === null || category.weightPct !== minimumWeight || category.weightPct !== maximumWeight)
    ) {
      issues.push(buildCustomIssue(["categories", index, "weightPct"], "Exact percentage must equal both percentage range bounds."));
    }

    if (!hasWeightedHeadingEvidence(category)) {
      issues.push(buildCustomIssue(["categories", index, "evidence"], "Evidence must include the weighted category title and percentage."));
    }
  });

  if (issues.length > 0) {
    throw new z.ZodError(issues);
  }

  const warnings = [...parsed.warnings];
  if (categories.every((category) => category.weightPct !== null)) {
    const totalWeight = categories.reduce((sum, category) => sum + (category.weightPct ?? 0), 0);

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
