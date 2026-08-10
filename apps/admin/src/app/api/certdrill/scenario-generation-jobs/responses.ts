import "server-only";

const REQUEST_FAILED_MESSAGE = "Scenario generation request failed.";
const MAX_ERROR_MESSAGE_LENGTH = 300;

export function scenarioGenerationInvalidRequestResponse() {
  return Response.json({ success: false as const, error: { message: "Invalid scenario generation request." } }, { status: 400 });
}

export function scenarioGenerationHelperErrorResponse(error: unknown) {
  const rawMessage = error instanceof Error ? error.message.trim() : "";
  const message = rawMessage ? rawMessage.slice(0, MAX_ERROR_MESSAGE_LENGTH) : REQUEST_FAILED_MESSAGE;
  return Response.json({ success: false as const, error: { message } }, { status: 500 });
}
