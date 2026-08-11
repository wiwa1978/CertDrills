import { dodopaymentsClient } from "@dodopayments/better-auth";
import { passkeyClient } from "@better-auth/passkey/client";
import { inferAdditionalFields, magicLinkClient, twoFactorClient } from "better-auth/client/plugins";

import { authAdditionalUserFields } from "@platform/auth-shared";

import type { CreateWebAuthClientOptions } from "./types";

export function createBasePlugins() {
  const additionalFields = inferAdditionalFields({ user: authAdditionalUserFields });
  const billing = dodopaymentsClient();
  const twoFactor = twoFactorClient();
  const passkeys = passkeyClient();
  const magicLink = magicLinkClient();
  return [
    additionalFields,
    billing,
    twoFactor,
    passkeys,
    magicLink,
  ] as [typeof additionalFields, typeof billing, typeof twoFactor, typeof passkeys, typeof magicLink];
}

export function createFetchOptions(options: CreateWebAuthClientOptions) {
  return {
    onError(e: { error: unknown }) {
      options.onError?.({ error: e.error, context: e });
    },
  };
}
