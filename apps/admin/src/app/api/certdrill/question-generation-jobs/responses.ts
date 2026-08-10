import "server-only";

const REQUEST_FAILED_MESSAGE = "Question generation request failed.";
const MAX_ERROR_MESSAGE_LENGTH = 300;

export function questionGenerationInvalidRequestResponse() {
  return Response.json({ success: false as const, error: { message: "Invalid question generation request." } }, { status: 400 });
}

export function questionGenerationHelperErrorResponse(error: unknown) {
  const rawMessage = error instanceof Error ? error.message.trim() : "";
  const message = rawMessage ? rawMessage.slice(0, MAX_ERROR_MESSAGE_LENGTH) : REQUEST_FAILED_MESSAGE;
  return Response.json({ success: false as const, error: { message } }, { status: 500 });
}
