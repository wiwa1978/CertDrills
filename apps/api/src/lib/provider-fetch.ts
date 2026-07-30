const DEFAULT_PROVIDER_TIMEOUT_MS = 10_000;

export function withProviderTimeout(options: RequestInit = {}, timeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS): RequestInit {
  return {
    ...options,
    signal: options.signal ?? AbortSignal.timeout(timeoutMs),
  };
}

export function isProviderTimeout(error: unknown) {
  return error instanceof DOMException && error.name === "TimeoutError";
}
