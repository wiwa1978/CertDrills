import { inArray } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";

import { account, transactionOrderItems, transactionOrders, user } from "@platform/platform-db";

import { openTestDatabase } from "../tests/support/database";

const ADMIN_USER_ID = "10000000-0000-4000-8000-000000000001";
const ADMIN_ACCOUNT_ID = "10000000-0000-4000-8000-000000000002";
const USER_ID = "10000000-0000-4000-8000-000000000003";
const USER_ACCOUNT_ID = "10000000-0000-4000-8000-000000000004";
function requiredEnvironment(name: "E2E_ADMIN_EMAIL" | "E2E_ADMIN_PASSWORD" | "E2E_USER_EMAIL" | "E2E_USER_PASSWORD") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required to manage system-test fixtures`);
  return value;
}

const ADMIN_EMAIL = requiredEnvironment("E2E_ADMIN_EMAIL");
const ADMIN_PASSWORD = requiredEnvironment("E2E_ADMIN_PASSWORD");
const USER_EMAIL = requiredEnvironment("E2E_USER_EMAIL");
const USER_PASSWORD = requiredEnvironment("E2E_USER_PASSWORD");
const database = openTestDatabase();

async function cleanup() {
  await database.db.delete(user).where(inArray(user.id, [ADMIN_USER_ID, USER_ID]));
}
async function seed() {
  await cleanup();

  await database.db.insert(user).values({
    id: ADMIN_USER_ID,
    name: "System Test Administrator",
    email: ADMIN_EMAIL,
    emailVerified: true,
    role: "admin",
    banned: false,
  });

  await database.db.insert(account).values({
    id: ADMIN_ACCOUNT_ID,
    accountId: ADMIN_USER_ID,
    providerId: "credential",
    userId: ADMIN_USER_ID,
    password: await hashPassword(ADMIN_PASSWORD),
  });


  await database.db.insert(user).values({
    id: USER_ID,
    name: "System Test User",
    email: USER_EMAIL,
    emailVerified: true,
    role: "user",
    banned: false,
  });

  await database.db.insert(account).values({
    id: USER_ACCOUNT_ID,
    accountId: USER_ID,
    providerId: "credential",
    userId: USER_ID,
    password: await hashPassword(USER_PASSWORD),
  });
  const now = new Date();
  const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);
  const orderDefinitions = [
    { id: "10000000-0000-4000-8000-000000000011", status: "paid" as const, subtotal: 800, tax: 200, daysAgo: 4 },
    { id: "10000000-0000-4000-8000-000000000012", status: "failed" as const, subtotal: 1200, tax: 300, daysAgo: 3 },
    { id: "10000000-0000-4000-8000-000000000013", status: "pending_payment" as const, subtotal: 400, tax: 100, daysAgo: 2 },
    { id: "10000000-0000-4000-8000-000000000014", status: "refunded" as const, subtotal: 1600, tax: 400, daysAgo: 1 },
  ];

  await database.db.insert(transactionOrders).values(orderDefinitions.map((definition) => {
    const createdAt = daysAgo(definition.daysAgo);
    const successful = definition.status === "paid" || definition.status === "refunded";
    return {
      id: definition.id,
      userId: ADMIN_USER_ID,
      status: definition.status,
      currency: "EUR",
      subtotalAmount: definition.subtotal,
      taxAmount: definition.tax,
      totalAmount: definition.subtotal + definition.tax,
      paymentProvider: "dodo",
      paymentId: `e2e-payment-${definition.status}`,
      checkoutReferenceId: `e2e-checkout-${definition.status}`,
      createdAt,
      paidAt: successful ? createdAt : null,
      failedAt: definition.status === "failed" ? createdAt : null,
      fulfilledAt: successful ? createdAt : null,
    };
  }));

  await database.db.insert(transactionOrderItems).values([
    {
      id: "10000000-0000-4000-8000-000000000021",
      orderId: "10000000-0000-4000-8000-000000000011",
      productKey: "starterContent",
      quantity: 1,
      unitPrice: 1000,
      totalAmount: 1000,
      currency: "EUR",
      providerProductId: "e2e-provider-starter-content",
      metadata: { name: "Starter content", description: "System-test product" },
    },
    {
      id: "10000000-0000-4000-8000-000000000024",
      orderId: "10000000-0000-4000-8000-000000000014",
      productKey: "premiumContent",
      quantity: 1,
      unitPrice: 2000,
      totalAmount: 2000,
      currency: "EUR",
      providerProductId: "e2e-provider-premium-content",
      metadata: { name: "Premium content", description: "System-test product" },
    },
  ]);
}

async function verifyCleanup() {
  const remaining = await database.db
    .select({ id: user.id })
    .from(user)
    .where(inArray(user.id, [ADMIN_USER_ID, USER_ID]));
  if (remaining.length > 0) throw new Error("System-test fixtures were not fully removed");
}

try {
  if (process.argv.includes("--cleanup")) {
    await cleanup();
    console.info("Removed admin system-test fixtures");
  } else if (process.argv.includes("--verify-clean")) {
    await verifyCleanup();
    console.info("Verified admin system-test fixture cleanup");
  } else {
    await seed();
    console.info("Seeded admin system-test fixtures");
  }
} finally {
  await database.sql.end();
}
