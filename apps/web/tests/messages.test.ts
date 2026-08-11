import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { createTranslator } from "use-intl/core";

import { creditPackages, transactionProducts } from "@platform/contracts";

const LOCALES = ["en", "fr", "nl"] as const;
const TRANSACTION_PRODUCT_KEYS = ["starterContent", "premiumContent"] as const;

function readMessages(locale: (typeof LOCALES)[number]) {
  return JSON.parse(readFileSync(new URL(`../src/messages/${locale}.json`, import.meta.url), "utf8"));
}

function messageShape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(messageShape);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, messageShape(child)]),
    );
  }

  return typeof value;
}

function getMessage(messages: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => (
    value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined
  ), messages);
}

function stringMessages(value: unknown, path = ""): Array<[string, string]> {
  if (typeof value === "string") return [[path, value]];
  if (!value || typeof value !== "object") return [];

  return Object.entries(value).flatMap(([key, child]) => stringMessages(child, path ? `${path}.${key}` : key));
}

function messagePlaceholders(message: string): string[] {
  return [...message.matchAll(/\{\s*([A-Za-z_][\w.-]*)\s*(?:,[^}]*)?\}/g)]
    .map((match) => match[1])
    .filter((name, index, names) => names.indexOf(name) === index)
    .sort();
}

const REQUIRED_TRANSACTION_KEYS = [
  "eyebrow",
  "title",
  "description",
  "loading",
  "catalog.title",
  "catalog.description",
  "catalog.preTax",
  "catalog.addOrUpdate",
  "catalog.quantityLabel",
  "catalog.decreaseQuantity",
  "catalog.increaseQuantity",
  "basket.title",
  "basket.description",
  "basket.triggerLabel",
  "basket.triggerLabelWithCount",
  "basket.close",
  "basket.loading",
  "basket.clear",
  "basket.empty",
  "basket.remove",
  "basket.quantityLabel",
  "basket.decreaseQuantity",
  "basket.increaseQuantity",
  "basket.subtotal",
  "basket.taxNote",
  "basket.checkout",
  "basket.checkoutPending",
  "basket.retry",
  "errors.basketMutation",
  "errors.checkout",
  "errors.basketQuery",
  "errors.basketQueryInitial",
  "orders.title",
  "orders.description",
  "orders.empty",
  "orders.order",
  "orders.status",
  "orders.date",
  "orders.payment",
  "orders.quantity",
  "orders.subtotal",
  "orders.tax",
  "orders.total",
  "orders.statuses.pending_payment",
  "orders.statuses.paid",
  "orders.statuses.failed",
  "orders.statuses.cancelled",
  "orders.statuses.refunded",
  "orders.statuses.partially_refunded",
  "entitlements.title",
  "entitlements.description",
  "entitlements.empty",
  "entitlements.status",
  "entitlements.order",
  "entitlements.created",
  "entitlements.consumed",
  "entitlements.refunded",
  "entitlements.statuses.available",
  "entitlements.statuses.consumed",
  "entitlements.statuses.refunded",
] as const;

describe("messages", () => {
  it.each(LOCALES)("keeps %s message shape in parity with English", (locale) => {
    expect(messageShape(readMessages(locale))).toEqual(messageShape(readMessages("en")));
  });

  it.each(LOCALES)("contains no empty string messages in %s", (locale) => {
    for (const [path, message] of stringMessages(readMessages(locale))) {
      expect(message.trim(), path).not.toBe("");
    }
  });

  it.each(["fr", "nl"] as const)("keeps ICU placeholders in %s aligned with English", (locale) => {
    const english = new Map(stringMessages(readMessages("en")));

    for (const [path, message] of stringMessages(readMessages(locale))) {
      expect(messagePlaceholders(message), path).toEqual(messagePlaceholders(english.get(path) ?? ""));
    }
  });

  it.each(LOCALES)("defines credit pricing messages for every credit package in %s", (locale) => {
    const messages = readMessages(locale);

    for (const pkg of creditPackages) {
      expect(messages.creditPricing.packages[pkg.key]).toEqual({
        name: expect.any(String),
        description: expect.any(String),
        cta: expect.any(String),
      });
    }
  });

  it.each(LOCALES)("defines required transaction billing messages in %s", (locale) => {
    const messages = readMessages(locale);

    for (const key of REQUIRED_TRANSACTION_KEYS) {
      expect(getMessage(messages.billing.transaction, key), `billing.transaction.${key}`).toEqual(expect.any(String));
    }
  });

  it.each(LOCALES)("defines only neutral transaction product messages in %s", (locale) => {
    const messages = readMessages(locale);

    expect(transactionProducts.map((product) => product.key)).toEqual(TRANSACTION_PRODUCT_KEYS);
    expect(Object.keys(messages.billing.transaction.products)).toEqual(TRANSACTION_PRODUCT_KEYS);

    for (const productKey of TRANSACTION_PRODUCT_KEYS) {
      expect(messages.billing.transaction.products[productKey]).toEqual({
        name: expect.any(String),
        description: expect.any(String),
      });
    }
  });

  it.each([
    ["en", {
      title: "Cart",
      pageDescription: "Select products, review your cart, and continue to secure checkout.",
      description: "Review your cart and continue to checkout.",
      trigger: "Open cart",
      singular: "Open cart, 1 item",
      plural: "Open cart, 2 items",
      close: "Close cart",
      loading: "Loading your cart...",
      retry: "Try again",
    }],
    ["nl", {
      title: "Winkelwagen",
      pageDescription: "Selecteer producten, controleer je winkelwagen en ga door naar veilig afrekenen.",
      description: "Bekijk je winkelwagen en ga verder naar afrekenen.",
      trigger: "Winkelwagen openen",
      singular: "Winkelwagen openen, 1 artikel",
      plural: "Winkelwagen openen, 2 artikelen",
      close: "Winkelwagen sluiten",
      loading: "Je winkelwagen laden...",
      retry: "Opnieuw proberen",
    }],
    ["fr", {
      title: "Panier",
      pageDescription: "Sélectionnez des produits, vérifiez votre panier et poursuivez vers le paiement sécurisé.",
      description: "Vérifiez votre panier et passez au paiement.",
      trigger: "Ouvrir le panier",
      singular: "Ouvrir le panier, 1 article",
      plural: "Ouvrir le panier, 2 articles",
      close: "Fermer le panier",
      loading: "Chargement de votre panier...",
      retry: "Réessayer",
    }],
  ] as const)("uses natural, consistent cart copy in %s", (locale, expected) => {
    const t = createTranslator({ locale, messages: readMessages(locale), namespace: "billing.transaction" });

    expect(t("basket.title")).toBe(expected.title);
    expect(t("description")).toBe(expected.pageDescription);
    expect(t("basket.description")).toBe(expected.description);
    expect(t("basket.triggerLabel")).toBe(expected.trigger);
    expect(t("basket.triggerLabelWithCount", { count: 1 })).toBe(expected.singular);
    expect(t("basket.triggerLabelWithCount", { count: 2 })).toBe(expected.plural);
    expect(t("basket.close")).toBe(expected.close);
    expect(t("basket.loading")).toBe(expected.loading);
    expect(t("basket.retry")).toBe(expected.retry);
  });
});
