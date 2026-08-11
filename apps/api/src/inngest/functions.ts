import { cron } from "inngest";

import { inngest } from "./client";
import { emailDeliveryRequested, privacyExportRequested } from "./events";

export type PlatformInngestFunctionDeps = {
  billingReconciliation: () => Promise<unknown>;
  recoverWebhooks: () => Promise<unknown>;
  expirePrivacyExports: () => Promise<unknown>;
  generatePrivacyExport: (exportId: string, userId: string) => Promise<unknown>;
  deliverEmail: (deliveryId: string) => Promise<unknown>;
  publishPendingEvents: () => Promise<unknown>;
  cleanupEmails: () => Promise<{ deleted: number }>;
  cleanupOutbox: () => Promise<{ deleted: number }>;
  cleanupRateLimits: () => Promise<number>;
};

export function createPlatformInngestFunctions(deps: PlatformInngestFunctionDeps) {
  const billingReconciliation = inngest.createFunction(
    {
      id: "platform-billing-reconciliation",
      name: "Platform billing reconciliation",
      retries: 4,
      triggers: [cron("0 * * * *")],
    },
    async ({ step }) => step.run("reconcile-provider-billing", deps.billingReconciliation),
  );

  const webhookRecovery = inngest.createFunction(
    {
      id: "platform-webhook-recovery",
      name: "Platform payment webhook recovery",
      retries: 4,
      triggers: [cron("*/5 * * * *")],
    },
    async ({ step }) => step.run("recover-payment-webhooks", deps.recoverWebhooks),
  );

  const expirePrivacyExports = inngest.createFunction(
    {
      id: "platform-expire-privacy-exports",
      name: "Expire platform privacy exports",
      retries: 4,
      triggers: [cron("7 * * * *")],
    },
    async ({ step }) => step.run("expire-privacy-exports", deps.expirePrivacyExports),
  );

  const generatePrivacyExport = inngest.createFunction(
    {
      id: "platform-generate-privacy-export",
      name: "Generate platform privacy export",
      retries: 4,
      triggers: [privacyExportRequested],
    },
    async ({ event, step }) => step.run(
      "generate-privacy-export",
      () => deps.generatePrivacyExport(event.data.exportId, event.data.userId),
    ),
  );

  const deliverEmail = inngest.createFunction(
    {
      id: "platform-deliver-email",
      name: "Deliver platform email",
      retries: 4,
      triggers: [emailDeliveryRequested],
    },
    async ({ event, step }) => step.run("deliver-email", () => deps.deliverEmail(event.data.deliveryId)),
  );

  const publishPendingEvents = inngest.createFunction(
    {
      id: "platform-publish-pending-events",
      name: "Publish pending platform events",
      retries: 4,
      triggers: [cron("* * * * *")],
    },
    async ({ step }) => step.run("publish-pending-events", deps.publishPendingEvents),
  );

  const cleanupOperationalRecords = inngest.createFunction(
    {
      id: "platform-cleanup-operational-records",
      name: "Clean up platform operational records",
      retries: 4,
      triggers: [cron("TZ=UTC 23 3 * * *")],
    },
    async ({ step }) => {
      const emails = await step.run("cleanup-email-deliveries", deps.cleanupEmails);
      const outbox = await step.run("cleanup-background-events", deps.cleanupOutbox);
      const rateLimits = await step.run("cleanup-rate-limits", deps.cleanupRateLimits);
      return { emails: emails.deleted, outbox: outbox.deleted, rateLimits };
    },
  );

  return [
    billingReconciliation,
    webhookRecovery,
    expirePrivacyExports,
    generatePrivacyExport,
    deliverEmail,
    publishPendingEvents,
    cleanupOperationalRecords,
  ] as const;
}

export type PlatformInngestFunction = ReturnType<typeof createPlatformInngestFunctions>[number];
