import { eventType } from "inngest";
import { z } from "zod";

export const emailDeliveryRequested = eventType("platform/email.delivery.requested", {
  schema: z.object({ deliveryId: z.string().uuid() }),
});

export const outboxDispatchRequested = eventType("platform/outbox.dispatch.requested", {
  schema: z.object({ outboxId: z.string().uuid() }),
});

export const privacyExportRequested = eventType("platform/privacy.export.requested", {
  schema: z.object({ exportId: z.string().uuid(), userId: z.string().uuid() }),
});

export const platformEventTypes = {
  emailDeliveryRequested,
  outboxDispatchRequested,
  privacyExportRequested,
} as const;
