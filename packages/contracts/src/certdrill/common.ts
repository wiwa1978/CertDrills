import { z } from "zod";

export const certdrillFeedbackModeSchema = z.enum(["practice", "exam"]);
export const certdrillSelectionModeSchema = z.enum(["category_focus", "weighted_random"]);
export const certdrillTestModeSchema = z.enum(["practice", "exam"]);
export const certdrillTestVariantSchema = z.enum([
  "quick_drill",
  "category_drill",
  "exam_simulation",
  "exam_form",
  "missed_review",
  "weak_areas",
]);
export const certdrillConfidenceSchema = z.enum(["guessed", "somewhat_sure", "confident"]);
export const certdrillAccessStatusSchema = z.enum(["not_purchased", "purchased"]);
export const certdrillDifficultySchema = z.enum(["easy", "medium", "hard"]);
export const certdrillAttemptStatusSchema = z.enum(["in_progress", "completed", "abandoned"]);
export const certdrillQuestionTypeSchema = z.enum(["single_choice", "fill_blank", "matching"]);

export const certdrillQuestionInteractionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("fill_blank"),
    acceptedAnswers: z.array(z.string().trim().min(1)).min(1),
    explanation: z.string(),
    citationUrls: z.array(z.string().url()),
  }),
  z.object({
    type: z.literal("matching"),
    pairs: z.array(z.object({
      promptId: z.string().uuid(),
      targetId: z.string().uuid(),
      prompt: z.string().trim().min(1),
      target: z.string().trim().min(1),
      explanation: z.string(),
      citationUrls: z.array(z.string().url()),
    })).min(2).max(10),
    targetOrder: z.array(z.string().uuid()).optional(),
  }),
]);

export const certdrillQuestionResponseSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("single_choice"), selectedOptionId: z.string().uuid() }),
  z.object({ type: z.literal("fill_blank"), text: z.string().trim().min(1).max(500) }),
  z.object({ type: z.literal("matching"), matches: z.array(z.object({ promptId: z.string().uuid(), targetId: z.string().uuid() })).min(2).max(10) }),
]);

export const certdrillExamFormSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  durationMinutes: z.number().int().positive(),
  questionCount: z.number().int().nonnegative(),
  scenarioCount: z.number().int().nonnegative().optional(),
});

export const certdrillMediaAssetSchema = z.object({
  url: z.string().url(),
  mimeType: z.enum(["image/png", "image/jpeg"]),
  altText: z.string().trim().min(1),
  caption: z.string().trim().optional(),
  sortOrder: z.number().int().nonnegative().default(0),
});

export type CertDrillCategory = {
  id: string;
  parentCategoryId: string | null;
  code: string;
  name: string;
  weightPct: string | null;
  sortOrder: number;
  publishedQuestionCount: number;
  children: CertDrillCategory[];
};

export const certdrillCategorySchema: z.ZodType<CertDrillCategory> = z.object({
  id: z.string().uuid(),
  parentCategoryId: z.string().uuid().nullable(),
  code: z.string(),
  name: z.string(),
  weightPct: z.string().nullable(),
  sortOrder: z.number().int(),
  publishedQuestionCount: z.number().int().nonnegative().default(0),
  children: z.array(z.lazy(() => certdrillCategorySchema)).default([]),
});

export const certdrillAnswerOptionSnapshotSchema = z.object({
  id: z.string().uuid(),
  text: z.string(),
  mediaAssets: z.array(certdrillMediaAssetSchema),
  isCorrect: z.boolean(),
  explanation: z.string(),
  citationUrls: z.array(z.string().url()),
  sortOrder: z.number().int(),
});

export const certdrillQuestionSnapshotSchema = z.object({
  id: z.string().uuid(),
  stem: z.string(),
  mediaAssets: z.array(certdrillMediaAssetSchema),
  questionType: certdrillQuestionTypeSchema.default("single_choice"),
  interaction: certdrillQuestionInteractionSchema.nullable().default(null),
  category: z.object({ id: z.string().uuid(), code: z.string(), name: z.string() }),
  difficulty: certdrillDifficultySchema,
  options: z.array(certdrillAnswerOptionSnapshotSchema),
});

export const certdrillScenarioOptionSnapshotSchema = z.object({
  key: z.string(),
  title: z.string(),
  description: z.string(),
  consequence: z.string(),
  points: z.number().int().min(0).max(100),
  nextNodeKey: z.string().nullable(),
});

export const certdrillScenarioNodeSnapshotSchema = z.object({
  key: z.string(),
  title: z.string(),
  situation: z.string(),
  evidence: z.array(z.string()),
  options: z.array(certdrillScenarioOptionSnapshotSchema),
});

export const certdrillScenarioSnapshotSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  difficulty: certdrillDifficultySchema,
  estimatedMinutes: z.number().int().positive(),
  initialNodeKey: z.string(),
  nodes: z.array(certdrillScenarioNodeSnapshotSchema),
});

export const certdrillScenarioDecisionSchema = z.object({ nodeKey: z.string(), optionKey: z.string() });

const certdrillAttemptSnapshotV1Schema = z.object({
  version: z.literal(1),
  questions: z.array(certdrillQuestionSnapshotSchema),
});

const certdrillAttemptSnapshotV2Schema = z.object({
  version: z.literal(2),
  questions: z.array(certdrillQuestionSnapshotSchema),
  scenarios: z.array(certdrillScenarioSnapshotSchema),
});

export const certdrillAttemptSnapshotSchema = z.union([certdrillAttemptSnapshotV1Schema, certdrillAttemptSnapshotV2Schema]);

export type CertDrillFeedbackMode = z.infer<typeof certdrillFeedbackModeSchema>;
export type CertDrillSelectionMode = z.infer<typeof certdrillSelectionModeSchema>;
export type CertDrillTestMode = z.infer<typeof certdrillTestModeSchema>;
export type CertDrillTestVariant = z.infer<typeof certdrillTestVariantSchema>;
export type CertDrillConfidence = z.infer<typeof certdrillConfidenceSchema>;
export type CertDrillAccessStatus = z.infer<typeof certdrillAccessStatusSchema>;
export type CertDrillDifficulty = z.infer<typeof certdrillDifficultySchema>;
export type CertDrillAttemptStatus = z.infer<typeof certdrillAttemptStatusSchema>;
export type CertDrillQuestionType = z.infer<typeof certdrillQuestionTypeSchema>;
export type CertDrillQuestionInteraction = z.infer<typeof certdrillQuestionInteractionSchema>;
export type CertDrillQuestionResponse = z.infer<typeof certdrillQuestionResponseSchema>;
export type CertDrillExamForm = z.infer<typeof certdrillExamFormSchema>;
export type CertDrillMediaAsset = z.infer<typeof certdrillMediaAssetSchema>;
export type CertDrillAnswerOptionSnapshot = z.infer<typeof certdrillAnswerOptionSnapshotSchema>;
export type CertDrillQuestionSnapshot = z.infer<typeof certdrillQuestionSnapshotSchema>;
export type CertDrillScenarioOptionSnapshot = z.infer<typeof certdrillScenarioOptionSnapshotSchema>;
export type CertDrillScenarioNodeSnapshot = z.infer<typeof certdrillScenarioNodeSnapshotSchema>;
export type CertDrillScenarioSnapshot = z.infer<typeof certdrillScenarioSnapshotSchema>;
export type CertDrillScenarioDecision = z.infer<typeof certdrillScenarioDecisionSchema>;
export type CertDrillAttemptSnapshot = z.infer<typeof certdrillAttemptSnapshotSchema>;
