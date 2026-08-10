import { z } from "zod";

import { startCertDrillAdminQuestionGenerationServer } from "@/lib/api/certdrill.server";
import { questionGenerationHelperErrorResponse, questionGenerationInvalidRequestResponse } from "./responses";

const requestSchema = z.object({
  certificationId: z.string().uuid(),
  categoryId: z.string().uuid().nullable(),
  resourceIds: z.array(z.string().uuid()).max(10),
  sourceUrls: z.array(z.string().url()).max(10),
  requestedCount: z.number().int().min(1).max(25),
  focus: z.string().trim().max(500).nullable(),
  systemInstructions: z.string().trim().max(4_000).nullable().default(null),
  instructions: z.string().trim().max(2_000).nullable(),
  questionTypes: z.array(z.enum(["single_choice", "fill_blank", "matching"])).min(1).max(3).default(["single_choice"]),
  difficultyMix: z.object({
    easy: z.number().int().min(0).max(100),
    medium: z.number().int().min(0).max(100),
    hard: z.number().int().min(0).max(100),
  }).strict(),
  deliveryPurpose: z.enum(["practice", "assessment"]),
}).strict().refine((value) => value.resourceIds.length + value.sourceUrls.length >= 1, "At least one source is required.")
  .refine((value) => value.resourceIds.length + value.sourceUrls.length <= 10, "At most ten sources are allowed.")
  .refine((value) => value.difficultyMix.easy + value.difficultyMix.medium + value.difficultyMix.hard === 100, "Difficulty percentages must total 100.");

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return questionGenerationInvalidRequestResponse(); }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return questionGenerationInvalidRequestResponse();

  const { certificationId, ...payload } = parsed.data;
  try {
    const data = await startCertDrillAdminQuestionGenerationServer(certificationId, payload);
    return Response.json({ success: true as const, data }, { status: 201 });
  } catch (error) {
    return questionGenerationHelperErrorResponse(error);
  }
}
