/**
 * Notification Helper
 *
 * Easy-to-use functions for creating multi-lingual notifications throughout the app.
 *
 * Notifications store translation keys (e.g., "welcome.title") instead of hardcoded
 * text, allowing users to see notifications in their preferred language. The translation
 * happens at display time in the NotificationsDropdown component.
 *
 * @example
 * ```ts
 * import { notify } from "@/lib/notifications";
 *
 * // Welcome new user
 * await notify.welcome(user.id);
 *
 * // Security alert
 * await notify.newLogin(user.id, "Chrome on MacOS", "192.168.1.1");
 *
 * // Custom notification
 * await notify.custom(user.id, {
 *   title: "custom.title",
 *   message: "custom.message",
 *   type: "info",
 *   category: "system",
 *   data: { key: "value" }
 * });
 * ```
 */

import { createNotification } from "@/lib/services/notifications";
import { env } from "@/env";
import type {
  TranslateFunction,
  TranslatedNotification,
} from "@/schemas/notification";

const appName = env.NEXT_PUBLIC_APP_NAME;

// ============================================================================
// Translation Helper
// ============================================================================

/**
 * Translate a notification's title and message
 *
 * @param title - Translation key (e.g., "welcome.title") or plain text
 * @param message - Translation key (e.g., "welcome.message") or plain text
 * @param data - Interpolation data from notification.data field (may include translations object)
 * @param t - Translation function from useTranslations("notifications")
 * @returns Object with translated title and message
 */
export function translateNotification(
  title: string,
  message: string,
  data: Record<string, unknown> | null,
  t: TranslateFunction
): TranslatedNotification {
  // Check if data contains translations for current locale
  if (data?.translations && typeof data.translations === "object") {
    const translations = data.translations as Record<
      string,
      { title: string; message: string }
    >;
    
    // Try to get user's locale from data or determine from browser
    const userLocale = (data.userLocale as string | undefined) || 
                       (typeof navigator !== "undefined" ? navigator.language.split("-")[0] : "en");
    
    // Use locale-specific translation if available
    if (translations[userLocale]) {
      return {
        title: translations[userLocale].title,
        message: translations[userLocale].message,
      };
    }
    
    // Fallback to English if locale not found
    if (translations.en) {
      return {
        title: translations.en.title,
        message: translations.en.message,
      };
    }
  }

  // Check if title/message are translation keys
  // Translation keys are short (< 100 chars), have dots, and don't contain spaces before the first dot
  const isTranslationKey = (str: string) => {
    if (!str.includes(".") || str.startsWith("http")) return false;
    // If the string has a space before the first dot, it's likely a sentence, not a key
    const firstDotIndex = str.indexOf(".");
    const textBeforeDot = str.substring(0, firstDotIndex);
    return !textBeforeDot.includes(" ") && str.length < 100;
  };

  let translatedTitle = title;
  let translatedMessage = message;

  // Translate title if it's a translation key
  if (isTranslationKey(title)) {
    try {
      translatedTitle = t(title, data || undefined);
    } catch {
      // Fallback to original if translation fails
      translatedTitle = title;
    }
  }

  // Translate message if it's a translation key
  if (isTranslationKey(message)) {
    try {
      translatedMessage = t(message, data || undefined);
    } catch {
      // Fallback to original if translation fails
      translatedMessage = message;
    }
  }

  return { title: translatedTitle, message: translatedMessage };
}

// ============================================================================
// Security Notifications
// ============================================================================

export const notify = {
  /**
   * Welcome notification for new users
   */
  async welcome(userId: string) {
    return createNotification({
      userId,
      title: "welcome.title",
      message: "welcome.message",
      type: "success",
      category: "account",
      data: { appName },
    });
  },

  /**
   * New login from a different device or location
   */
  async newLogin(userId: string, device: string, ipAddress: string) {
    return createNotification({
      userId,
      title: "newLogin.title",
      message: "newLogin.message",
      type: "warning",
      category: "security",
      data: { device, ipAddress },
    });
  },

  /**
   * Password changed successfully
   */
  async passwordChanged(userId: string) {
    return createNotification({
      userId,
      title: "passwordChanged.title",
      message: "passwordChanged.message",
      type: "success",
      category: "security",
    });
  },

  /**
   * Password change required (security alert)
   */
  async passwordChangeRequired(userId: string, reason?: string) {
    return createNotification({
      userId,
      title: "passwordChangeRequired.title",
      message: "passwordChangeRequired.message",
      type: "warning",
      category: "security",
      data: { reason },
    });
  },

  /**
   * Two-factor authentication enabled
   */
  async twoFactorEnabled(userId: string) {
    return createNotification({
      userId,
      title: "twoFactorEnabled.title",
      message: "twoFactorEnabled.message",
      type: "success",
      category: "security",
    });
  },

  /**
   * Two-factor authentication disabled
   */
  async twoFactorDisabled(userId: string) {
    return createNotification({
      userId,
      title: "twoFactorDisabled.title",
      message: "twoFactorDisabled.message",
      type: "warning",
      category: "security",
    });
  },

  /**
   * Passkey added
   */
  async passkeyAdded(userId: string, passkeyName: string) {
    return createNotification({
      userId,
      title: "passkeyAdded.title",
      message: "passkeyAdded.message",
      type: "success",
      category: "security",
      data: { passkeyName },
    });
  },

  /**
   * Passkey removed
   */
  async passkeyRemoved(userId: string, passkeyName: string) {
    return createNotification({
      userId,
      title: "passkeyRemoved.title",
      message: "passkeyRemoved.message",
      type: "info",
      category: "security",
      data: { passkeyName },
    });
  },

  // ============================================================================
  // Account Notifications
  // ============================================================================

  /**
   * Email changed successfully
   */
  async emailChanged(userId: string, newEmail: string) {
    return createNotification({
      userId,
      title: "emailChanged.title",
      message: "emailChanged.message",
      type: "success",
      category: "account",
      data: { newEmail },
    });
  },

  /**
   * Email verified
   */
  async emailVerified(userId: string) {
    return createNotification({
      userId,
      title: "emailVerified.title",
      message: "emailVerified.message",
      type: "success",
      category: "account",
    });
  },

  /**
   * Profile updated
   */
  async profileUpdated(userId: string) {
    return createNotification({
      userId,
      title: "profileUpdated.title",
      message: "profileUpdated.message",
      type: "success",
      category: "account",
    });
  },

  // ============================================================================
  // Billing Notifications
  // ============================================================================

  /**
   * Payment successful
   */
  async paymentSuccess(userId: string, amount: string, invoiceId?: string) {
    return createNotification({
      userId,
      title: invoiceId ? "paymentSuccess.titleWithInvoice" : "paymentSuccess.title",
      message: invoiceId ? "paymentSuccess.messageWithInvoice" : "paymentSuccess.message",
      type: "success",
      category: "billing",
      data: { amount, invoiceId },
    });
  },

  /**
   * Payment failed
   */
  async paymentFailed(userId: string, amount: string) {
    return createNotification({
      userId,
      title: "paymentFailed.title",
      message: "paymentFailed.message",
      type: "error",
      category: "billing",
      data: { amount },
    });
  },

  /**
   * Invoice ready
   */
  async invoiceReady(userId: string, invoiceId: string, amount: string) {
    return createNotification({
      userId,
      title: "invoiceReady.title",
      message: "invoiceReady.message",
      type: "info",
      category: "billing",
      data: { invoiceId, amount },
    });
  },

  /**
   * Subscription canceled
   */
  async subscriptionCanceled(userId: string, endDate: string) {
    return createNotification({
      userId,
      title: "subscriptionCanceled.title",
      message: "subscriptionCanceled.message",
      type: "warning",
      category: "billing",
      data: { endDate },
    });
  },

  /**
   * Subscription renewed
   */
  async subscriptionRenewed(userId: string, planName: string, amount: string) {
    return createNotification({
      userId,
      title: "subscriptionRenewed.title",
      message: "subscriptionRenewed.message",
      type: "success",
      category: "billing",
      data: { planName, amount },
    });
  },

  // ============================================================================
  // Usage & Limits Notifications
  // ============================================================================

  /**
   * Usage limit warning (approaching limit)
   */
  async usageLimitWarning(userId: string, percentage: number, resourceType: string) {
    return createNotification({
      userId,
      title: "usageLimitWarning.title",
      message: "usageLimitWarning.message",
      type: "warning",
      category: "usage",
      data: { percentage, resourceType },
    });
  },

  /**
   * Usage limit reached
   */
  async usageLimitReached(userId: string, resourceType: string) {
    return createNotification({
      userId,
      title: "usageLimitReached.title",
      message: "usageLimitReached.message",
      type: "error",
      category: "usage",
      data: { resourceType },
    });
  },

  // ============================================================================
  // System Notifications
  // ============================================================================

  /**
   * Scheduled maintenance notification
   */
  async scheduledMaintenance(userId: string, startTime: string, duration: string) {
    return createNotification({
      userId,
      title: "scheduledMaintenance.title",
      message: "scheduledMaintenance.message",
      type: "info",
      category: "system",
      data: { startTime, duration },
    });
  },

  /**
   * New feature announcement
   */
  async newFeature(userId: string, featureName: string, description: string) {
    return createNotification({
      userId,
      title: "newFeature.title",
      message: "newFeature.message",
      type: "info",
      category: "system",
      data: { featureName, description },
    });
  },

  /**
   * System update notification
   */
  async systemUpdate(userId: string, updateDetails: string) {
    return createNotification({
      userId,
      title: "systemUpdate.title",
      message: "systemUpdate.message",
      type: "info",
      category: "system",
      data: { updateDetails },
    });
  },

  // ============================================================================
  // Custom Notification
  // ============================================================================

  /**
   * Create a custom notification
   */
  async custom(
    userId: string,
    {
      title,
      message,
      type = "info",
      category,
      data,
    }: {
      title: string;
      message: string;
      type?: "info" | "warning" | "success" | "error";
      category: "security" | "account" | "billing" | "usage" | "system";
      data?: Record<string, unknown>;
    }
  ) {
    return createNotification({
      userId,
      title,
      message,
      type,
      category,
      data,
    });
  },

  // Credit-related notifications
  async creditsAdded(userId: string, amount: number) {
    return createNotification({
      userId,
      title: "creditsAdded.title",
      message: "creditsAdded.message",
      type: "success",
      category: "billing",
      data: { amount },
    });
  },

  async lowCreditWarning(userId: string, balance: number) {
    return createNotification({
      userId,
      title: "lowCreditWarning.title",
      message: "lowCreditWarning.message",
      type: "warning",
      category: "billing",
      data: { balance },
    });
  },

  async creditPurchaseSuccess(
    userId: string, 
    credits: number, 
    amount: number,
    currency: string = "EUR"
  ) {
    return createNotification({
      userId,
      title: "creditPurchaseSuccess.title",
      message: "creditPurchaseSuccess.message",
      type: "success",
      category: "billing",
      data: { credits, amount, currency },
    });
  },
};
