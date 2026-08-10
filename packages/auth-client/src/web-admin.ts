import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";

import type { CreateWebAuthClientOptions } from "./types";
import { createBasePlugins, createFetchOptions } from "./web-shared";

export function createWebAdminAuthClient<Plugins extends import("better-auth").BetterAuthClientPlugin[]>(options: CreateWebAuthClientOptions<Plugins>) {
  return createAuthClient({
    baseURL: options.baseURL,
    plugins: [...createBasePlugins(options), adminClient()],
    fetchOptions: createFetchOptions(options),
  });
}

export const createWebAuthClient = createWebAdminAuthClient;
