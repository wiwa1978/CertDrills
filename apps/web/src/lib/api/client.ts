import { env } from "@/env";
import { ApiRequestError, createApiRequest, normalizeBaseUrl } from "@platform/frontend-shared";

const API_BASE_URL = normalizeBaseUrl(env.NEXT_PUBLIC_API_URL || env.NEXT_PUBLIC_APP_URL);

export { ApiRequestError };

export const apiRequest = createApiRequest({
  baseURL: API_BASE_URL,
  nodeEnv: process.env.NODE_ENV,
});
