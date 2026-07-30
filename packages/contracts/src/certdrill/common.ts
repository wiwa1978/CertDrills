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

export const certdrillExamFormSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  durationMinutes: z.number().int().positive(),
  questionCount: z.number().int().nonnegative(),
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
  category: z.object({ id: z.string().uuid(), code: z.string(), name: z.string() }),
  difficulty: certdrillDifficultySchema,
  options: z.array(certdrillAnswerOptionSnapshotSchema),
});

export const certdrillAttemptSnapshotSchema = z.object({
  version: z.literal(1),
  questions: z.array(certdrillQuestionSnapshotSchema),
});

export type CertDrillFeedbackMode = z.infer<typeof certdrillFeedbackModeSchema>;
export type CertDrillSelectionMode = z.infer<typeof certdrillSelectionModeSchema>;
export type CertDrillTestMode = z.infer<typeof certdrillTestModeSchema>;
export type CertDrillTestVariant = z.infer<typeof certdrillTestVariantSchema>;
export type CertDrillConfidence = z.infer<typeof certdrillConfidenceSchema>;
export type CertDrillAccessStatus = z.infer<typeof certdrillAccessStatusSchema>;
export type CertDrillDifficulty = z.infer<typeof certdrillDifficultySchema>;
export type CertDrillAttemptStatus = z.infer<typeof certdrillAttemptStatusSchema>;
export type CertDrillExamForm = z.infer<typeof certdrillExamFormSchema>;
export type CertDrillMediaAsset = z.infer<typeof certdrillMediaAssetSchema>;
export type CertDrillAnswerOptionSnapshot = z.infer<typeof certdrillAnswerOptionSnapshotSchema>;
export type CertDrillQuestionSnapshot = z.infer<typeof certdrillQuestionSnapshotSchema>;
export type CertDrillAttemptSnapshot = z.infer<typeof certdrillAttemptSnapshotSchema>;
