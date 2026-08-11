"use client";

import { createSocialAuthButtons } from "@platform/frontend-shared/social-auth-buttons";

import { BetterAuthActionButton } from "@/components/layout/frontend/better-auth-action-button";
import { authClient } from "@/lib/auth-client";
import { SUPPORTED_OAUTH_PROVIDER_DETAILS, SUPPORTED_OAUTH_PROVIDERS } from "@/lib/auth-providers";

export const SocialAuthButtons = createSocialAuthButtons({
  ActionButton: BetterAuthActionButton,
  providers: SUPPORTED_OAUTH_PROVIDERS,
  providerDetails: SUPPORTED_OAUTH_PROVIDER_DETAILS,
  signIn: (provider, callbackURL) => authClient.signIn.social({ provider, callbackURL }),
});
