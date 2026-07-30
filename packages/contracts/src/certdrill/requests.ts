import { z } from "zod";

import {
  certdrillConfidenceSchema,
  certdrillFeedbackModeSchema,
  certdrillSelectionModeSchema,
  certdrillTestModeSchema,
  certdrillTestVariantSchema,
  type CertDrillFeedbackMode,
  type CertDrillSelectionMode,
  type CertDrillTestMode,
  type CertDrillTestVariant,
} from "./common";

const practiceVariants = ["quick_drill", "category_drill", "missed_review", "weak_areas"] as const;
const examVariants = ["exam_simulation", "exam_form"] as const;

export const createCertDrillExamAttemptRequestSchema = z.object({
  certificationId: z.string().uuid(),
  testMode: certdrillTestModeSchema.optional(),
  testVariant: certdrillTestVariantSchema.optional(),
  categoryIds: z.array(z.string().uuid()).optional(),
  examFormId: z.string().uuid().optional(),
  confidenceEnabled: z.boolean().optional().default(false),
  feedbackMode: certdrillFeedbackModeSchema.optional(),
  selectionMode: certdrillSelectionModeSchema.optional(),
  questionCount: z.number().int().positive().max(200).optional(),
}).superRefine((value, ctx) => {
  if ((value.testMode && !value.testVariant) || (!value.testMode && value.testVariant)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "testMode and testVariant must be provided together", path: [value.testMode ? "testVariant" : "testMode"] });
  }

  if (!value.testMode && !value.feedbackMode) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "testMode or feedbackMode is required", path: ["testMode"] });
  }

  const testMode = value.testMode ?? value.feedbackMode;
  const testVariant = value.testVariant ?? deriveTestVariantFromLegacy(value.feedbackMode, value.selectionMode, value.examFormId);

  if (!testVariant) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "testVariant or selectionMode is required", path: ["testVariant"] });
  }

  if (value.testMode && value.feedbackMode && value.feedbackMode !== value.testMode) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "feedbackMode conflicts with testMode", path: ["feedbackMode"] });
  }

  if (value.testVariant && value.feedbackMode && value.feedbackMode !== feedbackModeForTestVariant(value.testVariant)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "feedbackMode conflicts with testVariant", path: ["feedbackMode"] });
  }

  if (value.testVariant && value.selectionMode && value.selectionMode !== selectionModeForTestVariant(value.testVariant)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "selectionMode conflicts with testVariant", path: ["selectionMode"] });
  }

  if (testVariant === "category_drill" && value.categoryIds?.length !== 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "category_drill requires exactly one category", path: ["categoryIds"] });
  }

  if (testVariant === "exam_form" && !value.examFormId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "exam_form requires examFormId", path: ["examFormId"] });
  }

  if (testMode === "practice" && testVariant && (examVariants as readonly string[]).includes(testVariant)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "exam variants require testMode=exam", path: ["testVariant"] });
  }

  if (testMode === "exam" && testVariant && (practiceVariants as readonly string[]).includes(testVariant)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "practice variants require testMode=practice", path: ["testVariant"] });
  }
}).transform((value) => {
  const testMode = value.testMode ?? value.feedbackMode ?? "practice";
  const testVariant = value.testVariant ?? deriveTestVariantFromLegacy(value.feedbackMode, value.selectionMode, value.examFormId) ?? "quick_drill";
  const feedbackMode = feedbackModeForTestVariant(testVariant);
  const selectionMode = selectionModeForTestVariant(testVariant);

  return {
    ...value,
    feedbackMode,
    selectionMode,
    testMode,
    testVariant,
  };
});

function deriveTestVariantFromLegacy(
  feedbackMode: CertDrillFeedbackMode | undefined,
  selectionMode: CertDrillSelectionMode | undefined,
  examFormId: string | undefined,
): CertDrillTestVariant | undefined {
  if (feedbackMode === "exam") {
    return examFormId ? "exam_form" : "exam_simulation";
  }

  if (feedbackMode === "practice") {
    if (selectionMode === "category_focus") return "category_drill";
    if (selectionMode === "weighted_random") return "quick_drill";
  }

  return undefined;
}

function feedbackModeForTestVariant(testVariant: CertDrillTestVariant): CertDrillTestMode {
  return (examVariants as readonly string[]).includes(testVariant) ? "exam" : "practice";
}

function selectionModeForTestVariant(testVariant: CertDrillTestVariant): CertDrillSelectionMode {
  return testVariant === "category_drill" ? "category_focus" : "weighted_random";
}

export const answerCertDrillQuestionRequestSchema = z.object({
  questionId: z.string().uuid(),
  selectedOptionId: z.string().uuid(),
  confidence: certdrillConfidenceSchema.optional(),
});

export const createCertDrillQuestionFeedbackRequestSchema = z.object({
  questionId: z.string().uuid(),
  attemptId: z.string().uuid().optional(),
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  disputeCorrectAnswer: z.boolean().optional().default(false),
  message: z.string().trim().min(1).max(2000).optional(),
});

export type CreateCertDrillExamAttemptRequestInput = z.input<typeof createCertDrillExamAttemptRequestSchema>;
export type CreateCertDrillExamAttemptRequest = CreateCertDrillExamAttemptRequestInput;
export type CreateCertDrillExamAttemptParsed = z.output<typeof createCertDrillExamAttemptRequestSchema>;
export type AnswerCertDrillQuestionRequest = z.infer<typeof answerCertDrillQuestionRequestSchema>;
export type CreateCertDrillQuestionFeedbackRequest = z.infer<typeof createCertDrillQuestionFeedbackRequestSchema>;
