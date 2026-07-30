import { z } from "zod";

export interface PasswordErrorMessages {
  PASSWORD_REQUIRED?: string;
  PASSWORD_TOO_SHORT?: string;
  PASSWORD_TOO_LONG?: string;
  INVALID_PASSWORD?: string;
}

export type PasswordValidation = {
  minLength?: number;
  maxLength?: number;
  regex?: RegExp;
};

export function getPasswordSchema(validation?: Partial<PasswordValidation>, errorMessages?: PasswordErrorMessages) {
  const config = {
    minLength: validation?.minLength,
    maxLength: validation?.maxLength,
    regex: validation?.regex,
  };

  let schema = z.string().min(1, {
    message: errorMessages?.PASSWORD_REQUIRED ?? "Password is required",
  });

  if (config.minLength) {
    schema = schema.min(config.minLength, {
      message: errorMessages?.PASSWORD_TOO_SHORT ?? `Password must be at least ${config.minLength} characters`,
    });
  }

  if (config.maxLength) {
    schema = schema.max(config.maxLength, {
      message: errorMessages?.PASSWORD_TOO_LONG ?? `Password must be at most ${config.maxLength} characters`,
    });
  }

  if (config.regex) {
    schema = schema.regex(config.regex, {
      message: errorMessages?.INVALID_PASSWORD ?? "Password does not meet requirements",
    });
  }

  return schema;
}

export const signInSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().optional(),
});

export const magicLinkSchema = z.object({
  email: z.string().email("Please enter a valid email"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Please enter a valid email"),
});

export function createSignUpSchema(passwordSchema: z.ZodString, options?: { confirmPassword?: boolean }) {
  const baseSchema = z.object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Please enter a valid email"),
    password: passwordSchema,
  });

  if (options?.confirmPassword === false) {
    return baseSchema;
  }

  return baseSchema
    .extend({
      passwordConfirmation: z.string().min(1, "Please confirm your password"),
    })
    .refine((data) => data.password === data.passwordConfirmation, {
      message: "Passwords do not match",
      path: ["passwordConfirmation"],
    });
}

export function extractFieldErrors<T extends Record<string, unknown>>(result: { success: false; error: z.ZodError<T> }) {
  const errors: Partial<Record<keyof T, string>> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof T;
    if (field && !errors[field]) {
      errors[field] = issue.message;
    }
  }
  return errors;
}

export type SignInInput = z.infer<typeof signInSchema>;
export type MagicLinkFormValues = z.infer<typeof magicLinkSchema>;
export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;
