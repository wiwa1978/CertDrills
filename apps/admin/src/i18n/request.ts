import { getRequestConfig } from "next-intl/server";
import { mergeProductMessages } from "@platform/module-contracts";

import { productAdminContributions } from "../composition/product";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  // This typically corresponds to the `[locale]` segment
  let locale = await requestLocale;

  // Ensure that a valid locale is used
  if (!locale || !routing.locales.includes(locale as typeof routing.locales[number])) {
    locale = routing.defaultLocale;
  }
  const baseMessages = (await import(`../messages/${locale}.json`)).default;

  return {
    locale,
    messages: mergeProductMessages(baseMessages, productAdminContributions, locale as "en" | "nl" | "fr"),
  };
});
