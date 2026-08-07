export const BLUEPRINT_ANALYSIS_REQUEST_FAILED_MESSAGE = "Blueprint analysis request failed.";

const MAX_BLUEPRINT_ANALYSIS_ERROR_MESSAGE_LENGTH = 300;

export function blueprintAnalysisErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return BLUEPRINT_ANALYSIS_REQUEST_FAILED_MESSAGE;
  }

  const message = error.message.trim();
  if (message.length === 0) {
    return BLUEPRINT_ANALYSIS_REQUEST_FAILED_MESSAGE;
  }

  return message.slice(0, MAX_BLUEPRINT_ANALYSIS_ERROR_MESSAGE_LENGTH);
}
