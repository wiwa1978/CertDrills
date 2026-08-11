import { z } from "zod";

export const countrySchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
});

export const profileSchema = z.object({
  name: z.string().min(1, "Name is required"),
  image: z.string().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  street: z.string().min(1, "Street is required"),
  number: z.string().min(1, "Number is required"),
  zipcode: z.string().min(1, "Zipcode is required"),
  town: z.string().min(1, "Town is required"),
  countryId: z.string().min(1, "Country is required"),
});

export const emailChangeSchema = z.object({
  newEmail: z.string().email("Please enter a valid email"),
  currentPassword: z.string().min(1, "Password is required"),
});

export type Country = z.infer<typeof countrySchema>;
export type ProfileFormValues = z.infer<typeof profileSchema>;
export type EmailChangeFormValues = z.infer<typeof emailChangeSchema>;
