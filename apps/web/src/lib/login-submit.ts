import type { SignInInput } from "@/schemas";

type UserWithRole = {
  role?: string | null;
};

export const WEB_LOGIN_FORBIDDEN_ERROR_CODE = "WEB_LOGIN_FORBIDDEN";

export function getPasswordSignInRequest(values: SignInInput, rememberMeEnabled: boolean) {
  return {
    email: values.email,
    password: values.password,
    ...(rememberMeEnabled && { rememberMe: values.rememberMe }),
  };
}

export function getWebLoginAccessDecision(user: UserWithRole | null | undefined) {
  if (user?.role === "user") {
    return { allowed: true } as const;
  }

  return {
    allowed: false,
    errorCode: WEB_LOGIN_FORBIDDEN_ERROR_CODE,
  } as const;
}
