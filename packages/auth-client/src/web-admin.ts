import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";

import type { CreateWebAuthClientOptions } from "./types";
import { createBasePlugins, createFetchOptions } from "./web-shared";

export function createWebAdminAuthClient(options: CreateWebAuthClientOptions) {
  const basePlugins = createBasePlugins();
  const admin = adminClient();
  return createAuthClient({
    baseURL: options.baseURL,
    plugins: [...basePlugins, admin] as [...typeof basePlugins, typeof admin],
    fetchOptions: createFetchOptions(options),
  });
}

export const createWebAuthClient = createWebAdminAuthClient;
