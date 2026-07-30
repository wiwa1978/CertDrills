import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";

import type { CreateWebAuthClientOptions } from "./types";
import { createBasePlugins, createFetchOptions } from "./web-shared";

export function createWebAdminAuthClient(options: CreateWebAuthClientOptions) {
  return createAuthClient({
    baseURL: options.baseURL,
    plugins: [...createBasePlugins(options), adminClient()],
    fetchOptions: createFetchOptions(options),
  });
}

export const createWebAuthClient = createWebAdminAuthClient;
