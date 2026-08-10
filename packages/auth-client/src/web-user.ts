import { createAuthClient } from "better-auth/react";

import type { CreateWebAuthClientOptions } from "./types";
import { createBasePlugins, createFetchOptions } from "./web-shared";

export function createWebUserAuthClient<Plugins extends import("better-auth").BetterAuthClientPlugin[]>(options: CreateWebAuthClientOptions<Plugins>) {
  return createAuthClient({
    baseURL: options.baseURL,
    plugins: createBasePlugins(options),
    fetchOptions: createFetchOptions(options),
  });
}
