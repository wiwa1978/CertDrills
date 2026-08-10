import { z } from "zod";

import { startCertDrillAdminCategoryDiscoveryServer } from "@/lib/api/certdrill.server";
import {
  blueprintAnalysisHelperErrorResponse,
  blueprintAnalysisInvalidRequestResponse,
} from "../blueprint-parse-runs/responses";

const startCategoryDiscoverySchema = z.object({
  certificationId: z.string().uuid(),
  url: z.string().url(),
}).strict();

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return blueprintAnalysisInvalidRequestResponse();
  }

  const parsedBody = startCategoryDiscoverySchema.safeParse(body);
  if (!parsedBody.success) {
    return blueprintAnalysisInvalidRequestResponse();
  }

  try {
    const data = await startCertDrillAdminCategoryDiscoveryServer(
      parsedBody.data.certificationId,
      parsedBody.data.url,
    );

    return Response.json({ success: true as const, data }, { status: 201 });
  } catch (error) {
    return blueprintAnalysisHelperErrorResponse(error);
  }
}
