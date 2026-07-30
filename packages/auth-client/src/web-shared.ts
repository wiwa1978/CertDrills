import { dodopaymentsClient } from "@dodopayments/better-auth";
import { passkeyClient } from "@better-auth/passkey/client";
import { inferAdditionalFields, magicLinkClient, twoFactorClient } from "better-auth/client/plugins";

import { authAdditionalUserFields } from "@platform/auth-shared";

import type { CreateWebAuthClientOptions } from "./types";

export function createBasePlugins(options: CreateWebAuthClientOptions) {
  const features = options.features ?? {};

  return [
    inferAdditionalFields({ user: authAdditionalUserFields }),
    ...(features.billing === false ? [] : [dodopaymentsClient()]),
    ...(features.twoFactor === false ? [] : [twoFactorClient()]),
    ...(features.passkeys === false ? [] : [passkeyClient()]),
    ...(features.magicLink === false ? [] : [magicLinkClient()]),
    ...(options.plugins ?? []),
  ];
}

export function createFetchOptions(options: CreateWebAuthClientOptions) {
  return {
    onError(e: { error: unknown }) {
      options.onError?.({ error: e.error, context: e });
    },
  };
}
