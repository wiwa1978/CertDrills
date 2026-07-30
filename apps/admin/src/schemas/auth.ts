import { z } from "zod";
import {
  createSignUpSchema,
  extractFieldErrors,
  getPasswordSchema as buildPasswordSchema,
  magicLinkSchema,
  signInSchema,
  type MagicLinkFormValues,
  type PasswordErrorMessages,
} from "@platform/contracts";

import { authConfig, type PasswordValidation } from "@/config/auth";

export type { MagicLinkFormValues, PasswordErrorMessages, SignInInput } from "@platform/contracts";

export function getPasswordSchema(validation?: Partial<PasswordValidation>, errorMessages?: PasswordErrorMessages) {
  return buildPasswordSchema(
    {
      minLength: validation?.minLength ?? authConfig.passwordValidation.minLength,
      maxLength: validation?.maxLength ?? authConfig.passwordValidation.maxLength,
      regex: validation?.regex ?? authConfig.passwordValidation.regex,
    },
    errorMessages,
  );
}

export const passwordSchema = getPasswordSchema();

export const userSchema = z.object({
  id: z.string().min(1, "User ID is required"),
  name: z.string().optional().nullable(),
  email: z.string().email("Invalid email format").optional().nullable(),
});

export type User = z.infer<typeof userSchema>;
export type SignInErrors = Partial<Record<keyof z.infer<typeof signInSchema>, string>>;

export const signUpSchema = createSignUpSchema(passwordSchema, {
  confirmPassword: authConfig.confirmPasswordEnabled,
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignUpErrors = Partial<Record<keyof SignUpInput, string>>;

export { extractFieldErrors, magicLinkSchema, signInSchema };
