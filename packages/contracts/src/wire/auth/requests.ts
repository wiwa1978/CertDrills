import { z } from "zod";

export const mobileTokenRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  deviceName: z.string().min(1).max(128).optional(),
});

export const mobileRefreshRequestSchema = z.object({
  refreshToken: z.string().min(16),
});

export const mobileRevokeRequestSchema = z.object({
  refreshToken: z.string().min(16),
});
