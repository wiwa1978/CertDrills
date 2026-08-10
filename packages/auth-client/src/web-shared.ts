import { dodopaymentsClient } from "@dodopayments/better-auth";
import { passkeyClient } from "@better-auth/passkey/client";
import { inferAdditionalFields, magicLinkClient, twoFactorClient } from "better-auth/client/plugins";

import { authAdditionalUserFields } from "@platform/auth-shared";

import type { CreateWebAuthClientOptions } from "./types";

function additionalFieldsPlugin() {
  return inferAdditionalFields({ user: authAdditionalUserFields });
}

type BasePlugins<Plugins extends import("better-auth").BetterAuthClientPlugin[]> = [
  ReturnType<typeof additionalFieldsPlugin>,
  ReturnType<typeof dodopaymentsClient>,
  ReturnType<typeof twoFactorClient>,
  ReturnType<typeof passkeyClient>,
  ReturnType<typeof magicLinkClient>,
  ...Plugins,
];

export function createBasePlugins<Plugins extends import("better-auth").BetterAuthClientPlugin[]>(
  options: CreateWebAuthClientOptions<Plugins>,
): BasePlugins<Plugins> {
  const features = options.features ?? {};
  const extraPlugins = options.plugins ?? [] as unknown as Plugins;
  const plugins = [
    additionalFieldsPlugin(),
    ...(features.billing === false ? [] : [dodopaymentsClient()]),
    ...(features.twoFactor === false ? [] : [twoFactorClient()]),
    ...(features.passkeys === false ? [] : [passkeyClient()]),
    ...(features.magicLink === false ? [] : [magicLinkClient()]),
    ...extraPlugins,
  ];
  return plugins as unknown as BasePlugins<Plugins>;
}

export function createFetchOptions(options: CreateWebAuthClientOptions) {
  return {
    onError(e: { error: unknown }) {
      options.onError?.({ error: e.error, context: e });
    },
  };
}
