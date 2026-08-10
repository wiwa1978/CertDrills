import { z } from "zod";
import { certdrillQuestionInteractionSchema, certdrillQuestionTypeSchema } from "@platform/contracts";

import { isSafeCitationUrl } from "./validation";

const mediaAssetSchema = z.object({
  url: z.string().url(),
  mimeType: z.string().optional(),
  mime_type: z.string().optional(),
});

export const questionOptionSchema = z.object({
  text: z.string().min(1),
  mediaAssets: z.array(mediaAssetSchema).optional(),
  isCorrect: z.boolean(),
  explanation: z.string().optional(),
  citationUrls: z.array(z.string().url().refine(isSafeCitationUrl)).optional(),
  sortOrder: z.number().int().optional(),
});

export const questionCreateSchema = z.object({
  certificationId: z.string().uuid(),
  categoryId: z.string().uuid(),
  stem: z.string().min(1),
  questionType: certdrillQuestionTypeSchema.optional(),
  interactionJson: certdrillQuestionInteractionSchema.nullable().optional(),
  mediaAssets: z.array(mediaAssetSchema).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  deliveryPurpose: z.enum(["practice", "assessment", "both"]).optional(),
  createdBy: z.enum(["ai", "admin"]).optional(),
  sourceResourceId: z.string().uuid().nullable().optional(),
  generationJobId: z.string().uuid().nullable().optional(),
  options: z.array(questionOptionSchema).min(2).max(10).optional(),
});

export const questionUpdateSchema = questionCreateSchema
  .omit({ certificationId: true, createdBy: true })
  .partial();
