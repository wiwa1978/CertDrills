import { z } from "zod";

import { getCertDrillAdminBlueprintParseRunServer } from "@/lib/api/certdrill.server";

const invalidBlueprintAnalysisRequest = {
  success: false as const,
  error: { message: "Invalid blueprint analysis request." },
};
const blueprintAnalysisRequestFailedMessage = "Blueprint analysis request failed.";

const blueprintParseRunIdSchema = z.string().uuid();

function invalidRequestResponse() {
  return Response.json(invalidBlueprintAnalysisRequest, { status: 400 });
}

function helperErrorResponse(error: unknown) {
  return Response.json({
    success: false as const,
    error: {
      message: error instanceof Error ? blueprintAnalysisRequestFailedMessage : blueprintAnalysisRequestFailedMessage,
    },
  }, { status: 500 });
}

export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const parsedRunId = blueprintParseRunIdSchema.safeParse(runId);

  if (!parsedRunId.success) {
    return invalidRequestResponse();
  }

  try {
    const data = await getCertDrillAdminBlueprintParseRunServer(parsedRunId.data);
    return Response.json({ success: true as const, data }, { status: 200 });
  } catch (error) {
    return helperErrorResponse(error);
  }
}
