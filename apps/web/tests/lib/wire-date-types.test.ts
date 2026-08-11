import { describe, expect, it } from "vitest";

import type { Session } from "../../src/components/layout/backend/settings/active-sessions-card";
import type { Passkey } from "../../src/components/layout/backend/settings/passkeys-card";
import type { getCreditHistory, getCreditPurchases } from "../../src/lib/services/credits";
import type { getActiveBannerNotifications, getNotifications } from "../../src/lib/services/notifications";
import type { createCreditsApi, UserCreditPurchase } from "@platform/frontend-shared/credits";
import type { createNotificationsApi } from "@platform/frontend-shared/notifications";
import type { CreditBalance, CreditPurchase, CreditTransaction, Notification, SuccessResult } from "@platform/contracts";

type Equal<Actual, Expected> = (<T>() => T extends Actual ? 1 : 2) extends <T>() => T extends Expected ? 1 : 2
  ? true
  : false;
type Expect<T extends true> = T;

type CreditHistoryItem = Awaited<ReturnType<typeof getCreditHistory>>[number];
type CreditPurchaseItem = Awaited<ReturnType<typeof getCreditPurchases>>[number];
type NotificationItem = Extract<Awaited<ReturnType<typeof getNotifications>>, { data: unknown }>["data"][number];
type ActiveBannerNotification = NonNullable<Awaited<ReturnType<typeof getActiveBannerNotifications>>["data"]>;
type SharedCreditsApi = ReturnType<typeof createCreditsApi>;
type SharedNotificationsApi = ReturnType<typeof createNotificationsApi>;

type SessionCreatedAtIsWireString = Expect<Equal<Session["createdAt"], string>>;
type SessionUpdatedAtIsWireString = Expect<Equal<Session["updatedAt"], string>>;
type SessionExpiresAtIsWireString = Expect<Equal<Session["expiresAt"], string>>;
type PasskeyCreatedAtIsWireString = Expect<Equal<Passkey["createdAt"], string | null | undefined>>;
type CreditHistoryCreatedAtIsWireString = Expect<Equal<CreditHistoryItem["createdAt"], string>>;
type CreditPurchaseCreatedAtIsWireString = Expect<Equal<CreditPurchaseItem["createdAt"], string>>;
type NotificationCreatedAtIsWireString = Expect<Equal<NotificationItem["createdAt"], string>>;
type NotificationUpdatedAtIsWireString = Expect<Equal<NotificationItem["updatedAt"], string>>;
type NotificationBannerExpiresAtIsWireString = Expect<Equal<NotificationItem["bannerExpiresAt"], string | null>>;
type ActiveBannerCreatedAtIsWireString = Expect<Equal<ActiveBannerNotification["createdAt"], string>>;
type CreditHistoryItemUsesContract = Expect<Equal<CreditHistoryItem, CreditTransaction>>;
type CreditPurchaseItemUsesSharedBoundary = Expect<Equal<CreditPurchaseItem, UserCreditPurchase>>;
type NotificationItemUsesContract = Expect<Equal<NotificationItem, Notification>>;
type SharedCreditBalanceBoundaryUsesContract = Expect<
  Equal<Awaited<ReturnType<SharedCreditsApi["getBalance"]>>, SuccessResult<CreditBalance>>
>;
type SharedCreditHistoryBoundaryUsesContract = Expect<
  Equal<Awaited<ReturnType<SharedCreditsApi["getHistory"]>>, SuccessResult<CreditTransaction[]>>
>;
type SharedCreditPurchasesBoundaryUsesSharedType = Expect<
  Equal<Awaited<ReturnType<SharedCreditsApi["getPurchases"]>>, SuccessResult<UserCreditPurchase[]>>
>;
type SharedNotificationsListBoundaryUsesContract = Expect<
  Equal<Awaited<ReturnType<SharedNotificationsApi["list"]>>, SuccessResult<Notification[]>>
>;

describe("web wire date types", () => {
  it("is covered by compile-time assertions", () => {
    expect(true).toBe(true);
  });
});
