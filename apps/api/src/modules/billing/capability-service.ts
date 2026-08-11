import { and, asc, eq, inArray } from "drizzle-orm";

import type { CapabilityDefinition } from "@platform/module-contracts";
import {
  transactionEntitlements,
  userSubscriptions,
  type PlatformDb,
} from "@platform/platform-db";
import type { ConsumeCreditsResponse } from "@platform/contracts/wire";

type CapabilityConsumptionInput = {
  idempotencyKey: string;
  description?: string;
  metadata?: Record<string, unknown>;
};

type CapabilityServiceDeps = {
  db: PlatformDb;
  definitions: readonly CapabilityDefinition[];
  consumeCredits: (
    userId: string,
    input: CapabilityConsumptionInput & { featureKey: string },
  ) => Promise<ConsumeCreditsResponse>;
};

const subscriptionAccessStatuses = ["active", "trialing"] as const;

export function createCapabilityService(deps: CapabilityServiceDeps) {
  const definitions = new Map(deps.definitions.map((definition) => [definition.key, definition]));

  async function resolveForUser(userId: string) {
    const [subscriptions, entitlements] = await Promise.all([
      deps.db
        .select({ planKey: userSubscriptions.planKey })
        .from(userSubscriptions)
        .where(and(
          eq(userSubscriptions.userId, userId),
          inArray(userSubscriptions.status, subscriptionAccessStatuses),
        )),
      deps.db
        .select({ productKey: transactionEntitlements.productKey })
        .from(transactionEntitlements)
        .where(and(
          eq(transactionEntitlements.userId, userId),
          eq(transactionEntitlements.status, "available"),
        )),
    ]);
    const planKeys = new Set(subscriptions.map((subscription) => subscription.planKey));
    const productKeys = new Set(entitlements.map((entitlement) => entitlement.productKey));

    return deps.definitions
      .filter((definition) => definition.defaultAccess === "allowed"
        || definition.grants?.plans?.some((planKey) => planKeys.has(planKey))
        || definition.grants?.transactionProducts?.some((productKey) => productKeys.has(productKey)))
      .map((definition) => definition.key);
  }

  async function consumeEntitlement(userId: string, definition: CapabilityDefinition) {
    const productKeys = definition.grants?.transactionProducts ?? [];
    if (productKeys.length === 0) {
      throw new Error(`Capability has no transaction product grants: ${definition.key}`);
    }

    return deps.db.transaction(async (tx) => {
      const [entitlement] = await tx
        .select({ id: transactionEntitlements.id })
        .from(transactionEntitlements)
        .where(and(
          eq(transactionEntitlements.userId, userId),
          eq(transactionEntitlements.status, "available"),
          inArray(transactionEntitlements.productKey, productKeys),
        ))
        .orderBy(asc(transactionEntitlements.createdAt))
        .limit(1)
        .for("update", { skipLocked: true });
      if (!entitlement) throw new Error("No available entitlement for capability");

      const [consumed] = await tx
        .update(transactionEntitlements)
        .set({ status: "consumed", consumedAt: new Date(), updatedAt: new Date() })
        .where(and(
          eq(transactionEntitlements.id, entitlement.id),
          eq(transactionEntitlements.status, "available"),
        ))
        .returning({ id: transactionEntitlements.id });
      if (!consumed) throw new Error("Capability entitlement was already consumed");

      return { capabilityKey: definition.key, entitlementId: consumed.id, consumption: "entitlement" as const };
    });
  }

  async function consume(userId: string, capabilityKey: string, input: CapabilityConsumptionInput) {
    const definition = definitions.get(capabilityKey);
    if (!definition) throw new Error(`Unknown capability: ${capabilityKey}`);

    if (definition.consumption === "credits") {
      const result = await deps.consumeCredits(userId, { ...input, featureKey: capabilityKey });
      return { capabilityKey, consumption: "credits" as const, ...result };
    }
    if (definition.consumption === "entitlement") {
      return consumeEntitlement(userId, definition);
    }

    if (!(await resolveForUser(userId)).includes(capabilityKey)) {
      throw new Error("Capability not granted");
    }
    return { capabilityKey, consumption: "none" as const };
  }

  return { definitions, resolveForUser, consume };
}

export type CapabilityService = ReturnType<typeof createCapabilityService>;
