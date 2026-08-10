import { z } from "zod";

import { startCertDrillAdminScenarioGenerationServer } from "@/lib/api/certdrill.server";
import { scenarioGenerationHelperErrorResponse, scenarioGenerationInvalidRequestResponse } from "./responses";

const schema = z.object({
  certificationId: z.string().uuid(),
  resourceIds: z.array(z.string().uuid()).max(10),
  sourceUrls: z.array(z.string().url()).max(10),
  requestedCount: z.number().int().min(1).max(10),
  difficulty: z.enum(["easy", "medium", "hard"]),
  focus: z.string().trim().max(500).nullable(),
  instructions: z.string().trim().max(2_000).nullable(),
}).strict().refine((value) => value.resourceIds.length + value.sourceUrls.length > 0, "At least one source is required.")
  .refine((value) => value.resourceIds.length + value.sourceUrls.length <= 10, "At most 10 sources are allowed.");

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return scenarioGenerationInvalidRequestResponse(); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return scenarioGenerationInvalidRequestResponse();
  const { certificationId, ...payload } = parsed.data;
  try {
    const data = await startCertDrillAdminScenarioGenerationServer(certificationId, payload);
    return Response.json({ success: true as const, data }, { status: 201 });
  } catch (error) {
    return scenarioGenerationHelperErrorResponse(error);
  }
}
