import { z } from "zod";

import {
  certdrillAccessStatusSchema,
  certdrillAttemptStatusSchema,
  certdrillCategorySchema,
  certdrillConfidenceSchema,
  certdrillExamFormSchema,
  certdrillFeedbackModeSchema,
  certdrillMediaAssetSchema,
  certdrillQuestionResponseSchema,
  certdrillQuestionTypeSchema,
  certdrillQuestionSnapshotSchema,
  certdrillScenarioDecisionSchema,
  certdrillScenarioSnapshotSchema,
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
  examSimulationScenarioCount: z.number().int().nonnegative().optional(),
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
  questionType: certdrillQuestionTypeSchema.default("single_choice"),
  interaction: z.union([
    z.object({ type: z.literal("fill_blank") }),
    z.object({
      type: z.literal("matching"),
      prompts: z.array(z.object({ id: z.string().uuid(), text: z.string() })),
      targets: z.array(z.object({ id: z.string().uuid(), text: z.string() })),
    }),
  ]).nullable().default(null),
  category: z.object({ id: z.string().uuid(), code: z.string(), name: z.string() }),
  options: z.array(z.object({
    id: z.string().uuid(),
    text: z.string(),
    mediaAssets: z.array(certdrillMediaAssetSchema),
  })),
});

const examScenarioPayloadSchema = certdrillScenarioSnapshotSchema.transform(({ nodes, ...scenario }) => ({
  ...scenario,
  nodes: nodes.map((node) => ({
    ...node,
    options: node.options.map(({ points: _points, ...option }) => option),
  })),
}));

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
  scenarios: z.array(examScenarioPayloadSchema).optional(),
  warnings: z.array(z.string()).optional(),
});

export const certdrillResumeExamAttemptResponseSchema = createCertDrillExamAttemptResponseSchema.extend({
  recordedAnswers: z.array(z.object({
    questionId: z.string().uuid(),
    selectedOptionId: z.string().uuid().nullable().optional(),
    response: certdrillQuestionResponseSchema,
    confidence: certdrillConfidenceSchema.nullable().optional(),
  })),
  recordedScenarioResponses: z.array(z.object({
    scenarioId: z.string().uuid(),
    decisions: z.array(certdrillScenarioDecisionSchema),
    scorePct: z.number(),
  })).optional(),
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
    questionType: certdrillQuestionTypeSchema,
    submittedAnswer: z.string(),
    correctAnswer: z.string(),
    explanation: z.string(),
    citationUrls: z.array(z.string().url()),
    selectedOptionFeedback: optionFeedbackSchema.optional(),
    correctOption: optionFeedbackSchema.optional(),
  }),
]);

export const answerCertDrillScenarioResponseSchema = z.object({ received: z.literal(true) });

const certdrillReviewScenarioSchema = certdrillScenarioSnapshotSchema.extend({
  decisions: z.array(certdrillScenarioDecisionSchema),
  earnedPoints: z.number().int().nonnegative(),
  maxPoints: z.number().int().positive(),
  scorePct: z.number(),
});

export const certdrillReviewQuestionSchema = certdrillQuestionSnapshotSchema.extend({
  yourAnswer: z.string().nullable(),
  correctAnswer: z.string(),
  explanation: z.string(),
  citationUrls: z.array(z.string().url()),
  yourOption: optionFeedbackSchema.nullable().optional(),
  correctOption: optionFeedbackSchema.optional(),
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
  scenarios: z.array(certdrillReviewScenarioSchema).optional(),
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
  scenarios: z.array(certdrillReviewScenarioSchema).optional(),
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
export const answerCertDrillScenarioSuccessSchema = successResultSchema(answerCertDrillScenarioResponseSchema);
export const submitCertDrillExamAttemptSuccessSchema = successResultSchema(submitCertDrillExamAttemptResponseSchema);
export const certdrillReviewExamAttemptSuccessSchema = successResultSchema(certdrillReviewExamAttemptResponseSchema);
export const certdrillAttemptHistoryResponseSchema = successResultSchema(z.array(certdrillAttemptHistoryItemSchema));
export const certdrillReadinessSummaryResponseSchema = successResultSchema(certdrillReadinessSummarySchema);

export type CertDrillCertificationListItem = z.infer<typeof certdrillCertificationListItemSchema>;
export type CreateCertDrillExamAttemptResponse = z.infer<typeof createCertDrillExamAttemptResponseSchema>;
export type CertDrillResumeExamAttemptResponse = z.infer<typeof certdrillResumeExamAttemptResponseSchema>;
export type AnswerCertDrillQuestionResponse = z.infer<typeof answerCertDrillQuestionResponseSchema>;
export type AnswerCertDrillScenarioResponse = z.infer<typeof answerCertDrillScenarioResponseSchema>;
export type CertDrillReviewQuestion = z.infer<typeof certdrillReviewQuestionSchema>;
export type CertDrillReviewExamAttemptResponse = z.infer<typeof certdrillReviewExamAttemptResponseSchema>;
export type SubmitCertDrillExamAttemptResponse = z.infer<typeof submitCertDrillExamAttemptResponseSchema>;
export type CertDrillAttemptHistoryItem = z.infer<typeof certdrillAttemptHistoryItemSchema>;
export type CertDrillReadinessSummary = z.infer<typeof certdrillReadinessSummarySchema>;
