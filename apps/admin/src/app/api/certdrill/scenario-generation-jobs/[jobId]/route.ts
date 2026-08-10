import { z } from "zod";

import { getCertDrillAdminScenarioGenerationJobServer } from "@/lib/api/certdrill.server";
import { scenarioGenerationHelperErrorResponse, scenarioGenerationInvalidRequestResponse } from "../responses";

const jobIdSchema = z.string().uuid();

export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const parsed = jobIdSchema.safeParse(jobId);
  if (!parsed.success) return scenarioGenerationInvalidRequestResponse();
  try {
    const data = await getCertDrillAdminScenarioGenerationJobServer(parsed.data);
    return Response.json({ success: true as const, data }, { status: 200 });
  } catch (error) {
    return scenarioGenerationHelperErrorResponse(error);
  }
}
