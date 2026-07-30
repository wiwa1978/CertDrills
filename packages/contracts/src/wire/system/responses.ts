import { z } from "zod";

import { successResultSchema } from "../common/result";

export const healthStatusSchema = z.object({
  status: z.literal("ok"),
});

export const healthResponseSchema = successResultSchema(healthStatusSchema);

export type HealthStatus = z.infer<typeof healthStatusSchema>;
