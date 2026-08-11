export type TransactionFulfillmentType = "entitlement";

export type TransactionProductDefinition = {
  price: number;
  currency: string;
  providerProductIds: Record<string, string>;
  active: boolean;
  fulfillmentType: TransactionFulfillmentType;
  name: string;
  description: string;
};

export type TransactionProductConfig = Record<string, TransactionProductDefinition>;

export function validateTransactionProductProviderIds(
  products: ReadonlyArray<TransactionProductDefinition & { key: string }>,
  provider: string,
) {
  const seen = new Set<string>();
  for (const product of products) {
    if (!product.active) continue;
    const productId = product.providerProductIds[provider]?.trim();
    if (!productId) {
      throw new Error(`Missing active transaction product id for ${provider}: ${product.key}`);
    }
    if (seen.has(productId)) {
      throw new Error(`Duplicate active transaction product id for ${provider}: ${productId}`);
    }
    seen.add(productId);
  }
}

export const TRANSACTION_PRODUCTS = {
  starterContent: {
    price: 500,
    currency: "EUR",
    providerProductIds: { dodo: "pdt_0NkelzQ34bErNUPhvbEMi" },
    active: true,
    fulfillmentType: "entitlement",
    name: "Starter content access",
    description: "One durable entitlement for the starter content product.",
  },
  premiumContent: {
    price: 1000,
    currency: "EUR",
    providerProductIds: { dodo: "pdt_0NkemCz5vlamLJsyCb4I2" },
    active: true,
    fulfillmentType: "entitlement",
    name: "Premium content access",
    description: "One durable entitlement for the premium content product.",
  },
} as const satisfies TransactionProductConfig;

export type TransactionProductKey = keyof typeof TRANSACTION_PRODUCTS;

export const TRANSACTION_PRODUCT_DEFINITIONS: Record<TransactionProductKey, TransactionProductDefinition> = TRANSACTION_PRODUCTS;

export const transactionProducts = (Object.keys(TRANSACTION_PRODUCT_DEFINITIONS) as TransactionProductKey[]).map((key) => {
  const product = TRANSACTION_PRODUCT_DEFINITIONS[key];

  return {
    key,
    price: product.price,
    currency: product.currency,
    providerProductIds: product.providerProductIds,
    active: product.active,
    fulfillmentType: product.fulfillmentType,
    name: product.name,
    description: product.description,
  };
});

export type TransactionProduct = typeof transactionProducts[number];
