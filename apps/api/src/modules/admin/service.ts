import { timingSafeEqual } from "node:crypto";

import { and, desc, eq, gte, ilike, inArray, like, lt, or, sql } from "drizzle-orm";

import { creditPurchases, creditTransactions, user, userCredits, vouchers } from "@platform/platform-db";

type AdminServiceDeps = {
  db: any;
  adminSecret?: string;
};

function safeCompare(input: string, secret: string) {
  const inputBuffer = Buffer.from(input);
  const secretBuffer = Buffer.from(secret);

  if (inputBuffer.length !== secretBuffer.length) {
    return false;
  }

  try {
    return timingSafeEqual(inputBuffer, secretBuffer);
  } catch {
    return false;
  }
}

export function createAdminService(deps: AdminServiceDeps) {
  function normalizeLimit(limit: number, max = 100) {
    if (!Number.isFinite(limit)) {
      return Math.min(20, max);
    }

    return Math.min(Math.max(Math.trunc(limit), 1), max);
  }

  function normalizeOffset(offset: number) {
    if (!Number.isFinite(offset)) {
      return 0;
    }

    return Math.max(Math.trunc(offset), 0);
  }

  function normalizeSearchEmail(searchEmail?: string) {
    const normalized = searchEmail?.trim();
    return normalized ? normalized.slice(0, 255) : undefined;
  }

  function getUserListCondition(search?: string, role?: "user" | "admin") {
    const normalized = search?.trim().slice(0, 255);
    const conditions = [];

    if (normalized) {
      conditions.push(or(ilike(user.name, `%${normalized}%`), ilike(user.email, `%${normalized}%`)));
    }

    if (role) {
      conditions.push(eq(user.role, role));
    }

    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  async function verifySecret(input: string, configuredSecret: string | undefined, missingError: string) {
    if (!configuredSecret) {
      return { success: false as const, error: missingError };
    }

    const trimmedInput = input.trim();
    const trimmedSecret = configuredSecret.trim();

    if (!trimmedInput) {
      return { success: false as const, error: "Secret key is required." };
    }

    const isValid =
      trimmedInput.length === trimmedSecret.length && safeCompare(trimmedInput, trimmedSecret);

    return {
      success: isValid,
      error: isValid ? undefined : "Invalid secret key provided.",
    };
  }

  async function verifyAdminSecret(secret: string) {
    return verifySecret(secret, deps.adminSecret, "Admin secret is not configured.");
  }

  async function getDashboardStats() {
    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalUsersResult,
      thisMonthUsersResult,
      lastMonthTotalUsersResult,
      totalBannedUsersResult,
      completedPurchasesResult,
      lastMonthCompletedPurchasesResult,
      pendingPurchasesResult,
      failedPurchasesResult,
      refundedPurchasesResult,
      usageTransactionsResult,
      lastMonthUsageTransactionsResult,
      bonusTransactionsResult,
      purchaseTransactionsResult,
      lastMonthPurchaseTransactionsResult,
      refundTransactionsResult,
    ] = await Promise.all([
      deps.db.select({ count: sql<number>`COUNT(*)` }).from(user),
      deps.db
        .select({ count: sql<number>`COUNT(*)` })
        .from(user)
        .where(gte(user.createdAt, startOfThisMonth)),
      deps.db
        .select({ count: sql<number>`COUNT(*)` })
        .from(user)
        .where(lt(user.createdAt, endOfLastMonth)),
      deps.db
        .select({ count: sql<number>`COUNT(*)` })
        .from(user)
        .where(eq(user.banned, true)),
      deps.db
        .select({ count: sql<number>`COUNT(*)` })
        .from(creditPurchases)
        .where(eq(creditPurchases.paymentStatus, "completed")),
      deps.db
        .select({ count: sql<number>`COUNT(*)` })
        .from(creditPurchases)
        .where(
          and(
            eq(creditPurchases.paymentStatus, "completed"),
            lt(creditPurchases.createdAt, endOfLastMonth),
          ),
        ),
      deps.db
        .select({ count: sql<number>`COUNT(*)` })
        .from(creditPurchases)
        .where(eq(creditPurchases.paymentStatus, "pending")),
      deps.db
        .select({ count: sql<number>`COUNT(*)` })
        .from(creditPurchases)
        .where(eq(creditPurchases.paymentStatus, "failed")),
      deps.db
        .select({ count: sql<number>`COUNT(*)` })
        .from(creditPurchases)
        .where(eq(creditPurchases.paymentStatus, "refunded")),
      deps.db
        .select({ count: sql<number>`COUNT(*)` })
        .from(creditTransactions)
        .where(eq(creditTransactions.type, "usage")),
      deps.db
        .select({ count: sql<number>`COUNT(*)` })
        .from(creditTransactions)
        .where(and(eq(creditTransactions.type, "usage"), lt(creditTransactions.createdAt, endOfLastMonth))),
      deps.db
        .select({ count: sql<number>`COUNT(*)` })
        .from(creditTransactions)
        .where(eq(creditTransactions.type, "bonus")),
      deps.db
        .select({ count: sql<number>`COUNT(*)` })
        .from(creditTransactions)
        .where(eq(creditTransactions.type, "purchase")),
      deps.db
        .select({ count: sql<number>`COUNT(*)` })
        .from(creditTransactions)
        .where(
          and(eq(creditTransactions.type, "purchase"), lt(creditTransactions.createdAt, endOfLastMonth)),
        ),
      deps.db
        .select({ count: sql<number>`COUNT(*)` })
        .from(creditTransactions)
        .where(eq(creditTransactions.type, "refund")),
    ]);

    return {
      totalUsers: totalUsersResult[0]?.count || 0,
      thisMonthUsers: thisMonthUsersResult[0]?.count || 0,
      lastMonthUsers: lastMonthTotalUsersResult[0]?.count || 0,
      totalBannedUsers: totalBannedUsersResult[0]?.count || 0,
      totalCompletedPurchases: completedPurchasesResult[0]?.count || 0,
      lastMonthCompletedPurchases: lastMonthCompletedPurchasesResult[0]?.count || 0,
      totalPendingPurchases: pendingPurchasesResult[0]?.count || 0,
      totalFailedPurchases: failedPurchasesResult[0]?.count || 0,
      totalRefundedPurchases: refundedPurchasesResult[0]?.count || 0,
      totalUsageTransactions: usageTransactionsResult[0]?.count || 0,
      lastMonthUsageTransactions: lastMonthUsageTransactionsResult[0]?.count || 0,
      totalBonusTransactions: bonusTransactionsResult[0]?.count || 0,
      totalPurchaseTransactions: purchaseTransactionsResult[0]?.count || 0,
      lastMonthPurchaseTransactions: lastMonthPurchaseTransactionsResult[0]?.count || 0,
      totalRefundTransactions: refundTransactionsResult[0]?.count || 0,
    };
  }

  async function getVoucherStats() {
    const [voucherTotals] = await deps.db
      .select({
        totalVouchers: sql<number>`COUNT(*)`,
        activeVouchers: sql<number>`COALESCE(SUM(CASE WHEN ${vouchers.status} = 'active' THEN 1 ELSE 0 END), 0)`,
        redeemedVouchers: sql<number>`COALESCE(SUM(CASE WHEN ${vouchers.status} = 'redeemed' THEN 1 ELSE 0 END), 0)`,
        totalVoucherCredits: sql<number>`COALESCE(SUM(${vouchers.creditAmount} * ${vouchers.currentRedemptions}), 0)`,
      })
      .from(vouchers);

    return {
      totalVouchers: voucherTotals?.totalVouchers || 0,
      activeVouchers: voucherTotals?.activeVouchers || 0,
      redeemedVouchers: voucherTotals?.redeemedVouchers || 0,
      totalVoucherCredits: voucherTotals?.totalVoucherCredits || 0,
    };
  }

  async function getUsers(limit = 20, offset = 0, search?: string, role?: "user" | "admin") {
    const normalizedLimit = normalizeLimit(limit, 100);
    const normalizedOffset = normalizeOffset(offset);
    const whereCondition = getUserListCondition(search, role);

    const usersQuery = deps.db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        role: user.role,
        banned: user.banned,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
      })
      .from(user);

    const countQuery = deps.db.select({ count: sql<number>`COUNT(*)` }).from(user);

    const [users, totalResult] = await Promise.all([
      (whereCondition ? usersQuery.where(whereCondition) : usersQuery)
        .orderBy(desc(user.createdAt))
        .limit(normalizedLimit)
        .offset(normalizedOffset),
      whereCondition ? countQuery.where(whereCondition) : countQuery,
    ]);

    return {
      users,
      total: totalResult[0]?.count || 0,
    };
  }

  async function searchUsers(query: string, limit = 20) {
    const normalizedQuery = query.trim();
    const normalizedLimit = normalizeLimit(limit, 50);

    if (normalizedQuery.length < 2) {
      return [];
    }

    return deps.db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
      })
      .from(user)
      .where(or(ilike(user.name, `%${normalizedQuery}%`), ilike(user.email, `%${normalizedQuery}%`)))
      .limit(normalizedLimit);
  }

  async function getUserStats() {
    const [totalUsers, admins, banned] = await Promise.all([
      deps.db.select({ count: sql<number>`COUNT(*)` }).from(user),
      deps.db
        .select({ count: sql<number>`COUNT(*)` })
        .from(user)
        .where(eq(user.role, "admin")),
      deps.db.select({ count: sql<number>`COUNT(*)` }).from(user).where(eq(user.banned, true)),
    ]);

    return {
      totalUsers: totalUsers[0]?.count || 0,
      totalAdmins: admins[0]?.count || 0,
      totalBanned: banned[0]?.count || 0,
    };
  }

  async function getUserById(userId: string) {
    const rows = await deps.db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image,
        role: user.role,
        banned: user.banned,
        banReason: user.banReason,
        banExpires: user.banExpires,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    return rows[0] ?? null;
  }

  async function countActiveAdmins() {
    const [result] = await deps.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(user)
      .where(and(eq(user.role, "admin"), eq(user.banned, false)));

    return Number(result?.count ?? 0);
  }

  async function getUserCreditBalance(userId: string) {
    let credits = await deps.db.query.userCredits.findFirst({
      where: eq(userCredits.userId, userId),
    });

    if (!credits) {
      const [created] = await deps.db
        .insert(userCredits)
        .values({
          userId,
          balance: "0",
          totalPurchased: "0",
          totalSpent: "0",
        })
        .returning();

      credits = created;
    }

    const purchaseTotal = await deps.db
      .select({
        totalInclVat: sql<string>`COALESCE(SUM(${creditPurchases.priceInclVat}), 0)`,
        totalExclVat: sql<string>`COALESCE(SUM(${creditPurchases.priceExclVat}), 0)`,
        totalVat: sql<string>`COALESCE(SUM(${creditPurchases.vatAmount}), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(creditPurchases)
      .where(sql`${creditPurchases.userId} = ${userId} AND ${creditPurchases.paymentStatus} = 'completed'`);

    return {
      balance: Number(credits.balance),
      totalPurchased: Number(credits.totalPurchased),
      totalSpent: Number(credits.totalSpent),
      totalPurchasedAmount: Number(purchaseTotal[0]?.totalInclVat || "0") / 100,
      totalPurchasedAmountExclVat: Number(purchaseTotal[0]?.totalExclVat || "0") / 100,
      totalVatPaid: Number(purchaseTotal[0]?.totalVat || "0") / 100,
      totalPurchases: purchaseTotal[0]?.count || 0,
    };
  }

  async function getUserCreditHistory(userId: string, limit = 50) {
    const normalizedLimit = normalizeLimit(limit, 100);

    return deps.db.query.creditTransactions.findMany({
      where: eq(creditTransactions.userId, userId),
      orderBy: desc(creditTransactions.createdAt),
      limit: normalizedLimit,
    });
  }

  async function getUserCreditPurchases(userId: string, limit = 50) {
    const normalizedLimit = normalizeLimit(limit, 100);

    return deps.db
      .select({
        id: creditPurchases.id,
        packageKey: creditPurchases.packageKey,
        credits: creditPurchases.credits,
        bonusCredits: creditPurchases.bonusCredits,
        priceExclVat: creditPurchases.priceExclVat,
        priceInclVat: creditPurchases.priceInclVat,
        vatAmount: creditPurchases.vatAmount,
        currency: creditPurchases.currency,
        paymentSnapshot: creditPurchases.paymentSnapshot,
        paymentStatus: creditPurchases.paymentStatus,
        paymentId: creditPurchases.paymentId,
        createdAt: creditPurchases.createdAt,
      })
      .from(creditPurchases)
      .where(eq(creditPurchases.userId, userId))
      .orderBy(desc(creditPurchases.createdAt))
      .limit(normalizedLimit);
  }

  type TimeRange = "daily" | "weekly" | "monthly" | "yearly";
  const TIME_RANGE_CONFIGS: Record<TimeRange, { dateTrunc: string; daysBack: number }> = {
    daily: { dateTrunc: "day", daysBack: 30 },
    weekly: { dateTrunc: "week", daysBack: 84 },
    monthly: { dateTrunc: "month", daysBack: 365 },
    yearly: { dateTrunc: "year", daysBack: 365 * 5 },
  };

  function getTimeRangeConfig(timeRange: TimeRange) {
    return TIME_RANGE_CONFIGS[timeRange] ?? TIME_RANGE_CONFIGS.daily;
  }

  function calculateStartDate(daysBack: number): Date {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    return startDate;
  }

  function centsToEur(cents: number): number {
    return Number(cents) / 100;
  }

  async function getBillingStats() {
    const [
      totalPurchasesResult,
      totalCreditsPurchasedResult,
      totalCreditsConsumedResult,
      totalRevenueResult,
      creditTransactionTotalsResult,
    ] =
      await Promise.all([
        deps.db
          .select({ count: sql<number>`COUNT(*)` })
          .from(creditPurchases)
          .where(eq(creditPurchases.paymentStatus, "completed")),
        deps.db
          .select({
            total: sql<number>`COALESCE(SUM(${creditPurchases.credits} + ${creditPurchases.bonusCredits}), 0)`,
            purchased: sql<number>`COALESCE(SUM(${creditPurchases.credits}), 0)`,
            bonus: sql<number>`COALESCE(SUM(${creditPurchases.bonusCredits}), 0)`,
          })
          .from(creditPurchases)
          .where(eq(creditPurchases.paymentStatus, "completed")),
        deps.db
          .select({
            total: sql<number>`COALESCE(ROUND(SUM(CASE WHEN ${creditTransactions.type} = 'usage' THEN ABS(CAST(${creditTransactions.amount} AS NUMERIC)) ELSE 0 END)), 0)`,
          })
          .from(creditTransactions),
        deps.db
          .select({
            total: sql<number>`COALESCE(SUM(${creditPurchases.priceInclVat}), 0)`,
          })
          .from(creditPurchases)
          .where(eq(creditPurchases.paymentStatus, "completed")),
        deps.db
          .select({
            voucher: sql<number>`COALESCE(SUM(CASE WHEN ${creditTransactions.type} = 'voucher' THEN CAST(${creditTransactions.amount} AS NUMERIC) ELSE 0 END), 0)`,
            bonus: sql<number>`COALESCE(SUM(CASE WHEN ${creditTransactions.type} = 'bonus' THEN CAST(${creditTransactions.amount} AS NUMERIC) ELSE 0 END), 0)`,
            refund: sql<number>`COALESCE(SUM(CASE WHEN ${creditTransactions.type} = 'refund' THEN CAST(${creditTransactions.amount} AS NUMERIC) ELSE 0 END), 0)`,
            adminAdjustment: sql<number>`COALESCE(SUM(CASE WHEN ${creditTransactions.type} = 'admin_adjustment' THEN CAST(${creditTransactions.amount} AS NUMERIC) ELSE 0 END), 0)`,
          })
          .from(creditTransactions),
      ]);

    const purchasedCredits = Number(totalCreditsPurchasedResult[0]?.purchased ?? 0);
    const purchaseBonusCredits = Number(totalCreditsPurchasedResult[0]?.bonus ?? 0);
    const voucherCredits = Number(creditTransactionTotalsResult[0]?.voucher ?? 0);
    const bonusCredits = Number(creditTransactionTotalsResult[0]?.bonus ?? 0);
    const refundCredits = Number(creditTransactionTotalsResult[0]?.refund ?? 0);
    const adminAdjustmentCredits = Number(creditTransactionTotalsResult[0]?.adminAdjustment ?? 0);

    return {
      totalPurchases: totalPurchasesResult[0]?.count ?? 0,
      totalCreditsPurchased: purchasedCredits + purchaseBonusCredits + voucherCredits + refundCredits + adminAdjustmentCredits,
      purchasedCredits,
      bonusCredits,
      purchaseBonusCredits,
      voucherCredits,
      refundCredits,
      adminAdjustmentCredits,
      totalCreditsConsumed: Number(totalCreditsConsumedResult[0]?.total ?? 0),
      totalRevenue: centsToEur(totalRevenueResult[0]?.total ?? 0),
    };
  }

  async function getRevenueData(timeRange: TimeRange) {
    const { dateTrunc, daysBack } = getTimeRangeConfig(timeRange);
    const startDate = calculateStartDate(daysBack);
    const result = await deps.db
      .select({
        period: sql<string>`DATE_TRUNC(${sql.raw(`'${dateTrunc}'`)}, ${creditPurchases.createdAt})`,
        revenue: sql<number>`COALESCE(SUM(${creditPurchases.priceInclVat}), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(creditPurchases)
      .where(and(eq(creditPurchases.paymentStatus, "completed"), gte(creditPurchases.createdAt, startDate)))
      .groupBy(sql`DATE_TRUNC(${sql.raw(`'${dateTrunc}'`)}, ${creditPurchases.createdAt})`)
      .orderBy(sql`DATE_TRUNC(${sql.raw(`'${dateTrunc}'`)}, ${creditPurchases.createdAt})`);

    return result.map((item: any) => ({
      period: item.period,
      revenue: centsToEur(item.revenue),
      count: Number(item.count),
    }));
  }

  async function getAllTransactions(limit = 20, offset = 0, searchEmail?: string) {
    const normalizedLimit = normalizeLimit(limit, 100);
    const normalizedOffset = normalizeOffset(offset);
    const normalizedSearchEmail = normalizeSearchEmail(searchEmail);
    const whereCondition = normalizedSearchEmail ? like(user.email, `%${normalizedSearchEmail}%`) : undefined;

    const [transactions, totalCountResult] = await Promise.all([
      deps.db
        .select({
          id: creditTransactions.id,
          type: creditTransactions.type,
          amount: creditTransactions.amount,
          description: creditTransactions.description,
          balanceAfter: creditTransactions.balanceAfter,
          createdAt: creditTransactions.createdAt,
          userId: creditTransactions.userId,
          userName: user.name,
          userEmail: user.email,
        })
        .from(creditTransactions)
        .innerJoin(user, eq(creditTransactions.userId, user.id))
        .where(whereCondition)
        .orderBy(desc(creditTransactions.createdAt))
        .limit(normalizedLimit)
        .offset(normalizedOffset),
      deps.db
        .select({ count: sql<number>`COUNT(*)` })
        .from(creditTransactions)
        .innerJoin(user, eq(creditTransactions.userId, user.id))
        .where(whereCondition),
    ]);

    const total = totalCountResult[0]?.count ?? 0;
    return {
      transactions,
      total,
      hasMore: normalizedOffset + normalizedLimit < total,
    };
  }

  async function getAllPurchases(limit = 20, offset = 0, searchEmail?: string, paymentStatus?: "pending" | "completed" | "failed" | "refunded") {
    const normalizedLimit = normalizeLimit(limit, 100);
    const normalizedOffset = normalizeOffset(offset);
    const normalizedSearchEmail = normalizeSearchEmail(searchEmail);
    const conditions = [];
    if (normalizedSearchEmail) conditions.push(like(user.email, `%${normalizedSearchEmail}%`));
    if (paymentStatus) conditions.push(eq(creditPurchases.paymentStatus, paymentStatus));
    const whereCondition = conditions.length > 0 ? and(...conditions) : undefined;
    const [purchases, totalCountResult] = await Promise.all([
      deps.db
        .select({
          id: creditPurchases.id,
          packageKey: creditPurchases.packageKey,
          credits: creditPurchases.credits,
          bonusCredits: creditPurchases.bonusCredits,
          priceExclVat: creditPurchases.priceExclVat,
          priceInclVat: creditPurchases.priceInclVat,
          vatAmount: creditPurchases.vatAmount,
          currency: creditPurchases.currency,
          paymentSnapshot: creditPurchases.paymentSnapshot,
          paymentStatus: creditPurchases.paymentStatus,
          paymentId: creditPurchases.paymentId,
          createdAt: creditPurchases.createdAt,
          userId: creditPurchases.userId,
          userName: user.name,
          userEmail: user.email,
        })
        .from(creditPurchases)
        .innerJoin(user, eq(creditPurchases.userId, user.id))
        .where(whereCondition)
        .orderBy(desc(creditPurchases.createdAt))
        .limit(normalizedLimit)
        .offset(normalizedOffset),
      deps.db
        .select({ count: sql<number>`COUNT(*)` })
        .from(creditPurchases)
        .innerJoin(user, eq(creditPurchases.userId, user.id))
        .where(whereCondition),
    ]);

    const total = totalCountResult[0]?.count ?? 0;
    return {
      purchases,
      total,
      hasMore: normalizedOffset + normalizedLimit < total,
    };
  }

  async function getTransactionData(timeRange: TimeRange) {
    const { dateTrunc, daysBack } = getTimeRangeConfig(timeRange);
    const startDate = calculateStartDate(daysBack);
    const result = await deps.db
      .select({
        period: sql<string>`DATE_TRUNC(${sql.raw(`'${dateTrunc}'`)}, ${creditTransactions.createdAt})`,
        count: sql<number>`COUNT(*)`,
      })
      .from(creditTransactions)
      .where(gte(creditTransactions.createdAt, startDate))
      .groupBy(sql`DATE_TRUNC(${sql.raw(`'${dateTrunc}'`)}, ${creditTransactions.createdAt})`)
      .orderBy(sql`DATE_TRUNC(${sql.raw(`'${dateTrunc}'`)}, ${creditTransactions.createdAt})`);

    return result.map((item: any) => ({
      period: item.period,
      count: Number(item.count),
    }));
  }

  async function getCreditsConsumedData(timeRange: TimeRange) {
    const { dateTrunc, daysBack } = getTimeRangeConfig(timeRange);
    const startDate = calculateStartDate(daysBack);
    const result = await deps.db
      .select({
        period: sql<string>`DATE_TRUNC(${sql.raw(`'${dateTrunc}'`)}, ${creditTransactions.createdAt})`,
        consumed: sql<number>`COALESCE(ROUND(SUM(CASE WHEN ${creditTransactions.type} = 'usage' THEN ABS(CAST(${creditTransactions.amount} AS NUMERIC)) ELSE 0 END)), 0)`,
      })
      .from(creditTransactions)
      .where(gte(creditTransactions.createdAt, startDate))
      .groupBy(sql`DATE_TRUNC(${sql.raw(`'${dateTrunc}'`)}, ${creditTransactions.createdAt})`)
      .orderBy(sql`DATE_TRUNC(${sql.raw(`'${dateTrunc}'`)}, ${creditTransactions.createdAt})`);

    return result.map((item: any) => ({
      period: item.period,
      consumed: Number(item.consumed),
    }));
  }

  return {
    verifyAdminSecret,
    getDashboardStats,
    getVoucherStats,
    getUsers,
    searchUsers,
    getUserStats,
    getUserById,
    countActiveAdmins,
    getUserCreditBalance,
    getUserCreditHistory,
    getUserCreditPurchases,
    getBillingStats,
    getRevenueData,
    getAllTransactions,
    getAllPurchases,
    getTransactionData,
    getCreditsConsumedData,
  };
}
