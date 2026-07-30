"use client";

import { BetterAuthActionButton } from "@/components/layout/frontend/better-auth-action-button";
import { authClient } from "@/lib/auth-client";
import {
  SUPPORTED_OAUTH_PROVIDER_DETAILS,
  SUPPORTED_OAUTH_PROVIDERS,
} from "@/lib/auth-providers";

const DEFAULT_REDIRECT = "/dashboard";

interface SocialAuthButtonsProps {
  /** Custom callback URL after successful OAuth. Defaults to /dashboard */
  callbackUrl?: string;
}

export function SocialAuthButtons({
  callbackUrl = DEFAULT_REDIRECT,
}: SocialAuthButtonsProps) {
  return SUPPORTED_OAUTH_PROVIDERS.map((provider) => {
    const Icon = SUPPORTED_OAUTH_PROVIDER_DETAILS[provider].Icon;

    return (
      <BetterAuthActionButton
        variant="outline"
        key={provider}
        className="w-full"
        showToast={true}
        action={() => {
          return authClient.signIn.social({
            provider,
            callbackURL: callbackUrl,
          });
        }}
      >
        <Icon className="size-5" />
        {SUPPORTED_OAUTH_PROVIDER_DETAILS[provider].name}
      </BetterAuthActionButton>
    );
  });
}
