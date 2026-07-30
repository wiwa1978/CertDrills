type ApiErrorBody = {
  error?: string | {
    code?: string;
    message?: string;
  };
  errorCode?: string;
  requestId?: string;
};

function getApiErrorCode(body: ApiErrorBody | null, response: Response) {
  const nestedCode = typeof body?.error === "object" && body.error !== null ? body.error.code : undefined;
  return nestedCode ?? body?.errorCode ?? response.headers.get("x-error-code") ?? undefined;
}

function getApiErrorMessage(body: ApiErrorBody | null, rawBody: string, response: Response) {
  if (typeof body?.error === "string") {
    return body.error;
  }

  if (typeof body?.error === "object" && body.error !== null && typeof body.error.message === "string") {
    return body.error.message;
  }

  return rawBody || response.statusText;
}

export class ApiRequestError extends Error {
  status: number;
  errorCode?: string;
  requestId?: string;
  digest?: string;

  constructor({
    status,
    message,
    errorCode,
    requestId,
  }: {
    status: number;
    message: string;
    errorCode?: string;
    requestId?: string;
  }) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.errorCode = errorCode;
    this.requestId = requestId;
    this.digest = errorCode ?? requestId;
  }
}

type RequestHeadersResolver = () => HeadersInit | undefined | Promise<HeadersInit | undefined>;

export type ApiRequestFactoryOptions = {
  baseURL: string;
  nodeEnv?: string;
  getHeaders?: RequestHeadersResolver;
  credentials?: RequestCredentials;
  defaultCache?: RequestCache;
};

export type BearerApiRequestFactoryOptions = Omit<ApiRequestFactoryOptions, "getHeaders" | "credentials"> & {
  getToken: () => string | undefined | Promise<string | undefined>;
};

export function createApiRequest(options: ApiRequestFactoryOptions) {
  return async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
    const requestHeaders = new Headers(init?.headers ?? {});
    const hasBody = init?.body !== undefined && init?.body !== null;

    if (hasBody && !requestHeaders.has("Content-Type")) {
      requestHeaders.set("Content-Type", "application/json");
    }

    if (options.getHeaders) {
      const extraHeaders = await options.getHeaders();

      if (extraHeaders) {
        const resolvedHeaders = new Headers(extraHeaders);
        for (const [key, value] of resolvedHeaders.entries()) {
          requestHeaders.set(key, value);
        }
      }
    }

    const response = await fetch(`${options.baseURL}${path}`, {
      credentials: options.credentials ?? "include",
      cache: init?.cache ?? options.defaultCache ?? "no-store",
      ...init,
      headers: requestHeaders,
    });

    if (!response.ok) {
      const rawBody = await response.text();
      let parsedBody: ApiErrorBody | null = null;

      try {
        parsedBody = rawBody ? (JSON.parse(rawBody) as ApiErrorBody) : null;
      } catch {
        parsedBody = null;
      }

      const requestId = parsedBody?.requestId ?? response.headers.get("x-request-id") ?? undefined;
      const errorCode = getApiErrorCode(parsedBody, response);
      const errorMessage = getApiErrorMessage(parsedBody, rawBody, response);
      const isProductionServerError = options.nodeEnv === "production" && response.status >= 500;
      const message = isProductionServerError
        ? `Something went wrong. Error code: ${errorCode ?? requestId ?? "UNKNOWN"}`
        : `API request failed (${response.status}): ${errorMessage}`;

      throw new ApiRequestError({
        status: response.status,
        message,
        errorCode,
        requestId,
      });
    }

    return response.json() as Promise<T>;
  };
}

export function createBearerApiRequest(options: BearerApiRequestFactoryOptions) {
  const apiRequest = createApiRequest({
    ...options,
    credentials: "omit",
    getHeaders: async () => {
      const token = await options.getToken();

      return token ? { Authorization: `Bearer ${token}` } : undefined;
    },
  });

  return function bearerApiRequest<T>(path: string, init?: RequestInit): Promise<T> {
    return apiRequest<T>(path, init ? { ...init, credentials: "omit" } : init);
  };
}
