import { z } from "zod";

import { startCertDrillAdminBlueprintParseRunServer } from "@/lib/api/certdrill.server";

const invalidBlueprintAnalysisRequest = {
  success: false as const,
  error: { message: "Invalid blueprint analysis request." },
};
const blueprintAnalysisRequestFailedMessage = "Blueprint analysis request failed.";

const startBlueprintParseRunSchema = z.object({
  certificationId: z.string().uuid(),
  resourceId: z.string().uuid(),
}).strict();

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

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return invalidRequestResponse();
  }

  const parsedBody = startBlueprintParseRunSchema.safeParse(body);
  if (!parsedBody.success) {
    return invalidRequestResponse();
  }

  try {
    const data = await startCertDrillAdminBlueprintParseRunServer(
      parsedBody.data.certificationId,
      parsedBody.data.resourceId,
    );

    return Response.json({ success: true as const, data }, { status: 201 });
  } catch (error) {
    return helperErrorResponse(error);
  }
}
