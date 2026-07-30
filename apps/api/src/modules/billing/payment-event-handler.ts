import type { NormalizedPaymentEvent, PaymentEventHandler } from "@platform/payments-core";

import { subscriptionPlans, type creditPackages as CreditPackagesList } from "../../config/billing";
import { ensureCreditBillingEnabled, ensureSubscriptionBillingEnabled } from "../../lib/feature-guards";
import type { CheckoutIntentRecord, CheckoutIntentsService } from "./checkout-intents";
import { isProviderSubscriptionWebhookEvent } from "./subscription-webhooks";

type CreditPackage = (typeof CreditPackagesList)[number];

export type PaymentEventHandlerDeps = {
  creditPackages: ReadonlyArray<CreditPackage>;
  billing: {
    getUserById: (userId: string) => Promise<{ id: string } | null>;
    processCreditPurchase: (
      userId: string,
      packageKey: string,
      paymentId: string,
      status: "completed" | "pending" | "failed",
      customerId: string | undefined,
      pricing: {
        priceExclVat: number;
        priceInclVat: number;
        vatAmount: number;
        currency: string;
      },
      snapshot: {
        provider: string;
        customerId?: string;
      },
    ) => Promise<unknown>;
    processCreditRefund: (paymentId: string, refundId?: string) => Promise<unknown>;
    processCreditDisputeLoss: (paymentId: string, disputeId?: string, disputeStatus?: string) => Promise<unknown>;
  };
  checkoutIntents?: CheckoutIntentsService;
  subscriptions?: {
    handleSubscriptionWebhook: (payload: unknown) => Promise<void>;
    recordSubscriptionPayment?: (input: {
      userId: string;
      planKey: string;
      paymentId: string;
      paymentStatus: "completed" | "pending" | "failed";
      providerCustomerId?: string | null;
      providerSubscriptionId?: string | null;
      dodoCustomerId?: string | null;
      dodoSubscriptionId?: string | null;
      pricing: {
        priceExclVat: number;
        priceInclVat: number;
        vatAmount: number;
        currency: string;
      };
    }) => Promise<unknown>;
  };
};

function productIdForProvider(product: { providerProductIds: Record<string, string> }, provider: string) {
  return product.providerProductIds[provider];
}

const DISPUTE_REVERSAL_EVENTS = new Set(["dispute.accepted", "dispute.lost"]);

type ValidatedCheckoutIntent = {
  intent: CheckoutIntentRecord;
  duplicateCompleted: boolean;
};

function getWebhookDataPayload(raw: unknown) {
  return typeof raw === "object" && raw !== null && "data" in raw
    ? (raw as { data: unknown }).data
    : {};
}

function getMetadataString(metadata: Record<string, string> | undefined, key: string) {
  return typeof metadata?.[key] === "string" ? metadata[key] : undefined;
}

function getCheckoutReferenceId(metadata: Record<string, string> | undefined) {
  return getMetadataString(metadata, "checkoutReferenceId") ?? getMetadataString(metadata, "referenceId");
}

async function findAndValidateCheckoutIntent(args: {
  checkoutIntents?: CheckoutIntentsService;
  event: NormalizedPaymentEvent;
  billingMode: "credits" | "subscriptions";
  userId: string;
  packageKey?: string | null;
  planKey?: string | null;
  productId: string;
  discountCode?: string | null;
}): Promise<ValidatedCheckoutIntent> {
  if (!args.checkoutIntents) {
    throw new Error(`Refusing payment ${args.event.paymentId}: checkout intent service is not configured.`);
  }

  const referenceId = getCheckoutReferenceId(args.event.metadata);
  if (!referenceId) {
    throw new Error(`Refusing payment ${args.event.paymentId}: checkout intent reference missing.`);
  }

  const intent = await args.checkoutIntents.findByReferenceId(referenceId);
  if (!intent) {
    throw new Error(`Refusing payment ${args.event.paymentId}: checkout intent ${referenceId} was not found.`);
  }

  if (intent.status === "completed" && intent.paymentId === args.event.paymentId) {
    return { intent, duplicateCompleted: true };
  }

  if (intent.status !== "pending") {
    throw new Error(`Refusing payment ${args.event.paymentId}: checkout intent ${referenceId} is ${intent.status}.`);
  }

  const metadata = args.event.metadata;
  const metadataProductId = getMetadataString(metadata, "productId");
  const metadataDiscountCode = getMetadataString(metadata, "discountCode") ?? null;

  const validations: Array<[boolean, string]> = [
    [intent.userId === args.userId, "userId"],
    [intent.billingMode === args.billingMode, "billingMode"],
    [(intent.packageKey ?? null) === (args.packageKey ?? null), "packageKey"],
    [(intent.planKey ?? null) === (args.planKey ?? null), "planKey"],
    [metadataProductId === args.productId, "metadata.productId"],
    [intent.productId === args.productId, "productId"],
    [(intent.discountCode ?? null) === metadataDiscountCode, "discountCode"],
  ];

  const failed = validations.find(([ok]) => !ok);
  if (failed) {
    throw new Error(`Refusing payment ${args.event.paymentId}: checkout intent ${failed[1]} mismatch.`);
  }

  return { intent, duplicateCompleted: false };
}

async function markCheckoutIntentForPaymentStatus(args: {
  checkoutIntents: CheckoutIntentsService;
  intent: CheckoutIntentRecord;
  paymentId: string;
  paymentStatus: "completed" | "pending" | "failed";
}) {
  if (args.paymentStatus === "completed") {
    await args.checkoutIntents.markCompleted({ id: args.intent.id, paymentId: args.paymentId });
    return;
  }

  if (args.paymentStatus === "failed") {
    await args.checkoutIntents.markFailed({ id: args.intent.id, paymentId: args.paymentId });
    return;
  }

  await args.checkoutIntents.markPending({ id: args.intent.id, paymentId: args.paymentId });
}

/**
 * Build the payment event handler that turns a verified provider payment
 * webhook into a local billing mutation.
 *
 * SECURITY: this handler refuses any event that does not carry an authoritative
 * `metadata.userId` (bound at checkout-URL construction time). Without that
 * binding an attacker who knows a victim's customer email could replay or
 * forge a webhook and have credits applied to whatever account the email
 * resolves to. Mapping by `metadata.userId` makes the credited account a
 * direct function of the authenticated session that initiated the checkout.
 */
export function createPaymentEventHandler(deps: PaymentEventHandlerDeps): PaymentEventHandler {
  return async (event: NormalizedPaymentEvent) => {
    if (isProviderSubscriptionWebhookEvent(event.eventType)) {
      ensureSubscriptionBillingEnabled();
      await deps.subscriptions?.handleSubscriptionWebhook({
        event_type: event.eventType,
        data: getWebhookDataPayload(event.raw),
      });
      return;
    }

    if (event.eventType === "refund.succeeded") {
      ensureCreditBillingEnabled();
      if (event.refundIsPartial) {
        throw new Error(`Refusing payment ${event.paymentId}: partial refunds require manual reconciliation.`);
      }

      await deps.billing.processCreditRefund(event.paymentId, event.refundId);
      return;
    }

    if (event.eventType.startsWith("dispute.")) {
      ensureCreditBillingEnabled();
      if (DISPUTE_REVERSAL_EVENTS.has(event.eventType)) {
        await deps.billing.processCreditDisputeLoss(event.paymentId, event.disputeId, event.disputeStatus);
      }

      return;
    }

    if (
      event.eventType !== "payment.succeeded" &&
      event.eventType !== "payment.processing" &&
      event.eventType !== "payment.failed"
    ) {
      return;
    }

    if (!event.productId) {
      throw new Error("Missing product id");
    }

    const metadataUserId =
      typeof event.metadata?.userId === "string" ? event.metadata.userId : undefined;

    if (!metadataUserId) {
      throw new Error(
        `Refusing payment ${event.paymentId}: metadata.userId missing. Checkout URLs must bind userId.`,
      );
    }

    if (event.metadata?.billingMode === "subscriptions") {
      ensureSubscriptionBillingEnabled();

      const planKey = typeof event.metadata.planKey === "string" ? event.metadata.planKey : undefined;
      if (!planKey) {
        throw new Error(`Refusing payment ${event.paymentId}: metadata.planKey missing.`);
      }

      if (!event.currency) {
        throw new Error(`Refusing payment ${event.paymentId}: currency missing.`);
      }

      if (!Number.isFinite(event.totalAmount) || event.totalAmount === undefined || event.totalAmount <= 0) {
        throw new Error(`Refusing payment ${event.paymentId}: invalid total amount.`);
      }

      if (!Number.isFinite(event.taxAmount) || event.taxAmount === undefined || event.taxAmount < 0) {
        throw new Error(`Refusing payment ${event.paymentId}: invalid tax amount.`);
      }

      if (event.taxAmount > event.totalAmount) {
        throw new Error(`Refusing payment ${event.paymentId}: tax amount exceeds total amount.`);
      }

      const foundUser = await deps.billing.getUserById(metadataUserId);
      if (!foundUser) {
        throw new Error(
          `Refusing payment ${event.paymentId}: metadata.userId ${metadataUserId} did not resolve to a known user.`,
        );
      }

      const paymentStatus = event.eventType === "payment.succeeded"
        ? "completed"
        : event.eventType === "payment.processing"
          ? "pending"
          : "failed";

      const checkoutIntentValidation = await findAndValidateCheckoutIntent({
        checkoutIntents: deps.checkoutIntents,
        event,
        billingMode: "subscriptions",
        userId: foundUser.id,
        planKey,
        packageKey: null,
        productId: event.productId,
        discountCode: getMetadataString(event.metadata, "discountCode") ?? null,
      });

      if (checkoutIntentValidation.duplicateCompleted) {
        return;
      }

      const matchedPlan = subscriptionPlans.find((item) => item.key === planKey);
      if (!matchedPlan || productIdForProvider(matchedPlan, event.provider) !== event.productId) {
        throw new Error(`Refusing payment ${event.paymentId}: unknown subscription plan.`);
      }

      if (event.currency !== matchedPlan.currency) {
        throw new Error(`Refusing payment ${event.paymentId}: expected ${matchedPlan.currency}, received ${event.currency}.`);
      }

      const discountCode = getMetadataString(event.metadata, "discountCode");
      if (!discountCode && event.totalAmount !== matchedPlan.price) {
        throw new Error(
          `Refusing payment ${event.paymentId}: expected amount ${matchedPlan.price}, received ${event.totalAmount}.`,
        );
      }

      await deps.subscriptions?.recordSubscriptionPayment?.({
        userId: foundUser.id,
        planKey,
        paymentId: event.paymentId,
        paymentStatus,
        providerCustomerId: event.customerId ?? null,
        providerSubscriptionId: event.metadata.subscriptionId,
        dodoCustomerId: event.customerId ?? null,
        dodoSubscriptionId: event.metadata.subscriptionId,
        pricing: {
          priceExclVat: event.totalAmount - event.taxAmount,
          priceInclVat: event.totalAmount,
          vatAmount: event.taxAmount,
          currency: event.currency,
        },
      });
      await markCheckoutIntentForPaymentStatus({
        checkoutIntents: deps.checkoutIntents!,
        intent: checkoutIntentValidation.intent,
        paymentId: event.paymentId,
        paymentStatus,
      });
      return;
    }

    ensureCreditBillingEnabled();

    const foundUser = await deps.billing.getUserById(metadataUserId);

    if (!foundUser) {
      throw new Error(
        `Refusing payment ${event.paymentId}: metadata.userId ${metadataUserId} did not resolve to a known user.`,
      );
    }

    const matchedPackage = deps.creditPackages.find((item) => productIdForProvider(item, event.provider) === event.productId);
    if (!matchedPackage) {
      throw new Error(`Unknown product id: ${event.productId}`);
    }

    if (!event.currency) {
      throw new Error(`Refusing payment ${event.paymentId}: currency missing.`);
    }

    if (event.currency !== matchedPackage.currency) {
      throw new Error(`Refusing payment ${event.paymentId}: expected ${matchedPackage.currency}, received ${event.currency}.`);
    }

    if (!Number.isFinite(event.totalAmount) || event.totalAmount === undefined || event.totalAmount <= 0) {
      throw new Error(`Refusing payment ${event.paymentId}: invalid total amount.`);
    }

    if (event.totalAmount !== matchedPackage.price) {
      throw new Error(
        `Refusing payment ${event.paymentId}: expected amount ${matchedPackage.price}, received ${event.totalAmount}.`,
      );
    }

    if (!Number.isFinite(event.taxAmount) || event.taxAmount === undefined || event.taxAmount < 0) {
      throw new Error(`Refusing payment ${event.paymentId}: invalid tax amount.`);
    }

    if (event.taxAmount > event.totalAmount) {
      throw new Error(`Refusing payment ${event.paymentId}: tax amount exceeds total amount.`);
    }

    const paymentStatus = event.eventType === "payment.succeeded"
      ? "completed"
      : event.eventType === "payment.processing"
        ? "pending"
        : "failed";

    if (getMetadataString(event.metadata, "billingMode") !== "credits") {
      throw new Error(`Refusing payment ${event.paymentId}: metadata.billingMode mismatch.`);
    }

    const metadataPackageKey = getMetadataString(event.metadata, "packageKey");
    if (metadataPackageKey !== matchedPackage.key) {
      throw new Error(`Refusing payment ${event.paymentId}: metadata.packageKey mismatch.`);
    }

    const checkoutIntentValidation = await findAndValidateCheckoutIntent({
      checkoutIntents: deps.checkoutIntents,
      event,
      billingMode: "credits",
      userId: foundUser.id,
      packageKey: matchedPackage.key,
      planKey: null,
      productId: event.productId,
      discountCode: getMetadataString(event.metadata, "discountCode") ?? null,
    });

    if (checkoutIntentValidation.duplicateCompleted) {
      return;
    }

    await deps.billing.processCreditPurchase(
      foundUser.id,
      matchedPackage.key,
      event.paymentId,
      paymentStatus,
      event.customerId,
      {
        priceExclVat: event.totalAmount - event.taxAmount,
        priceInclVat: event.totalAmount,
        vatAmount: event.taxAmount,
        currency: event.currency,
      },
      {
        provider: event.provider,
        customerId: event.customerId,
      },
    );
    await markCheckoutIntentForPaymentStatus({
      checkoutIntents: deps.checkoutIntents!,
      intent: checkoutIntentValidation.intent,
      paymentId: event.paymentId,
      paymentStatus,
    });
  };
}
