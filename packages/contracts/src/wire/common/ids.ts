import { z } from "zod";

export const uuidSchema = z.string().uuid();

export const userIdParamSchema = z.object({ userId: uuidSchema });
export const discountIdParamSchema = z.object({ discountId: uuidSchema });
export const notificationIdParamSchema = z.object({ notificationId: uuidSchema });
