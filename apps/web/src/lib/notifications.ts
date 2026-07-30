/**
 * Notification translation helpers for the client UI.
 */

import type {
  TranslateFunction,
  TranslatedNotification,
} from "@/schemas/notification";

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
