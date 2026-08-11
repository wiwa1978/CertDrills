import DodoPayments from "dodopayments";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DODO_TEST_PRODUCT_CATALOG,
  getDodoContractProductIds,
  main,
  provisionDodoTestProducts,
  type DodoProduct,
  type DodoProductsClient,
} from "../../scripts/provision-dodo-test-products";

vi.mock("dodopayments", () => ({ default: vi.fn() }));

const expectedProvisionedProductIds = {
  credits: {
    starter: "pdt_0NkioAPBxU4NKmFYXcjqo",
    advanced: "pdt_0NkioARiMUT4Q1jXQPqZF",
    pro: "pdt_0NkioATqYziYInEZ4cwFQ",
    max: "pdt_0NkioAW6Ke3fUtKNtnw16",
  },
  subscriptions: {
    bronze: "pdt_0NkioAYLMGksqZtDhLXGA",
    silver: "pdt_0NkioAab5uELkXMGi8T7F",
    gold: "pdt_0NkioAcnp3bOBNvazFR7y",
  },
} as const;

const expectedCatalog = {
  credits: {
    starter: {
      name: "Credits Starter",
      brandId: "bus_0NjwOIqJas23wqi7I8PKY",
      metadata: {
        managedBy: "certdrills",
        billingMode: "credits",
        productKey: "starter",
      },
      price: {
        type: "one_time_price",
        price: 500,
        currency: "EUR",
        discount: 0,
        purchasing_power_parity: false,
        tax_inclusive: false,
      },
      taxCategory: "digital_products",
    },
    advanced: {
      name: "Credits Advanced",
      brandId: "bus_0NjwOIqJas23wqi7I8PKY",
      metadata: {
        managedBy: "certdrills",
        billingMode: "credits",
        productKey: "advanced",
      },
      price: {
        type: "one_time_price",
        price: 1000,
        currency: "EUR",
        discount: 0,
        purchasing_power_parity: false,
        tax_inclusive: false,
      },
      taxCategory: "digital_products",
    },
    pro: {
      name: "Credits Pro",
      brandId: "bus_0NjwOIqJas23wqi7I8PKY",
      metadata: {
        managedBy: "certdrills",
        billingMode: "credits",
        productKey: "pro",
      },
      price: {
        type: "one_time_price",
        price: 2500,
        currency: "EUR",
        discount: 0,
        purchasing_power_parity: false,
        tax_inclusive: false,
      },
      taxCategory: "digital_products",
    },
    max: {
      name: "Credits Max",
      brandId: "bus_0NjwOIqJas23wqi7I8PKY",
      metadata: {
        managedBy: "certdrills",
        billingMode: "credits",
        productKey: "max",
      },
      price: {
        type: "one_time_price",
        price: 5000,
        currency: "EUR",
        discount: 0,
        purchasing_power_parity: false,
        tax_inclusive: false,
      },
      taxCategory: "digital_products",
    },
  },
  subscriptions: {
    bronze: {
      name: "Subscription Bronze",
      brandId: "brnd_0NkektvcLn6O8e4Xusuvz",
      metadata: {
        managedBy: "certdrills",
        billingMode: "subscriptions",
        productKey: "bronze",
      },
      price: {
        type: "recurring_price",
        price: 1000,
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
    },
    silver: {
      name: "Subscription Silver",
      brandId: "brnd_0NkektvcLn6O8e4Xusuvz",
      metadata: {
        managedBy: "certdrills",
        billingMode: "subscriptions",
        productKey: "silver",
      },
      price: {
        type: "recurring_price",
        price: 2500,
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
    },
    gold: {
      name: "Subscription Gold",
      brandId: "brnd_0NkektvcLn6O8e4Xusuvz",
      metadata: {
        managedBy: "certdrills",
        billingMode: "subscriptions",
        productKey: "gold",
      },
      price: {
        type: "recurring_price",
        price: 5000,
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
    },
  },
} as const;

type CatalogEntry = (typeof expectedCatalog)[keyof typeof expectedCatalog][string];

function remoteProduct(entry: CatalogEntry, productId: string): DodoProduct {
  return {
    product_id: productId,
    brand_id: entry.brandId,
    name: entry.name,
    metadata: entry.metadata,
    price: entry.price,
    tax_category: entry.taxCategory,
  };
}

function clientWithProducts(products: DodoProduct[] = []) {
  const byId = new Map(products.map((product) => [product.product_id, product]));
  let nextId = products.length;
  const list = vi.fn(async ({ brand_id }: { brand_id: string }) => ({
    items: products
      .filter((product) => product.brand_id === brand_id)
      .map(({ brand_id: _brandId, price, ...product }) => ({
        ...product,
        currency: price.currency,
        price: price.price,
        price_detail: price,
        tax_inclusive: price.tax_inclusive,
      })),
    hasNextPage: () => false,
    getNextPage: vi.fn(),
  }));
  const retrieve = vi.fn(async (productId: string) => {
    const product = byId.get(productId);
    if (!product) throw new Error(`Unknown product ${productId}`);
    return product;
  });
  const create = vi.fn(async (
    input: Parameters<DodoProductsClient["products"]["create"]>[0],
    _options?: { headers?: Record<string, string>; idempotencyKey?: string },
  ) => {
    const product = remoteProduct(
      {
        name: input.name,
        brandId: input.brand_id,
        metadata: input.metadata,
        price: input.price,
        taxCategory: input.tax_category,
      } as CatalogEntry,
      `prod_created_${++nextId}`,
    );
    byId.set(product.product_id, product);
    products.push(product);
    return product;
  });

  return { products: { list, retrieve, create } } satisfies DodoProductsClient;
}

describe("Dodo test product catalog", () => {
  it("defines the exact credit and subscription products", () => {
    expect(DODO_TEST_PRODUCT_CATALOG).toEqual(expectedCatalog);
  });
});

describe("Dodo test product script", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not instantiate a client or access the network on import", () => {
    expect(DodoPayments).not.toHaveBeenCalled();
  });

  it("rejects arguments other than --verify", async () => {
    await expect(main(["--live"], "secret-key")).rejects.toThrow(
      "Usage: provision-dodo-test-products.ts [--verify]",
    );
    expect(DodoPayments).not.toHaveBeenCalled();
  });

  it("fails clearly when the API key is missing", async () => {
    await expect(main([], "")).rejects.toThrow(
      "DODO_PAYMENTS_API_KEY is required to provision Dodo test products",
    );
    expect(DodoPayments).not.toHaveBeenCalled();
  });

  it("fails verify when a contract Dodo product ID is stale", async () => {
    const products = Object.entries(expectedCatalog).flatMap(([mode, entries]) =>
      Object.entries(entries).map(([key, entry]) => remoteProduct(
        entry,
        expectedProvisionedProductIds[mode as keyof typeof expectedProvisionedProductIds][
          key as keyof (typeof expectedProvisionedProductIds)[keyof typeof expectedProvisionedProductIds]
        ],
      )),
    );
    const client = clientWithProducts(products);
    vi.mocked(DodoPayments).mockReturnValue(client as unknown as DodoPayments);
    const staleContractIds = {
      ...expectedProvisionedProductIds,
      credits: { ...expectedProvisionedProductIds.credits, starter: "pdt_stale" },
    };
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(main(["--verify"], "secret-key", staleContractIds)).rejects.toThrow(
      `Stale Dodo contract product ID for credits/starter: expected ${expectedProvisionedProductIds.credits.starter}, received pdt_stale`,
    );
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("passes verify when contract IDs exactly match the remote catalog", async () => {
    const products = Object.entries(expectedCatalog).flatMap(([mode, entries]) =>
      Object.entries(entries).map(([key, entry]) => remoteProduct(
        entry,
        expectedProvisionedProductIds[mode as keyof typeof expectedProvisionedProductIds][
          key as keyof (typeof expectedProvisionedProductIds)[keyof typeof expectedProvisionedProductIds]
        ],
      )),
    );
    const client = clientWithProducts(products);
    vi.mocked(DodoPayments).mockReturnValue(client as unknown as DodoPayments);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(main(["--verify"], "secret-key", expectedProvisionedProductIds)).resolves.toEqual(
      expectedProvisionedProductIds,
    );

    expect(DodoPayments).toHaveBeenCalledWith({ bearerToken: "secret-key", environment: "test_mode" });
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]?.[0]).toContain(expectedProvisionedProductIds.credits.starter);
    expect(log.mock.calls[0]?.[0]).not.toContain("secret-key");
    log.mockRestore();
  });

  it("does not require contract IDs to match while provisioning", async () => {
    const client = clientWithProducts();
    vi.mocked(DodoPayments).mockReturnValue(client as unknown as DodoPayments);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const staleContractIds = {
      ...expectedProvisionedProductIds,
      credits: { ...expectedProvisionedProductIds.credits, starter: "pdt_stale" },
    };

    await expect(main([], "secret-key", staleContractIds)).resolves.toMatchObject({
      credits: { starter: "prod_created_1" },
    });

    log.mockRestore();
  });
});

describe("provisionDodoTestProducts", () => {
  it("derives the exact provisioned ID map from current contracts", () => {
    expect(getDodoContractProductIds()).toEqual(expectedProvisionedProductIds);
  });

  it("creates missing products and returns only their safe ID map", async () => {
    const client = clientWithProducts();

    const result = await provisionDodoTestProducts(client, { verify: false });

    expect(result).toEqual({
      credits: {
        starter: "prod_created_1",
        advanced: "prod_created_2",
        pro: "prod_created_3",
        max: "prod_created_4",
      },
      subscriptions: {
        bronze: "prod_created_5",
        silver: "prod_created_6",
        gold: "prod_created_7",
      },
    });
    expect(client.products.create).toHaveBeenCalledTimes(7);
    expect(client.products.create).toHaveBeenNthCalledWith(1, {
      name: "Credits Starter",
      brand_id: "bus_0NjwOIqJas23wqi7I8PKY",
      metadata: expectedCatalog.credits.starter.metadata,
      price: expectedCatalog.credits.starter.price,
      tax_category: "digital_products",
    }, {
      headers: {
        "Idempotency-Key": "certdrills:test-product:v1:credits:starter",
      },
    });
    expect(client.products.create).toHaveBeenNthCalledWith(5, {
      name: "Subscription Bronze",
      brand_id: "brnd_0NkektvcLn6O8e4Xusuvz",
      metadata: expectedCatalog.subscriptions.bronze.metadata,
      price: expectedCatalog.subscriptions.bronze.price,
      tax_category: "digital_products",
    }, {
      headers: {
        "Idempotency-Key": "certdrills:test-product:v1:subscriptions:bronze",
      },
    });
    expect(client.products.create.mock.calls.map(([, options]) => options?.headers?.["Idempotency-Key"])).toEqual([
      "certdrills:test-product:v1:credits:starter",
      "certdrills:test-product:v1:credits:advanced",
      "certdrills:test-product:v1:credits:pro",
      "certdrills:test-product:v1:credits:max",
      "certdrills:test-product:v1:subscriptions:bronze",
      "certdrills:test-product:v1:subscriptions:silver",
      "certdrills:test-product:v1:subscriptions:gold",
    ]);
    expect(client.products.create.mock.calls.every(([, options]) => options?.idempotencyKey === undefined)).toBe(true);
  });

  it("creates once and reuses the same products on a second provisioning run", async () => {
    const client = clientWithProducts();

    const first = await provisionDodoTestProducts(client, { verify: false });

    expect(client.products.create).toHaveBeenCalledTimes(7);
    client.products.create.mockClear();

    const second = await provisionDodoTestProducts(client, { verify: false });

    expect(second).toEqual(first);
    expect(client.products.create).not.toHaveBeenCalled();
    expect(client.products.retrieve).toHaveBeenCalledTimes(7);
  });

  it("reuses valid products matched by all three metadata fields", async () => {
    const products = Object.entries(expectedCatalog).flatMap(([mode, entries]) =>
      Object.entries(entries).map(([key, entry]) => remoteProduct(entry, `prod_${mode}_${key}`)),
    );
    const client = clientWithProducts(products);

    const result = await provisionDodoTestProducts(client, { verify: false });

    expect(result.credits.starter).toBe("prod_credits_starter");
    expect(result.subscriptions.gold).toBe("prod_subscriptions_gold");
    expect(client.products.create).not.toHaveBeenCalled();
    expect(client.products.retrieve).toHaveBeenCalledTimes(7);
    expect(client.products.list).toHaveBeenCalledTimes(2);
    expect(client.products.list).toHaveBeenCalledWith({ brand_id: "bus_0NjwOIqJas23wqi7I8PKY" });
    expect(client.products.list).toHaveBeenCalledWith({ brand_id: "brnd_0NkektvcLn6O8e4Xusuvz" });
  });

  it("reads all SDK pages", async () => {
    const starter = remoteProduct(expectedCatalog.credits.starter, "prod_starter");
    const firstPage = {
      items: [],
      hasNextPage: () => true,
      getNextPage: vi.fn(async () => ({
        items: [{ ...starter, price_detail: starter.price }],
        hasNextPage: () => false,
        getNextPage: vi.fn(),
      })),
    };
    const client = clientWithProducts();
    client.products.list.mockImplementation(async ({ brand_id }) =>
      brand_id === expectedCatalog.credits.starter.brandId
        ? firstPage
        : { items: [], hasNextPage: () => false, getNextPage: vi.fn() },
    );
    client.products.retrieve.mockResolvedValue(starter);

    await provisionDodoTestProducts(client, { verify: false });

    expect(firstPage.getNextPage).toHaveBeenCalledOnce();
    expect(client.products.create).toHaveBeenCalledTimes(6);
  });

  it("fails in verify mode when a managed product is missing", async () => {
    const client = clientWithProducts();

    await expect(provisionDodoTestProducts(client, { verify: true })).rejects.toThrow(
      "Missing Dodo test product credits/starter",
    );
    expect(client.products.create).not.toHaveBeenCalled();
  });

  it.each([
    ["product ID", { product_id: "" }],
    ["brand", { brand_id: "brnd_wrong" }],
    ["name", { name: "Wrong" }],
    ["price type", { price: { ...expectedCatalog.credits.starter.price, type: "recurring_price" } }],
    ["amount", { price: { ...expectedCatalog.credits.starter.price, price: 501 } }],
    ["currency", { price: { ...expectedCatalog.credits.starter.price, currency: "USD" } }],
    ["tax exclusivity", { price: { ...expectedCatalog.credits.starter.price, tax_inclusive: true } }],
    ["tax category", { tax_category: "saas" }],
  ])("fails rather than mutating an existing product with mismatched %s", async (_field, patch) => {
    const product = { ...remoteProduct(expectedCatalog.credits.starter, "prod_starter"), ...patch } as DodoProduct;
    const client = clientWithProducts([product]);
    if (_field === "brand") {
      client.products.list.mockImplementation(async ({ brand_id }) => ({
        items: brand_id === expectedCatalog.credits.starter.brandId
          ? [{ ...product, price_detail: product.price }]
          : [],
        hasNextPage: () => false,
        getNextPage: vi.fn(),
      }));
    }

    await expect(provisionDodoTestProducts(client, { verify: false })).rejects.toThrow(
      "Dodo test product credits/starter does not match the catalog",
    );
    expect(client.products.create).not.toHaveBeenCalled();
  });

  it("validates recurring frequency and subscription period", async () => {
    const product = remoteProduct(expectedCatalog.subscriptions.bronze, "prod_bronze");
    product.price = { ...product.price, payment_frequency_count: 2 };
    const client = clientWithProducts([product]);

    await expect(provisionDodoTestProducts(client, { verify: false })).rejects.toThrow(
      "Dodo test product subscriptions/bronze does not match the catalog",
    );
    expect(client.products.create).not.toHaveBeenCalled();
  });

  it.each([
    ["pay what you want", { pay_what_you_want: true }],
    ["suggested price", { suggested_price: 750 }],
  ])("rejects one-time products with non-fixed %s semantics", async (_field, pricePatch) => {
    const products = Object.entries(expectedCatalog).flatMap(([mode, entries]) =>
      Object.entries(entries).map(([key, entry]) => remoteProduct(entry, `prod_${mode}_${key}`)),
    );
    products[0]!.price = { ...products[0]!.price, ...pricePatch };
    const client = clientWithProducts(products);

    await expect(provisionDodoTestProducts(client, { verify: true })).rejects.toThrow(
      "Dodo test product credits/starter does not match the catalog",
    );
    expect(client.products.create).not.toHaveBeenCalled();
  });

  it.each([
    [undefined, undefined],
    [null, null],
    [false, null],
  ])(
    "accepts semantically fixed one-time fields pay_what_you_want=%s suggested_price=%s",
    async (payWhatYouWant, suggestedPrice) => {
      const products = Object.entries(expectedCatalog).flatMap(([mode, entries]) =>
        Object.entries(entries).map(([key, entry]) => remoteProduct(entry, `prod_${mode}_${key}`)),
      );
      products[0]!.price = {
        ...products[0]!.price,
        pay_what_you_want: payWhatYouWant,
        suggested_price: suggestedPrice,
      } as DodoProduct["price"];
      const client = clientWithProducts(products);

      await expect(provisionDodoTestProducts(client, { verify: true })).resolves.toMatchObject({
        credits: { starter: "prod_credits_starter" },
      });
      expect(client.products.create).not.toHaveBeenCalled();
    },
  );

  it("rejects duplicate products matching the same stable metadata", async () => {
    const first = remoteProduct(expectedCatalog.credits.starter, "prod_starter_first");
    const second = remoteProduct(expectedCatalog.credits.starter, "prod_starter_second");
    const client = clientWithProducts([first, second]);

    await expect(provisionDodoTestProducts(client, { verify: false })).rejects.toThrow(
      "Duplicate managed Dodo test products for credits/starter: prod_starter_first, prod_starter_second",
    );
    expect(client.products.retrieve).not.toHaveBeenCalled();
    expect(client.products.create).not.toHaveBeenCalled();
  });

  it("rejects a catalog whose stable metadata lets one product satisfy multiple entries", async () => {
    const advancedMetadata = DODO_TEST_PRODUCT_CATALOG.credits.advanced.metadata;
    const product = remoteProduct(expectedCatalog.credits.starter, "prod_ambiguous");
    const client = clientWithProducts([product]);
    Object.assign(DODO_TEST_PRODUCT_CATALOG.credits.advanced, {
      metadata: DODO_TEST_PRODUCT_CATALOG.credits.starter.metadata,
    });

    try {
      await expect(provisionDodoTestProducts(client, { verify: false })).rejects.toThrow(
        "Managed Dodo product prod_ambiguous ambiguously matches credits/starter, credits/advanced",
      );
      expect(client.products.retrieve).not.toHaveBeenCalled();
      expect(client.products.create).not.toHaveBeenCalled();
    } finally {
      Object.assign(DODO_TEST_PRODUCT_CATALOG.credits.advanced, { metadata: advancedMetadata });
    }
  });

  it("fails when retrieve returns a different product ID than the list match", async () => {
    const product = remoteProduct(expectedCatalog.credits.starter, "prod_listed");
    const client = clientWithProducts([product]);
    client.products.retrieve.mockResolvedValue({ ...product, product_id: "prod_other" });

    await expect(provisionDodoTestProducts(client, { verify: false })).rejects.toThrow(
      "Dodo test product credits/starter does not match the catalog",
    );
    expect(client.products.create).not.toHaveBeenCalled();
  });

  it("does not match products unless every stable metadata field matches", async () => {
    const product = remoteProduct(expectedCatalog.credits.starter, "prod_unmanaged");
    product.metadata = { ...product.metadata, managedBy: "someone-else" };
    const client = clientWithProducts([product]);

    await provisionDodoTestProducts(client, { verify: false });

    expect(client.products.retrieve).not.toHaveBeenCalled();
    expect(client.products.create).toHaveBeenCalledTimes(7);
  });
});
