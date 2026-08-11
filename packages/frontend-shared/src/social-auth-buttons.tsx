"use client";

import type { ComponentType, ElementType, ReactNode } from "react";

const DEFAULT_REDIRECT = "/dashboard";

type AuthActionResult = {
  error: null | { message?: string };
};

type SocialAuthActionButtonProps = {
  variant: "outline";
  className: string;
  showToast: boolean;
  action: () => Promise<AuthActionResult>;
  children: ReactNode;
};

type SocialAuthProviderDetails = {
  name: string;
  Icon: ElementType<{ className?: string }>;
};

export function createSocialAuthButtons<Provider extends string>(options: {
  ActionButton: ComponentType<SocialAuthActionButtonProps>;
  providers: readonly Provider[];
  providerDetails: Record<Provider, SocialAuthProviderDetails>;
  signIn: (provider: Provider, callbackUrl: string) => Promise<AuthActionResult>;
}) {
  return function SocialAuthButtons({ callbackUrl = DEFAULT_REDIRECT }: { callbackUrl?: string }) {
    return options.providers.map((provider) => {
      const { Icon, name } = options.providerDetails[provider];

      return (
        <options.ActionButton
          variant="outline"
          key={provider}
          className="w-full"
          showToast={true}
          action={() => options.signIn(provider, callbackUrl)}
        >
          <Icon className="size-5" />
          {name}
        </options.ActionButton>
      );
    });
  };
}
