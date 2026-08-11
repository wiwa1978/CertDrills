import DodoPayments from "dodopayments";
import type { Price, Product, ProductCreateParams, ProductListResponse } from "dodopayments/resources/products/products";
import { creditPackages, subscriptionPlans } from "../src/config/billing";

const MANAGED_BY = "certdrills";
const CREDIT_BRAND_ID = "bus_0NjwOIqJas23wqi7I8PKY";
const SUBSCRIPTION_BRAND_ID = "brnd_0NkektvcLn6O8e4Xusuvz";

type BillingMode = "credits" | "subscriptions";
type CatalogEntry = {
  name: string;
  brandId: string;
  metadata: {
    managedBy: typeof MANAGED_BY;
    billingMode: BillingMode;
    productKey: string;
  };
  price: Price;
  taxCategory: "digital_products";
};

function oneTimeProduct(key: string, name: string, price: number): CatalogEntry {
  return {
    name,
    brandId: CREDIT_BRAND_ID,
    metadata: { managedBy: MANAGED_BY, billingMode: "credits", productKey: key },
    price: {
      type: "one_time_price",
      price,
      currency: "EUR",
      discount: 0,
      purchasing_power_parity: false,
      tax_inclusive: false,
    },
    taxCategory: "digital_products",
  };
}

function subscriptionProduct(key: string, name: string, price: number): CatalogEntry {
  return {
    name,
    brandId: SUBSCRIPTION_BRAND_ID,
    metadata: { managedBy: MANAGED_BY, billingMode: "subscriptions", productKey: key },
    price: {
      type: "recurring_price",
      price,
      currency: "EUR",
      discount: 0,
      purchasing_power_parity: false,
      tax_inclusive: false,
      payment_frequency_count: 1,
      payment_frequency_interval: "Month",
      subscription_period_count: 1,
      subscription_period_interval: "Month",
      trial_period_days: 0,
    },
    taxCategory: "digital_products",
  };
}

export const DODO_TEST_PRODUCT_CATALOG = {
  credits: {
    starter: oneTimeProduct("starter", "Credits Starter", 500),
    advanced: oneTimeProduct("advanced", "Credits Advanced", 1000),
    pro: oneTimeProduct("pro", "Credits Pro", 2500),
    max: oneTimeProduct("max", "Credits Max", 5000),
  },
  subscriptions: {
    bronze: subscriptionProduct("bronze", "Subscription Bronze", 1000),
    silver: subscriptionProduct("silver", "Subscription Silver", 2500),
    gold: subscriptionProduct("gold", "Subscription Gold", 5000),
  },
} as const satisfies Record<BillingMode, Record<string, CatalogEntry>>;

type ProductPage = {
  items: ProductListResponse[];
  hasNextPage(): boolean;
  getNextPage(): Promise<ProductPage>;
};

export type DodoProduct = Pick<Product, "brand_id" | "metadata" | "name" | "price" | "product_id" | "tax_category">;

export type DodoProductsClient = {
  products: {
    list(query: { brand_id: string }): Promise<ProductPage>;
    retrieve(productId: string): Promise<DodoProduct>;
    create(input: ProductCreateParams, options?: { headers?: Record<string, string> }): Promise<DodoProduct>;
  };
};

export type ProductIdMap = {
  credits: Record<keyof typeof DODO_TEST_PRODUCT_CATALOG.credits, string>;
  subscriptions: Record<keyof typeof DODO_TEST_PRODUCT_CATALOG.subscriptions, string>;
};

export function getDodoContractProductIds(): ProductIdMap {
  return {
    credits: Object.fromEntries(
      creditPackages.map((pkg) => [pkg.key, pkg.providerProductIds.dodo]),
    ) as ProductIdMap["credits"],
    subscriptions: Object.fromEntries(
      subscriptionPlans.map((plan) => [plan.key.toLowerCase(), plan.providerProductIds.dodo]),
    ) as ProductIdMap["subscriptions"],
  };
}

export function validateDodoContractProductIds(remoteIds: ProductIdMap, contractIds: ProductIdMap) {
  for (const mode of ["credits", "subscriptions"] as const) {
    for (const [key, remoteId] of Object.entries(remoteIds[mode])) {
      const contractId = contractIds[mode][key as keyof ProductIdMap[typeof mode]];
      if (contractId !== remoteId) {
        throw new Error(
          `Stale Dodo contract product ID for ${mode}/${key}: expected ${remoteId}, received ${contractId}`,
        );
      }
    }
  }
}

async function listProductsByBrand(client: DodoProductsClient, brandId: string) {
  const products: ProductListResponse[] = [];
  let page = await client.products.list({ brand_id: brandId });

  while (true) {
    products.push(...page.items);
    if (!page.hasNextPage()) return products;
    page = await page.getNextPage();
  }
}

function matchesMetadata(product: Pick<ProductListResponse, "metadata">, entry: CatalogEntry) {
  return product.metadata.managedBy === entry.metadata.managedBy
    && product.metadata.billingMode === entry.metadata.billingMode
    && product.metadata.productKey === entry.metadata.productKey;
}

function pricesMatch(actual: Price, expected: Price) {
  if (
    actual.type !== expected.type
    || actual.currency !== expected.currency
    || actual.discount !== expected.discount
    || actual.purchasing_power_parity !== expected.purchasing_power_parity
    || actual.tax_inclusive !== expected.tax_inclusive
  ) return false;

  if (actual.type === "one_time_price" && expected.type === "one_time_price") {
    return actual.price === expected.price
      && (actual.pay_what_you_want ?? false) === false
      && actual.suggested_price == null;
  }
  if (actual.type === "recurring_price" && expected.type === "recurring_price") {
    return actual.price === expected.price
      && actual.payment_frequency_count === expected.payment_frequency_count
      && actual.payment_frequency_interval === expected.payment_frequency_interval
      && actual.subscription_period_count === expected.subscription_period_count
      && actual.subscription_period_interval === expected.subscription_period_interval
      && actual.trial_period_days === expected.trial_period_days;
  }
  return false;
}

function validateProduct(product: DodoProduct, entry: CatalogEntry, label: string, expectedId?: string) {
  if (
    !product.product_id
    || (expectedId !== undefined && product.product_id !== expectedId)
    || product.brand_id !== entry.brandId
    || product.name !== entry.name
    || product.tax_category !== entry.taxCategory
    || !matchesMetadata(product, entry)
    || !pricesMatch(product.price, entry.price)
  ) {
    throw new Error(`Dodo test product ${label} does not match the catalog`);
  }
}

export async function provisionDodoTestProducts(
  client: DodoProductsClient,
  options: { verify: boolean },
): Promise<ProductIdMap> {
  const listedByBrand = new Map<string, ProductListResponse[]>();
  for (const brandId of [CREDIT_BRAND_ID, SUBSCRIPTION_BRAND_ID]) {
    listedByBrand.set(brandId, await listProductsByBrand(client, brandId));
  }

  const catalogEntries = (["credits", "subscriptions"] as const).flatMap((mode) =>
    Object.entries(DODO_TEST_PRODUCT_CATALOG[mode]).map(([key, entry]) => ({
      entry,
      key,
      label: `${mode}/${key}`,
      mode,
    })),
  );
  const listedMatches = new Map<string, ProductListResponse[]>();
  for (const product of Array.from(listedByBrand.values()).flat()) {
    const matches = catalogEntries.filter(({ entry }) => matchesMetadata(product, entry));
    if (matches.length > 1) {
      throw new Error(
        `Managed Dodo product ${product.product_id} ambiguously matches ${matches.map(({ label }) => label).join(", ")}`,
      );
    }
    const match = matches[0];
    if (match) listedMatches.set(match.label, [...(listedMatches.get(match.label) ?? []), product]);
  }

  const matchedProductIds = new Set<string>();
  for (const { label } of catalogEntries) {
    const matches = listedMatches.get(label) ?? [];
    if (matches.length > 1) {
      throw new Error(
        `Duplicate managed Dodo test products for ${label}: ${matches.map(({ product_id }) => product_id).join(", ")}`,
      );
    }
    if (matches[0]) matchedProductIds.add(matches[0].product_id);
  }
  if (matchedProductIds.size !== listedMatches.size) {
    throw new Error("Managed Dodo test product matches are not one-to-one with the catalog");
  }

  const existing = new Map<string, DodoProduct>();
  for (const { entry, label } of catalogEntries) {
    const listed = listedMatches.get(label)?.[0];
    if (listed) {
      const product = await client.products.retrieve(listed.product_id);
      validateProduct(product, entry, label, listed.product_id);
      existing.set(label, product);
    } else if (options.verify) {
      throw new Error(`Missing Dodo test product ${label}`);
    }
  }

  const result = { credits: {}, subscriptions: {} } as ProductIdMap;
  for (const mode of ["credits", "subscriptions"] as const) {
    for (const [key, entry] of Object.entries(DODO_TEST_PRODUCT_CATALOG[mode])) {
      const label = `${mode}/${key}`;
      const product = existing.get(label) ?? await client.products.create({
        name: entry.name,
        brand_id: entry.brandId,
        metadata: entry.metadata,
        price: entry.price,
        tax_category: entry.taxCategory,
      }, {
        headers: { "Idempotency-Key": `${MANAGED_BY}:test-product:v1:${mode}:${key}` },
      });
      if (!existing.has(label)) validateProduct(product, entry, label);
      (result[mode] as Record<string, string>)[key] = product.product_id;
    }
  }

  return result;
}

export async function main(
  args: string[],
  apiKey = process.env.DODO_PAYMENTS_API_KEY,
  contractIds?: ProductIdMap,
) {
  if (args.some((arg) => arg !== "--verify")) {
    throw new Error("Usage: provision-dodo-test-products.ts [--verify]");
  }
  if (!apiKey) {
    throw new Error("DODO_PAYMENTS_API_KEY is required to provision Dodo test products");
  }

  const client = new DodoPayments({ bearerToken: apiKey, environment: "test_mode" });
  const verify = args.includes("--verify");
  const result = await provisionDodoTestProducts(client, { verify });
  if (verify) validateDodoContractProductIds(result, contractIds ?? getDodoContractProductIds());
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (import.meta.main) await main(process.argv.slice(2));
