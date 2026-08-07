import { z } from "zod";

import { getCertDrillAdminBlueprintParseRunServer } from "@/lib/api/certdrill.server";
import {
  blueprintAnalysisHelperErrorResponse,
  blueprintAnalysisInvalidRequestResponse,
} from "../responses";

const blueprintParseRunIdSchema = z.string().uuid();

export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const parsedRunId = blueprintParseRunIdSchema.safeParse(runId);

  if (!parsedRunId.success) {
    return blueprintAnalysisInvalidRequestResponse();
  }

  try {
    const data = await getCertDrillAdminBlueprintParseRunServer(parsedRunId.data);
    return Response.json({ success: true as const, data }, { status: 200 });
  } catch (error) {
    return blueprintAnalysisHelperErrorResponse(error);
  }
}
