import "server-only";

import { blueprintAnalysisErrorMessage } from "./error-message";

const invalidBlueprintAnalysisRequest = {
  success: false as const,
  error: { message: "Invalid blueprint analysis request." },
};

export function blueprintAnalysisInvalidRequestResponse() {
  return Response.json(invalidBlueprintAnalysisRequest, { status: 400 });
}

export function blueprintAnalysisHelperErrorResponse(error: unknown) {
  return Response.json({
    success: false as const,
    error: {
      message: blueprintAnalysisErrorMessage(error),
    },
  }, { status: 500 });
}
