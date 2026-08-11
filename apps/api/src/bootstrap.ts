import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, haveIBeenPwned, magicLink, openAPI, twoFactor } from "better-auth/plugins";
import { adminAc, userAc } from "better-auth/plugins/admin/access";
import { passkey } from "@better-auth/passkey";
import { dodopayments, portal } from "@dodopayments/better-auth";
import { and, eq, gt, isNull, lte } from "drizzle-orm";
import DodoPayments from "dodopayments";

import { authAdditionalUserFields, createAuthModule } from "@platform/auth-core";
import { createEmailModule, createResendProvider } from "@platform/email-core";
import {
  createPaymentWebhookIngestion,
  createPaymentsModule,
  mapDodoEvent,
  type PaymentWebhookIngestion,
  type WebhookFailureAuditEvent,
} from "@platform/payments-core";
import type { PlatformProductDefinition } from "@platform/module-contracts";
import { createPlatformDb, mobileRefreshToken, user } from "@platform/platform-db";

import { authConfig } from "./config/auth";
import { createAuthRealmConfig } from "./config/auth-realms";
import { buildSocialProviders } from "./config/auth-social-providers";
import { creditPackages } from "./config/billing";
import { dodoBrandsFromEnvironment } from "./config/dodo-brands";
import { env } from "./env";
import { createAdminService } from "./modules/admin/service";
import { createAuditService } from "./modules/audit/service";
import { createCapabilityService } from "./modules/billing/capability-service";
import { createApplicationSettingsService } from "./modules/application-settings/service";
import { createCheckoutIntentsService } from "./modules/billing/checkout-intents";
import { createBillingReconciliationService } from "./modules/billing/reconciliation";
import { createAdminCreditsDashboardService } from "./modules/billing/credits-dashboard-service";
import { createAdminSubscriptionFinanceDashboardService } from "./modules/billing/subscription-finance-dashboard-service";
import { createAdminTransactionFinanceDashboardService } from "./modules/billing/transaction-finance-dashboard-service";
import { createBillingService } from "./modules/billing/service";
import { createDiscountsService } from "./modules/discounts/service";
import { createPaymentEventHandler } from "./modules/billing/payment-event-handler";
import { createSubscriptionService } from "./modules/billing/subscription-service";
import { createSubscriptionWebhookHandler } from "./modules/billing/subscription-webhooks";
import { createTransactionService } from "./modules/billing/transaction-service";
import { createPaymentProviderRegistry } from "./modules/payments/provider";
import { createDodoPaymentProvider } from "./modules/payments/providers/dodo";
import { createStripePaymentProvider } from "./modules/payments/providers/stripe";
import { createPaymentWebhookEventStore } from "./modules/payments/webhook-event-store";
import { createBetterAuthDodoWebhook } from "./modules/payments/better-auth-webhook-context";
import { createNotificationsService } from "./modules/notifications/service";
import { createPrivacyService } from "./modules/privacy/service";
import { createAzureBlobPrivacyExportStorage } from "./modules/privacy/storage";
import { createVouchersService } from "./modules/vouchers/service";
import { createApiKeysService } from "./modules/api-keys/service";
import { createEmailDeliveryService } from "./modules/email/delivery";
import { buildActionEmail } from "./modules/email/templates";
import { createPlatformInngestFunctions } from "./inngest/functions";
import { inngest } from "./inngest/client";
import { createOutboxPublisher, insertOutboxEvent } from "./modules/background/outbox";
import { createWebhookRecoveryService } from "./modules/payments/webhook-recovery";
import { createPostgresRateLimitStore } from "./modules/security/postgres-rate-limit-store";
import { createProductLifecycleCoordinator } from "./composition/product-lifecycle";

export function createPaymentProviderAuthPlugins(
  client: DodoPayments | null,
  dodoWebhookIngestion: PaymentWebhookIngestion,
) {
  if (!client) {
    return [];
  }

  const getCustomerParams = (authUser: { id: string }) => ({
    metadata: {
      userId: authUser.id,
    },
  });
  const webhookPlugins = env.DODO_PAYMENTS_WEBHOOK_SECRET
    ? [createBetterAuthDodoWebhook(env.DODO_PAYMENTS_WEBHOOK_SECRET, dodoWebhookIngestion)]
    : [];

  return [
    dodopayments({
      client,
      createCustomerOnSignUp: true,
      getCustomerParams,
      use: [portal(), ...webhookPlugins],
    }),
  ];
}
export function createPlatformServices(productDefinition: PlatformProductDefinition) {
const adminAllowlist = new Set(
  (env.ADMIN_ALLOWLIST ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean),
);

const { db } = createPlatformDb({
  connectionString: env.DATABASE_URL,
});
const productLifecycle = createProductLifecycleCoordinator();
const rateLimitStore = createPostgresRateLimitStore(db);
const auditService = createAuditService({ db });
const applicationSettingsService = createApplicationSettingsService({ db });

const emailProvider = env.RESEND_API_KEY
  ? createResendProvider({
      apiKey: env.RESEND_API_KEY,
      from: env.RESEND_FROM_EMAIL ?? "noreply@example.com",
    })
  : {
      async send() {
        return { success: false, error: new Error("No email provider configured") } as const;
      },
    };

const outboxPublisher = createOutboxPublisher({
  db,
  send: (event) => inngest.send(event),
});
const emailDeliveryService = createEmailDeliveryService({
  db,
  provider: emailProvider,
  publishOutbox: outboxPublisher.publishById,
});

const emailModule = createEmailModule({
  provider: {
    send: emailDeliveryService.sendEmail,
  },
  defaultFrom: env.RESEND_FROM_EMAIL ?? "noreply@example.com",
});

const notificationsService = createNotificationsService({ db });
const privacyExportStorageConnectionString = env.AZURE_PRIVACY_EXPORT_STORAGE_CONNECTION_STRING;
if (!privacyExportStorageConnectionString) {
  throw new Error("AZURE_PRIVACY_EXPORT_STORAGE_CONNECTION_STRING is required to start the API");
}
const privacyExportStorage = createAzureBlobPrivacyExportStorage({
  connectionString: privacyExportStorageConnectionString,
  containerName: env.AZURE_PRIVACY_EXPORT_STORAGE_CONTAINER,
});
const privacyService = createPrivacyService({
  db,
  storage: privacyExportStorage,
  enqueueExport: (executor, input) => insertOutboxEvent(executor, {
    name: "platform/privacy.export.requested",
    data: input,
    dedupeKey: `privacy-export:${input.exportId}`,
  }),
  exportProductData: productLifecycle.exportUserData,
});
const apiKeysService = createApiKeysService({ db });

const dodoPaymentsClient = env.DODO_PAYMENTS_API_KEY
  ? new DodoPayments({
      bearerToken: env.DODO_PAYMENTS_API_KEY,
      environment: env.DODO_PAYMENTS_ENVIRONMENT,
    })
  : null;


const paymentProviders = createPaymentProviderRegistry(
  env.PAYMENT_PROVIDER === "stripe" ? createStripePaymentProvider() : createDodoPaymentProvider({
    apiKey: env.DODO_PAYMENTS_API_KEY,
    environment: env.DODO_PAYMENTS_ENVIRONMENT,
    appUrl: env.APP_URL,
    brands: dodoBrandsFromEnvironment(env),
    client: dodoPaymentsClient,
  }),
  [
    createDodoPaymentProvider({
      apiKey: env.DODO_PAYMENTS_API_KEY,
      environment: env.DODO_PAYMENTS_ENVIRONMENT,
      appUrl: env.APP_URL,
      brands: dodoBrandsFromEnvironment(env),
      client: dodoPaymentsClient,
    }),
    createStripePaymentProvider(),
  ],
);

const billingService = createBillingService({
  db,
  paymentProvider: paymentProviders.activeProvider,
  capabilities: productDefinition.capabilities,
  notifications: notificationsService,
});
const capabilityService = createCapabilityService({
  db,
  definitions: productDefinition.capabilities,
  consumeCredits: billingService.consumeCredits,
});
const billingReconciliationService = createBillingReconciliationService({ db, paymentProvider: paymentProviders.activeProvider });
const subscriptionService = createSubscriptionService({ db, paymentProvider: paymentProviders.activeProvider });
const checkoutIntentsService = createCheckoutIntentsService({ db });
const transactionService = createTransactionService({
  db,
  paymentProvider: paymentProviders.activeProvider,
  checkoutIntents: checkoutIntentsService,
});
const adminService = createAdminService({
  db,
  adminSecret: env.ADMIN_SECRET,
});
const adminCreditsDashboardService = createAdminCreditsDashboardService({ adminService });
const adminSubscriptionFinanceDashboardService = createAdminSubscriptionFinanceDashboardService({
  db,
  paymentProvider: paymentProviders.activeProvider,
});
const adminTransactionFinanceDashboardService = createAdminTransactionFinanceDashboardService({
  db,
  paymentProvider: paymentProviders.activeProvider,
});
const discountsService = createDiscountsService({
  db,
  paymentProvider: paymentProviders.activeProvider,
});
const vouchersService = createVouchersService({
  db,
  notifications: notificationsService,
});
const paymentWebhookEventStore = createPaymentWebhookEventStore({ db });
const onWebhookFailure = async (event: WebhookFailureAuditEvent) => {
  try {
    await auditService.recordAuditEntry({
      action: "billing.webhook.failure",
      outcome: "failure",
      targetType: "payment_webhook_event",
      targetId: event.providerEventId ?? null,
      metadata: {
        provider: event.provider,
        providerEventId: event.providerEventId ?? null,
        eventType: event.eventType ?? null,
        paymentId: event.paymentId ?? null,
        error: event.error,
      },
    });
  } catch {
    // Webhook audit failures must not mask webhook response behavior.
  }
};
const paymentEventHandler = createPaymentEventHandler({
  creditPackages,
  billing: billingService,
  checkoutIntents: checkoutIntentsService,
  subscriptions: {
    handleSubscriptionWebhook: createSubscriptionWebhookHandler({
      subscriptions: subscriptionService,
    }),
    recordSubscriptionPayment: subscriptionService.recordSubscriptionPayment,
  },
  transactions: {
    handleTransactionPayment: transactionService.handleTransactionPayment,
    processTransactionRefund: transactionService.processTransactionRefund,
  },
});
const dodoWebhookIngestion = createPaymentWebhookIngestion({
  provider: "dodo",
  mapEvent: mapDodoEvent,
  webhookEventStore: paymentWebhookEventStore,
  onWebhookFailure,
  onPaymentEvent: paymentEventHandler,
});
const webhookRecoveryService = createWebhookRecoveryService({
  db,
  replay: async (provider, payload) => {
    if (provider !== "dodo") throw new Error(`Unsupported webhook recovery provider: ${provider}`);
    const event = mapDodoEvent(payload);
    if (!event) throw new Error("Stored webhook payload is no longer supported");
    await paymentEventHandler(event);
  },
  onRecoveryFailure: ({ provider, providerEventId, error }) => onWebhookFailure({
    provider,
    providerEventId,
    outcome: "failure",
    error,
  }),
});
const inngestFunctions = createPlatformInngestFunctions({
  billingReconciliation: () => billingReconciliationService.reconcileProviderBillingStateSafely(),
  recoverWebhooks: () => webhookRecoveryService.recoverFailed(),
  expirePrivacyExports: () => privacyService.expireExports(),
  generatePrivacyExport: privacyService.generateExport,
  deliverEmail: emailDeliveryService.deliver,
  publishPendingEvents: outboxPublisher.publishPending,
  cleanupEmails: emailDeliveryService.cleanupCompleted,
  cleanupOutbox: outboxPublisher.cleanupPublished,
  cleanupRateLimits: () => rateLimitStore.cleanupExpired(),
});

type AuthModuleOptions = Parameters<typeof createAuthModule>[0];
type BetterAuthOptions = NonNullable<AuthModuleOptions["betterAuthOptions"]>;

function createBetterAuthOptions(realmConfig: ReturnType<typeof createAuthRealmConfig>): BetterAuthOptions {
  return {
    secret: env.BETTER_AUTH_SECRET,
    baseURL: `${env.API_URL}${realmConfig.basePath}`,
    trustedOrigins: realmConfig.includePublicPlugins
      ? [
          env.APP_URL,
          env.API_URL,
          ...(env.ADMIN_APP_URL ? [env.ADMIN_APP_URL] : []),
          ...(env.BETTER_AUTH_ALLOWED_ORIGINS?.split(",").map((item) => item.trim()).filter(Boolean) ?? []),
        ]
      : [realmConfig.applicationUrl, env.API_URL],
    database: drizzleAdapter(db, {
      provider: "pg",
    }),
    databaseHooks: {
      user: {
        delete: {
          before: async (user) => productLifecycle.deleteUserData(user.id),
        },
      },
    },
    advanced: {
      cookiePrefix: realmConfig.cookiePrefix,
      database: {
        generateId: () => crypto.randomUUID(),
      },
      cookies: {
        session_token: {
          attributes: {
            httpOnly: true,
            secure: env.NODE_ENV === "production",
            sameSite: env.COOKIE_SAMESITE,
            domain: env.COOKIE_DOMAIN,
            path: "/",
          },
        },
      },
    },
    user: {
      changeEmail: {
        enabled: authConfig.allowChangeEmail,
      },
      deleteUser: {
        enabled: authConfig.allowDeleteUser,
      },
      additionalFields: authAdditionalUserFields,
    },
    emailAndPassword: {
      enabled: true,
      autoSignIn: !authConfig.requireEmailVerification,
      minPasswordLength: authConfig.passwordValidation.minLength,
      maxPasswordLength: authConfig.passwordValidation.maxLength,
      requireEmailVerification: authConfig.requireEmailVerification,
      resetPasswordTokenExpiresIn: authConfig.passwordResetTokenExpiresInHours * 60 * 60,
      sendResetPassword: async ({ user, url }) => {
        await emailModule.sendTemplate({
          to: user.email,
          subject: "Reset your password",
          ...buildActionEmail({ greetingName: user.name, instruction: "Reset your password", url }),
        });
      },
    },
    emailVerification: {
      sendOnSignUp: authConfig.sendVerificationEmailOnSignup,
      autoSignInAfterVerification: authConfig.autoSignInAfterVerification,
      expiresIn: authConfig.verificationTokenExpiresInHours * 60 * 60,
      sendVerificationEmail: async ({ user, url }) => {
        await emailModule.sendTemplate({
          to: user.email,
          subject: "Verify your email",
          ...buildActionEmail({ greetingName: user.name, instruction: "Verify your email", url }),
        });
      },
    },
    socialProviders: buildSocialProviders(env, authConfig),
    account: {
      accountLinking: {
        enabled: authConfig.allowAccountLinking,
        allowDifferentEmails: authConfig.allowDifferentEmailsOnLink,
      },
    },
    session: {
      expiresIn: authConfig.sessionExpiresIn,
      updateAge: authConfig.sessionUpdateAge,
      freshAge: authConfig.sessionFreshAge,
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5,
      },
    },
    plugins: [
      ...(authConfig.enableTwoFactor
        ? [
            twoFactor({
              issuer: authConfig.twoFactorIssuer,
              backupCodes: {
                length: 10,
                characters: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
              },
            }),
          ]
        : []),
      ...(authConfig.enablePasskeys
        ? [
            passkey({
              rpName: authConfig.twoFactorIssuer,
              rpID: new URL(realmConfig.applicationUrl).hostname,
              origin: realmConfig.applicationUrl,
            }),
          ]
        : []),
      ...(authConfig.enableMagicLink
        ? [
            magicLink({
              expiresIn: authConfig.magicLinkTokenExpiresInMinutes * 60,
              sendMagicLink: async ({ email, url }) => {
                await emailModule.sendTemplate({
                  to: email,
                  subject: "Your magic link",
                  ...buildActionEmail({ instruction: "Use this magic link", url }),
                });
              },
            }),
          ]
        : []),
      ...(authConfig.enableHaveIBeenPwned ? [haveIBeenPwned()] : []),
      admin({
        defaultRole: "user",
        adminRoles: ["admin"],
        roles: {
          user: userAc,
          admin: adminAc,
        },
      }),
      ...(realmConfig.includePublicPlugins
        ? [
            openAPI({ disableDefaultReference: true }),
            ...createPaymentProviderAuthPlugins(dodoPaymentsClient, dodoWebhookIngestion),
          ]
        : []),
    ],
  };
}

function createAuthModuleOptions(betterAuthOptions: BetterAuthOptions): AuthModuleOptions {
  return {
    betterAuthOptions,
    users: {
      async findById(userId) {
        const [record] = await db
          .select({
            id: user.id,
            role: user.role,
            email: user.email,
            emailVerified: user.emailVerified,
            twoFactorEnabled: user.twoFactorEnabled,
            banned: user.banned,
            banExpires: user.banExpires,
          })
          .from(user)
          .where(eq(user.id, userId))
          .limit(1);

        return record ?? null;
      },
    },
    admin: {
      allowlist: adminAllowlist,
      totpRequired: env.ADMIN_PORTAL_TOTP_REQUIRED,
    },
    jwt: {
      secret: env.JWT_SECRET,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      accessTokenTtlSeconds: env.JWT_ACCESS_TTL_SECONDS,
      refreshTokenTtlSeconds: env.JWT_REFRESH_TTL_SECONDS,
    },
    refreshTokens: {
      async create({ tokenHash, userId, expiresAt }) {
        await db.insert(mobileRefreshToken).values({
          tokenHash,
          userId,
          expiresAt,
        });
      },
      async findActiveByHash(tokenHash) {
        const [record] = await db
          .select({ userId: mobileRefreshToken.userId })
          .from(mobileRefreshToken)
          .where(and(
            eq(mobileRefreshToken.tokenHash, tokenHash),
            isNull(mobileRefreshToken.revokedAt),
            gt(mobileRefreshToken.expiresAt, new Date()),
          ));

        return record ?? null;
      },
      async rotate({ currentTokenHash, nextTokenHash, userId, nextExpiresAt }) {
        return db.transaction(async (tx) => {
          const now = new Date();
          const updatedRows = await tx
            .update(mobileRefreshToken)
            .set({ revokedAt: now, replacedByTokenHash: nextTokenHash })
            .where(and(
              eq(mobileRefreshToken.tokenHash, currentTokenHash),
              eq(mobileRefreshToken.userId, userId),
              isNull(mobileRefreshToken.revokedAt),
              gt(mobileRefreshToken.expiresAt, now),
            ))
            .returning({ id: mobileRefreshToken.id });

          if (updatedRows.length === 0) return false;

          await tx.insert(mobileRefreshToken).values({
            tokenHash: nextTokenHash,
            userId,
            expiresAt: nextExpiresAt,
          });
          return true;
        });
      },
      async revokeByHash(tokenHash) {
        await db
          .update(mobileRefreshToken)
          .set({ revokedAt: new Date() })
          .where(and(eq(mobileRefreshToken.tokenHash, tokenHash), isNull(mobileRefreshToken.revokedAt)));
      },
      async cleanupExpired() {
        await db
          .delete(mobileRefreshToken)
          .where(lte(mobileRefreshToken.expiresAt, new Date()));
      },
    },
  };
}

const authModule = createAuthModule(
  createAuthModuleOptions(createBetterAuthOptions(createAuthRealmConfig("public"))),
);
const adminAuthModule = createAuthModule(
  createAuthModuleOptions(createBetterAuthOptions(createAuthRealmConfig("admin"))),
);

const paymentsModule = createPaymentsModule({
  dodoWebhookSecret: env.DODO_PAYMENTS_WEBHOOK_SECRET,
  webhookEventStore: paymentWebhookEventStore,
  onWebhookFailure,
  onPaymentEvent: paymentEventHandler,
});

return {
  db,
  rateLimitStore,
  authModule,
  adminAuthModule,
  adminService,
  adminCreditsDashboardService,
  adminSubscriptionFinanceDashboardService,
  adminTransactionFinanceDashboardService,
  apiKeysService,
  auditService,
  applicationSettingsService,
  billingService,
  billingReconciliationService,
  capabilityService,

  checkoutIntentsService,
  subscriptionService,
  transactionService,
  discountsService,
  emailDeliveryService,
  outboxPublisher,
  inngestFunctions,
  notificationsService,
  privacyService,
  productLifecycle,
  vouchersService,
  paymentsModule,
  paymentProviders,
  webhookRecoveryService,
  dodoPaymentsClient,
};
}

export type PlatformServices = ReturnType<typeof createPlatformServices>;
