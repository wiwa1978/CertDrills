import { z } from "zod";

import { isSafeCitationUrl } from "./validation";

export const questionDifficultyMixSchema = z.object({
  easy: z.number().int().min(0).max(100),
  medium: z.number().int().min(0).max(100),
  hard: z.number().int().min(0).max(100),
}).strict().refine((mix) => mix.easy + mix.medium + mix.hard === 100, {
  message: "Difficulty percentages must total 100.",
});

export const questionGenerationConfigSchema = z.object({
  focus: z.string().trim().max(500).nullable(),
  systemInstructions: z.string().trim().max(4_000).nullable().default(null),
  instructions: z.string().trim().max(2_000).nullable(),
  questionTypes: z.array(z.enum(["single_choice", "fill_blank", "matching"])).min(1).max(3).default(["single_choice"]),
  difficultyMix: questionDifficultyMixSchema,
  deliveryPurpose: z.enum(["practice", "assessment"]).default("practice"),
}).strict();

const generatedOptionSchema = z.object({
  text: z.string().trim().min(1),
  isCorrect: z.boolean(),
  explanation: z.string().trim().min(1),
  citationUrls: z.array(z.string().url().refine(isSafeCitationUrl)).min(1),
}).strict();
const generatedQuestionBaseSchema = z.object({
  categoryId: z.string().uuid(),
  stem: z.string().trim().min(1),
  difficulty: z.enum(["easy", "medium", "hard"]),
});

const generatedSingleChoiceQuestionSchema = generatedQuestionBaseSchema.extend({
  questionType: z.literal("single_choice").default("single_choice"),
  options: z.array(generatedOptionSchema).min(3).max(6),
}).strict().refine((question) => question.options.filter((option) => option.isCorrect).length === 1, {
  message: "Each generated single-choice question must have exactly one correct answer.",
  path: ["options"],
});

const generatedFillBlankQuestionSchema = generatedQuestionBaseSchema.extend({
  questionType: z.literal("fill_blank"),
  acceptedAnswers: z.array(z.string().trim().min(1)).min(1).max(10),
  explanation: z.string().trim().min(1),
  citationUrls: z.array(z.string().url().refine(isSafeCitationUrl)).min(1),
}).strict();

const generatedMatchingQuestionSchema = generatedQuestionBaseSchema.extend({
  questionType: z.literal("matching"),
  pairs: z.array(z.object({
    prompt: z.string().trim().min(1),
    target: z.string().trim().min(1),
    explanation: z.string().trim().min(1),
    citationUrls: z.array(z.string().url().refine(isSafeCitationUrl)).min(1),
  }).strict()).min(2).max(8),
}).strict();

const generatedQuestionSchema = z.union([
  generatedSingleChoiceQuestionSchema,
  generatedFillBlankQuestionSchema,
  generatedMatchingQuestionSchema,
]);

export const questionGenerationProposalSchema = z.object({
  questions: z.array(generatedQuestionSchema).min(1).max(25),
}).strict();

export type QuestionGenerationConfig = z.infer<typeof questionGenerationConfigSchema>;
export type QuestionGenerationProposal = z.infer<typeof questionGenerationProposalSchema>;

function normalizedStem(stem: string) {
  return stem.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function normalizedUrl(url: string) {
  const parsed = new URL(url);
  parsed.hash = "";
  if (parsed.pathname !== "/") parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString();
}

export function validateQuestionGenerationProposal(
  value: unknown,
  input: { requestedCount: number; allowedCitationUrls: string[]; allowedCategoryIds: string[]; allowedQuestionTypes?: Array<"single_choice" | "fill_blank" | "matching">; existingQuestionStems: string[] },
): QuestionGenerationProposal {
  const proposal = questionGenerationProposalSchema.parse(value);
  if (proposal.questions.length !== input.requestedCount) {
    throw new Error(`Generator returned ${proposal.questions.length} questions; expected ${input.requestedCount}.`);
  }

  const allowedCitationUrls = new Set(input.allowedCitationUrls.map(normalizedUrl));
  const allowedCategoryIds = new Set(input.allowedCategoryIds);
  const existingStems = new Set(input.existingQuestionStems.map(normalizedStem));
  const generatedStems = new Set<string>();
  const allowedQuestionTypes = new Set(input.allowedQuestionTypes ?? ["single_choice", "fill_blank", "matching"]);

  for (const question of proposal.questions) {
    if (!allowedCategoryIds.has(question.categoryId)) throw new Error("Generator assigned a question to a category outside the requested scope.");
    const stem = normalizedStem(question.stem);
    if (!allowedQuestionTypes.has(question.questionType)) throw new Error("Generator returned a question type outside the requested formats.");
    if (existingStems.has(stem)) throw new Error("Generator returned a question that already exists.");
    if (generatedStems.has(stem)) throw new Error("Generator returned duplicate questions in one batch.");
    generatedStems.add(stem);
    const citationGroups = question.questionType === "single_choice"
      ? question.options.map((option) => option.citationUrls)
      : question.questionType === "fill_blank"
        ? [question.citationUrls]
        : question.pairs.map((pair) => pair.citationUrls);
    for (const citationUrls of citationGroups) {
      if (citationUrls.some((url) => !allowedCitationUrls.has(normalizedUrl(url)))) {
        throw new Error("Generator cited a URL that was not supplied as source material.");
      }
    }
  }

  return proposal;
}

const unsupportedStructuredOutputKeywords = new Set([
  "default", "minLength", "maxLength", "pattern", "format", "minimum", "maximum",
  "multipleOf", "minItems", "maxItems", "uniqueItems",
]);

function sanitizeStructuredOutputSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeStructuredOutputSchema);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !unsupportedStructuredOutputKeywords.has(key))
      .map(([key, nested]) => [key, sanitizeStructuredOutputSchema(nested)]));
  }
  return value;
}

const { $schema: _ignoredSchema, ...jsonSchema } = z.toJSONSchema(questionGenerationProposalSchema, {
  target: "draft-7",
  unrepresentable: "any",
});

export const questionGenerationProposalJsonSchema = sanitizeStructuredOutputSchema(jsonSchema) as Record<string, unknown>;
