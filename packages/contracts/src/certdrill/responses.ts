import { z } from "zod";

import {
  certdrillAccessStatusSchema,
  certdrillAttemptStatusSchema,
  certdrillCategorySchema,
  certdrillConfidenceSchema,
  certdrillExamFormSchema,
  certdrillFeedbackModeSchema,
  certdrillMediaAssetSchema,
  certdrillQuestionSnapshotSchema,
  certdrillSelectionModeSchema,
  certdrillTestModeSchema,
  certdrillTestVariantSchema,
} from "./common";
import { successResultSchema } from "../wire/common/result";

export const certdrillCertificationListItemSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  vendor: z.string(),
  logoUrl: z.string().nullable().optional(),
  description: z.string().nullable(),
  enabledAt: z.string().nullable().optional(),
  archivedAt: z.string().nullable().optional(),
  questionCountDefault: z.number().int().positive(),
  quickDrillQuestionCount: z.number().int().positive().optional(),
  categoryDrillQuestionCount: z.number().int().positive().optional(),
  examSimulationQuestionCount: z.number().int().positive().nullable().optional(),
  examSimulationDurationMinutes: z.number().int().positive().optional(),
  examForms: z.array(certdrillExamFormSchema).optional(),
  passThresholdPct: z.number().int().min(0).max(100),
  publishedQuestionCount: z.number().int().nonnegative(),
  accessStatus: certdrillAccessStatusSchema,
});

const examQuestionPayloadSchema = z.object({
  id: z.string().uuid(),
  stem: z.string(),
  mediaAssets: z.array(certdrillMediaAssetSchema),
  category: z.object({ id: z.string().uuid(), code: z.string(), name: z.string() }),
  options: z.array(z.object({
    id: z.string().uuid(),
    text: z.string(),
    mediaAssets: z.array(certdrillMediaAssetSchema),
  })),
});

export const createCertDrillExamAttemptResponseSchema = z.object({
  attemptId: z.string().uuid(),
  feedbackMode: certdrillFeedbackModeSchema,
  selectionMode: certdrillSelectionModeSchema,
  testMode: certdrillTestModeSchema.optional(),
  testVariant: certdrillTestVariantSchema.optional(),
  examFormName: z.string().optional(),
  confidenceEnabled: z.boolean().optional(),
  expiresAt: z.string().nullable().optional(),
  questions: z.array(examQuestionPayloadSchema),
  warnings: z.array(z.string()).optional(),
});

export const certdrillResumeExamAttemptResponseSchema = createCertDrillExamAttemptResponseSchema.extend({
  recordedAnswers: z.array(z.object({
    questionId: z.string().uuid(),
    selectedOptionId: z.string().uuid(),
    confidence: certdrillConfidenceSchema.nullable().optional(),
  })),
});

const optionFeedbackSchema = z.object({
  id: z.string().uuid(),
  text: z.string(),
  mediaAssets: z.array(certdrillMediaAssetSchema),
  explanation: z.string(),
  citationUrls: z.array(z.string().url()),
});

export const answerCertDrillQuestionResponseSchema = z.union([
  z.object({ received: z.literal(true) }),
  z.object({
    isCorrect: z.boolean(),
    selectedOptionFeedback: optionFeedbackSchema,
    correctOption: optionFeedbackSchema,
  }),
]);

export const certdrillReviewQuestionSchema = certdrillQuestionSnapshotSchema.extend({
  yourOption: optionFeedbackSchema.nullable(),
  correctOption: optionFeedbackSchema,
  isCorrect: z.boolean(),
  confidence: certdrillConfidenceSchema.nullable().optional(),
});

export const certdrillReviewExamAttemptResponseSchema = z.object({
  testMode: certdrillTestModeSchema.optional(),
  testVariant: certdrillTestVariantSchema.optional(),
  examFormName: z.string().optional(),
  confidenceEnabled: z.boolean().optional(),
  expiresAt: z.string().nullable().optional(),
  questions: z.array(certdrillReviewQuestionSchema),
});

export const submitCertDrillExamAttemptResponseSchema = z.object({
  scorePct: z.number(),
  passed: z.boolean(),
  categoryBreakdown: z.array(z.object({
    categoryId: z.string().uuid(),
    code: z.string(),
    name: z.string(),
    correct: z.number().int().nonnegative(),
    total: z.number().int().positive(),
    scorePct: z.number(),
  })),
  questions: z.array(certdrillReviewQuestionSchema),
});

export const certdrillAttemptHistoryItemSchema = z.object({
  id: z.string().uuid(),
  certification: z.object({ id: z.string().uuid(), code: z.string(), name: z.string() }),
  feedbackMode: certdrillFeedbackModeSchema,
  selectionMode: certdrillSelectionModeSchema,
  testMode: certdrillTestModeSchema.optional(),
  testVariant: certdrillTestVariantSchema.optional(),
  examFormName: z.string().optional(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  expiresAt: z.string().nullable().optional(),
  scorePct: z.number().nullable(),
  status: certdrillAttemptStatusSchema,
});

export const certdrillReadinessSummarySchema = z.object({
  completedAttempts: z.number().int().nonnegative(),
  averageScorePct: z.number().nonnegative(),
  missedQuestionCount: z.number().int().nonnegative(),
  weakCategoryCount: z.number().int().nonnegative(),
});

export const certdrillCertificationListResponseSchema = successResultSchema(z.array(certdrillCertificationListItemSchema));
export const certdrillCategoriesResponseSchema = successResultSchema(z.array(certdrillCategorySchema));
export const createCertDrillExamAttemptSuccessSchema = successResultSchema(createCertDrillExamAttemptResponseSchema);
export const certdrillResumeExamAttemptSuccessSchema = successResultSchema(certdrillResumeExamAttemptResponseSchema);
export const answerCertDrillQuestionSuccessSchema = successResultSchema(answerCertDrillQuestionResponseSchema);
export const submitCertDrillExamAttemptSuccessSchema = successResultSchema(submitCertDrillExamAttemptResponseSchema);
export const certdrillReviewExamAttemptSuccessSchema = successResultSchema(certdrillReviewExamAttemptResponseSchema);
export const certdrillAttemptHistoryResponseSchema = successResultSchema(z.array(certdrillAttemptHistoryItemSchema));
export const certdrillReadinessSummaryResponseSchema = successResultSchema(certdrillReadinessSummarySchema);

export type CertDrillCertificationListItem = z.infer<typeof certdrillCertificationListItemSchema>;
export type CreateCertDrillExamAttemptResponse = z.infer<typeof createCertDrillExamAttemptResponseSchema>;
export type CertDrillResumeExamAttemptResponse = z.infer<typeof certdrillResumeExamAttemptResponseSchema>;
export type AnswerCertDrillQuestionResponse = z.infer<typeof answerCertDrillQuestionResponseSchema>;
export type CertDrillReviewQuestion = z.infer<typeof certdrillReviewQuestionSchema>;
export type CertDrillReviewExamAttemptResponse = z.infer<typeof certdrillReviewExamAttemptResponseSchema>;
export type SubmitCertDrillExamAttemptResponse = z.infer<typeof submitCertDrillExamAttemptResponseSchema>;
export type CertDrillAttemptHistoryItem = z.infer<typeof certdrillAttemptHistoryItemSchema>;
export type CertDrillReadinessSummary = z.infer<typeof certdrillReadinessSummarySchema>;
