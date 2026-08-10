import { z } from "zod";

import { getCertDrillAdminQuestionGenerationJobServer } from "@/lib/api/certdrill.server";
import { questionGenerationHelperErrorResponse, questionGenerationInvalidRequestResponse } from "../responses";

const jobIdSchema = z.string().uuid();

export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const parsed = jobIdSchema.safeParse(jobId);
  if (!parsed.success) return questionGenerationInvalidRequestResponse();

  try {
    const data = await getCertDrillAdminQuestionGenerationJobServer(parsed.data);
    return Response.json({ success: true as const, data }, { status: 200 });
  } catch (error) {
    return questionGenerationHelperErrorResponse(error);
  }
}
