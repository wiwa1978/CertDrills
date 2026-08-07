import { z } from "zod";

import { startCertDrillAdminBlueprintParseRunServer } from "@/lib/api/certdrill.server";
import {
  blueprintAnalysisHelperErrorResponse,
  blueprintAnalysisInvalidRequestResponse,
} from "./responses";

const startBlueprintParseRunSchema = z.object({
  certificationId: z.string().uuid(),
  resourceId: z.string().uuid(),
}).strict();

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return blueprintAnalysisInvalidRequestResponse();
  }

  const parsedBody = startBlueprintParseRunSchema.safeParse(body);
  if (!parsedBody.success) {
    return blueprintAnalysisInvalidRequestResponse();
  }

  try {
    const data = await startCertDrillAdminBlueprintParseRunServer(
      parsedBody.data.certificationId,
      parsedBody.data.resourceId,
    );

    return Response.json({ success: true as const, data }, { status: 201 });
  } catch (error) {
    return blueprintAnalysisHelperErrorResponse(error);
  }
}
