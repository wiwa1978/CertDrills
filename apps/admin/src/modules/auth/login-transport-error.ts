export type UnexpectedLoginErrorKey = "NETWORK_ERROR" | "default";

export function unexpectedLoginErrorKey(error: unknown): UnexpectedLoginErrorKey {
  if (!(error instanceof TypeError)) {
    return "default";
  }

  const message = error.message.trim().toLowerCase();
  return message === "failed to fetch"
    || message === "load failed"
    || message.startsWith("networkerror")
    ? "NETWORK_ERROR"
    : "default";
}
