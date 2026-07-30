import { createAuthClient } from "better-auth/react";

import type { CreateWebAuthClientOptions } from "./types";
import { createBasePlugins, createFetchOptions } from "./web-shared";

export function createWebUserAuthClient(options: CreateWebAuthClientOptions) {
  return createAuthClient({
    baseURL: options.baseURL,
    plugins: createBasePlugins(options),
    fetchOptions: createFetchOptions(options),
  });
}
