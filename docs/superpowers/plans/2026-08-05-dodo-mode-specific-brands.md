# Dodo Mode-Specific Brands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give credits, subscriptions, and transactions their own Dodo brand configuration, use Checkout Sessions for every mode, and provision valid tax-exclusive Dodo test products for all configured billing products.

**Architecture:** A pure configuration module maps each billing mode to its environment-variable name and resolves the corresponding Dodo brand. The Dodo provider creates all checkouts through one session-building path, selecting the brand by mode while preserving provider-neutral inputs and webhook metadata. An idempotent provisioning script creates or validates the missing test products using stable metadata keys before their returned IDs replace placeholders in the contracts.

**Tech Stack:** TypeScript, Bun, Hono, Dodo Payments SDK/API, Zod, Vitest, GitHub Actions, Azure Container Apps

---

## File Structure

- Create `apps/api/src/config/dodo-brands.ts`: pure mode-to-env-name mapping and brand resolver used by runtime/tests.
- Create `apps/api/scripts/provision-dodo-test-products.ts`: idempotent Dodo test catalog provisioning and verification CLI.
- Modify `apps/api/src/env.ts`: parse three optional brand variables and require only the active Dodo mode's brand in production.
- Modify `apps/api/src/bootstrap.ts`: pass all mode-specific brands into each Dodo provider instance.
- Modify `apps/api/src/modules/payments/providers/dodo.ts`: create Checkout Sessions for credits, subscriptions, and transactions with the selected brand.
- Modify `apps/api/src/modules/payments/provider.ts`: retain provider-neutral checkout inputs; no Dodo brand fields enter this interface.
- Modify `apps/api/src/routes/payments.ts`: normalize/log provider failures and return a generic checkout error.
- Modify `packages/contracts/src/ts/billing/credit-plans.ts`: replace four placeholder Dodo IDs.
- Modify `packages/contracts/src/ts/billing/subscription-plans.ts`: replace three non-test Dodo IDs.
- Modify `.github/workflows/deploy-production.yml`, `.github/workflows/deploy-production-infra.yml`, `.github/workflows/test.yml`, and `apps/api/.env.example`: propagate the three variables and validate only the active mode.
- Modify focused API/provider/deployment tests listed in the tasks below.

### Task 1: Define Mode-Specific Brand Configuration

**Files:**
- Create: `apps/api/src/config/dodo-brands.ts`
- Modify: `apps/api/src/env.ts`
- Modify: `apps/api/src/bootstrap.ts`
- Modify: `apps/api/.env.example`
- Test: `apps/api/tests/config/dodo-env.test.ts`

- [ ] **Step 1: Write failing brand-resolution and active-mode environment tests**

Extend `apps/api/tests/config/dodo-env.test.ts` so its loader accepts a mode and brand overrides. Mutate `applicationConfig.billing.mode` before importing `env`, then assert:

```ts
it.each([
  ["credits", "DODO_CREDITS_BRAND_ID"],
  ["subscriptions", "DODO_SUBSCRIPTIONS_BRAND_ID"],
  ["transactions", "DODO_TRANSACTIONS_BRAND_ID"],
] as const)("requires only the %s brand for production Dodo billing", async (mode, requiredKey) => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);

  await expect(loadDodoEnvironment({
    nodeEnv: "production",
    mode,
    brands: {
      DODO_CREDITS_BRAND_ID: mode === "credits" ? undefined : "brnd_credits",
      DODO_SUBSCRIPTIONS_BRAND_ID: mode === "subscriptions" ? undefined : "brnd_subscriptions",
      DODO_TRANSACTIONS_BRAND_ID: mode === "transactions" ? undefined : "brnd_transactions",
    },
  })).rejects.toThrow("Invalid environment variables");

  const { env } = await loadDodoEnvironment({
    nodeEnv: "production",
    mode,
    brands: { [requiredKey]: `brnd_${mode}` },
  });
  expect(env[requiredKey]).toBe(`brnd_${mode}`);
});
```

Provide all existing mandatory production secrets and HTTPS URLs in the test helper so failure is isolated to the selected brand. Add a test proving Stripe does not require any Dodo brand.

- [ ] **Step 2: Run the environment test to verify RED**

Run: `bun run --cwd apps/api test -- tests/config/dodo-env.test.ts`

Expected: FAIL because the three variables and active-mode validation do not exist.

- [ ] **Step 3: Add the pure brand configuration module**

Create `apps/api/src/config/dodo-brands.ts`:

```ts
import type { BillingMode } from "./application";

export const DODO_BRAND_ENV_BY_BILLING_MODE = {
  credits: "DODO_CREDITS_BRAND_ID",
  subscriptions: "DODO_SUBSCRIPTIONS_BRAND_ID",
  transactions: "DODO_TRANSACTIONS_BRAND_ID",
} as const satisfies Record<BillingMode, string>;

export type DodoBrandConfig = Partial<Record<BillingMode, string>>;

export function dodoBrandsFromEnvironment(env: {
  DODO_CREDITS_BRAND_ID?: string;
  DODO_SUBSCRIPTIONS_BRAND_ID?: string;
  DODO_TRANSACTIONS_BRAND_ID?: string;
}): DodoBrandConfig {
  return {
    credits: env.DODO_CREDITS_BRAND_ID,
    subscriptions: env.DODO_SUBSCRIPTIONS_BRAND_ID,
    transactions: env.DODO_TRANSACTIONS_BRAND_ID,
  };
}
```

- [ ] **Step 4: Replace the old environment variable and validate the active mode**

In `apps/api/src/env.ts`, import `applicationConfig` and `DODO_BRAND_ENV_BY_BILLING_MODE`. Replace `DODO_TRANSACTION_BRAND_ID` with:

```ts
DODO_CREDITS_BRAND_ID: emptyToUndefined(z.string().trim().min(1)),
DODO_SUBSCRIPTIONS_BRAND_ID: emptyToUndefined(z.string().trim().min(1)),
DODO_TRANSACTIONS_BRAND_ID: emptyToUndefined(z.string().trim().min(1)),
```

Inside production `superRefine`, when `PAYMENT_PROVIDER === "dodo"`, require only:

```ts
const brandKey = DODO_BRAND_ENV_BY_BILLING_MODE[applicationConfig.billing.mode];
if (!value[brandKey]) {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: [brandKey],
    message: `${brandKey} is required for ${applicationConfig.billing.mode} Dodo billing`,
  });
}
```

- [ ] **Step 5: Pass all brands through bootstrap**

In both `createDodoPaymentProvider` calls in `apps/api/src/bootstrap.ts`, replace `transactionBrandId` with:

```ts
brands: dodoBrandsFromEnvironment(env),
```

- [ ] **Step 6: Document the three variables**

Replace the old entry in `apps/api/.env.example` with:

```dotenv
# Configure the brand used by each Dodo billing mode. Only the active mode is required.
DODO_CREDITS_BRAND_ID=""
DODO_SUBSCRIPTIONS_BRAND_ID=""
DODO_TRANSACTIONS_BRAND_ID=""
```

- [ ] **Step 7: Run focused tests and typecheck**

Run: `bun run --cwd apps/api test -- tests/config/dodo-env.test.ts && bun run typecheck:api`

Expected: environment tests and API typecheck pass.

### Task 2: Unify Dodo Checkout Sessions Across Billing Modes

**Files:**
- Modify: `apps/api/src/modules/payments/providers/dodo.ts`
- Modify: `apps/api/src/routes/payments.ts`
- Modify: `apps/api/tests/modules/payments/dodo-provider.test.ts`
- Modify: `apps/api/tests/payments-core/checkout-binding.test.ts`
- Modify: `apps/api/tests/app.functional.test.ts`

- [ ] **Step 1: Replace hosted-link expectations with failing session expectations**

In `apps/api/tests/modules/payments/dodo-provider.test.ts`, add table-driven credits and subscriptions cases. Construct the provider with:

```ts
brands: {
  credits: "brnd_credits",
  subscriptions: "brnd_subscriptions",
  transactions: "brnd_transactions",
},
client: { checkoutSessions: { create } } as any,
```

For credits, call `createCheckoutUrl` with `billingMode: "credits"`, `packageKey: "starter"`, and a discount. Assert the session payload contains:

```ts
{
  brand_id: "brnd_credits",
  product_cart: [{ product_id: "pdt_credit", quantity: 1 }],
  customer: { email: "alice@example.com" },
  discount_code: "SAVE10",
  feature_flags: { allow_discount_code: true },
  metadata: {
    billingMode: "credits",
    userId: "user-1",
    packageKey: "starter",
    referenceId: "checkout-ref-1",
    checkoutReferenceId: "checkout-ref-1",
    productId: "pdt_credit",
  },
  return_url: "https://app.test/billing?success=true",
  cancel_url: "https://app.test/billing?cancel=true",
  short_link: false,
}
```

For subscriptions, assert `brand_id: "brnd_subscriptions"`, `planKey`, and no package key. Update transaction tests to use `brands.transactions`.

- [ ] **Step 2: Run provider tests to verify RED**

Run: `bun run --cwd apps/api test -- tests/modules/payments/dodo-provider.test.ts tests/payments-core/checkout-binding.test.ts`

Expected: FAIL because credits/subscriptions still return static `/buy/` URLs and the provider still accepts `transactionBrandId`.

- [ ] **Step 3: Implement one checkout-session helper**

In `apps/api/src/modules/payments/providers/dodo.ts`:

- Replace `transactionBrandId?: string` with `brands?: DodoBrandConfig`.
- Add a private function inside `createDodoPaymentProvider` that requires `options.client?.checkoutSessions`, creates a session, normalizes 4xx/5xx errors, and requires `checkout_url`.
- Cast only the request object because Dodo accepts `brand_id` although SDK `2.13.1` omits it from `CheckoutSessionCreateParams`.
- Make `createCheckoutUrl` async and call that helper with the brand selected by `input.billingMode`.
- Make `createTransactionCheckoutUrl` call the same helper with `options.brands?.transactions`.
- Throw `Missing Dodo brand configuration for ${mode}` before calling Dodo when the selected brand is absent.

The normal checkout cart must omit `amount` for fixed-price products. Transaction checkout retains its current amount fields and local immutable-price checks.

- [ ] **Step 4: Preserve metadata, address, discounts, and return URLs**

Map normal checkout input exactly as asserted in Step 1. Use `cancel_url` now that Checkout Sessions supports it. Continue using singular `discount_code` to preserve current behavior; set `feature_flags.allow_discount_code` to `Boolean(input.discountCode)`.

- [ ] **Step 5: Keep client errors generic and server logs detailed**

Wrap `activeProvider.createCheckoutUrl` in `apps/api/src/routes/payments.ts` with the same pattern as transaction checkout:

```ts
try {
  const checkoutUrl = await bootstrap.paymentProviders.activeProvider.createCheckoutUrl(input);
  return c.json({ success: true, data: { checkoutUrl } });
} catch (error) {
  logger.error({ requestId: c.get("requestId"), userId: authUser.id, billingMode: requestMode, error }, "billing_checkout.create.failed");
  return badRequest(c, "Failed to create checkout");
}
```

Add a functional regression asserting provider details do not appear in the response.

- [ ] **Step 6: Run focused provider and route tests**

Run: `bun run --cwd apps/api test -- tests/modules/payments/dodo-provider.test.ts tests/payments-core/checkout-binding.test.ts tests/app.functional.test.ts`

Expected: all focused tests pass.

### Task 3: Add Idempotent Dodo Test Product Provisioning

**Files:**
- Create: `apps/api/scripts/provision-dodo-test-products.ts`
- Create: `apps/api/tests/deployment/dodo-test-products.test.ts`
- Modify: `apps/api/package.json`

- [ ] **Step 1: Write failing catalog-definition tests**

Export a pure `DODO_TEST_PRODUCT_CATALOG` from the new script and test these exact entries:

```ts
[
  { mode: "credits", key: "starter", name: "Credits Starter", brandId: "bus_0NjwOIqJas23wqi7I8PKY", price: 500, recurring: false },
  { mode: "credits", key: "advanced", name: "Credits Advanced", brandId: "bus_0NjwOIqJas23wqi7I8PKY", price: 1000, recurring: false },
  { mode: "credits", key: "pro", name: "Credits Pro", brandId: "bus_0NjwOIqJas23wqi7I8PKY", price: 2500, recurring: false },
  { mode: "credits", key: "max", name: "Credits Max", brandId: "bus_0NjwOIqJas23wqi7I8PKY", price: 5000, recurring: false },
  { mode: "subscriptions", key: "Bronze", name: "Subscription Bronze", brandId: "brnd_0NkektvcLn6O8e4Xusuvz", price: 1000, recurring: true },
  { mode: "subscriptions", key: "Silver", name: "Subscription Silver", brandId: "brnd_0NkektvcLn6O8e4Xusuvz", price: 2500, recurring: true },
  { mode: "subscriptions", key: "Gold", name: "Subscription Gold", brandId: "brnd_0NkektvcLn6O8e4Xusuvz", price: 5000, recurring: true },
]
```

Assert every product is EUR, tax-exclusive, `digital_products`, discount `0`, and purchasing-power-parity `false`. Recurring products use frequency `1 Month`, period `1 Month`, and zero trial days.

- [ ] **Step 2: Run the provisioning unit test to verify RED**

Run: `bun run --cwd apps/api test -- tests/deployment/dodo-test-products.test.ts`

Expected: FAIL because the provisioning module does not exist.

- [ ] **Step 3: Implement stable metadata and idempotent matching**

Define product metadata:

```ts
metadata: {
  managedBy: "boilerplate-singletenant-hono",
  billingMode: product.mode,
  productKey: product.key,
}
```

For each brand, list products with `client.products.list({ brand_id: product.brandId, limit: 100 })`. Match existing products by all three metadata fields. If a match exists, verify brand, name, price, currency, price type, interval, and tax exclusivity; fail with a descriptive mismatch instead of silently mutating it. If absent and not in verify mode, create it with `client.products.create(...)`.

- [ ] **Step 4: Implement CLI modes and safe output**

Support:

```text
bun run billing:provision:dodo-test-products
bun run billing:verify:dodo-test-products
```

Load `DODO_PAYMENTS_API_KEY`, force `test_mode`, never print the key, and print a JSON map of `{ mode: { key: productId } }`. `--verify` must never create products.

Guard CLI execution so importing `DODO_TEST_PRODUCT_CATALOG` in Vitest has no network or environment side effects:

```ts
if (import.meta.main) {
  await main(process.argv.slice(2));
}
```

Add scripts to `apps/api/package.json`:

```json
"billing:provision:dodo-test-products": "bun scripts/provision-dodo-test-products.ts",
"billing:verify:dodo-test-products": "bun scripts/provision-dodo-test-products.ts --verify"
```

- [ ] **Step 5: Run unit tests and typecheck**

Run: `bun run --cwd apps/api test -- tests/deployment/dodo-test-products.test.ts && bun run typecheck:api`

Expected: tests and typecheck pass without network access.

- [ ] **Step 6: Provision the seven Dodo test products**

Run: `bun run --cwd apps/api billing:provision:dodo-test-products`

Expected: seven products are created or validated and a JSON product-ID map is printed. Record the IDs for Task 4. Do not run against live mode.

- [ ] **Step 7: Verify idempotency against Dodo**

Run: `bun run --cwd apps/api billing:verify:dodo-test-products`

Expected: all seven products validate with no creations or mismatches.

### Task 4: Replace Placeholder And Wrong-Environment Product IDs

**Files:**
- Modify: `packages/contracts/src/ts/billing/credit-plans.ts`
- Modify: `packages/contracts/src/ts/billing/subscription-plans.ts`
- Modify: `apps/api/tests/modules/billing/billing-mode.test.ts`
- Modify: `apps/api/tests/deployment/dodo-test-products.test.ts`

- [ ] **Step 1: Add failing contract assertions**

Assert every Dodo ID in credit and subscription plans starts with `pdt_`, contains no `TEST`, is unique within and across the two modes, and equals the ID map returned by provisioning.

- [ ] **Step 2: Run contract tests to verify RED**

Run: `bun run --cwd apps/api test -- tests/modules/billing/billing-mode.test.ts tests/deployment/dodo-test-products.test.ts`

Expected: FAIL on placeholder credits and old subscription IDs.

- [ ] **Step 3: Update all seven contract IDs**

Replace each Dodo ID in `credit-plans.ts` and `subscription-plans.ts` with the exact IDs printed in Task 3. Update explicit expected objects in `billing-mode.test.ts`.

- [ ] **Step 4: Verify the contracts and remote catalog**

Run: `bun run --cwd apps/api test -- tests/modules/billing/billing-mode.test.ts tests/deployment/dodo-test-products.test.ts && bun run --cwd apps/api billing:verify:dodo-test-products`

Expected: local assertions pass and Dodo verifies every contract ID under the expected brand.

### Task 5: Update CI And Production Deployment

**Files:**
- Modify: `.github/workflows/test.yml`
- Modify: `.github/workflows/deploy-production.yml`
- Modify: `.github/workflows/deploy-production-infra.yml`
- Modify: `apps/api/tests/deployment/custom-domain-workflows.test.ts`

- [ ] **Step 1: Write failing workflow assertions**

Update deployment tests to require all three GitHub variables in both production workflows:

```yaml
DODO_CREDITS_BRAND_ID: ${{ vars.DODO_CREDITS_BRAND_ID }}
DODO_SUBSCRIPTIONS_BRAND_ID: ${{ vars.DODO_SUBSCRIPTIONS_BRAND_ID }}
DODO_TRANSACTIONS_BRAND_ID: ${{ vars.DODO_TRANSACTIONS_BRAND_ID }}
```

Assert the workflow derives the active brand variable from `applicationConfig.billing.mode`, validates only that variable, and passes all three non-empty values to Azure without requiring inactive values.

- [ ] **Step 2: Run workflow tests to verify RED**

Run: `bun run --cwd apps/api test -- tests/deployment/custom-domain-workflows.test.ts`

Expected: FAIL because workflows still use the singular transaction setting.

- [ ] **Step 3: Configure all three variables in CI**

Replace the old CI variable with:

```yaml
DODO_CREDITS_BRAND_ID: bus_test_credits
DODO_SUBSCRIPTIONS_BRAND_ID: brnd_test_subscriptions
DODO_TRANSACTIONS_BRAND_ID: brnd_test_transactions
```

- [ ] **Step 4: Derive active-mode validation in workflows**

After `bun install`, add a step that executes a short Bun expression importing `applicationConfig` and `DODO_BRAND_ENV_BY_BILLING_MODE`, writes the active environment-variable name to `GITHUB_OUTPUT`, and validates only `${!active_brand_variable}`. Keep database/secrets validation separate so error messages name the missing brand variable rather than calling it a database setting.

- [ ] **Step 5: Propagate all configured brands to Azure**

In infrastructure deployment, append an env argument only when its corresponding GitHub variable is non-empty. In routine deployment, build `brand_env_args` the same way and pass them with `--set-env-vars`; this permits switching modes without requiring unrelated brands while preserving already configured inactive values.

- [ ] **Step 6: Run workflow tests**

Run: `bun run --cwd apps/api test -- tests/deployment/custom-domain-workflows.test.ts`

Expected: all workflow tests pass.

### Task 6: Configure Repository Variables And Refresh Azure

**Files:**
- No repository source changes expected.

- [ ] **Step 1: Set the three GitHub repository variables**

Run:

```bash
gh variable set DODO_CREDITS_BRAND_ID --body "bus_0NjwOIqJas23wqi7I8PKY"
gh variable set DODO_SUBSCRIPTIONS_BRAND_ID --body "brnd_0NkektvcLn6O8e4Xusuvz"
gh variable set DODO_TRANSACTIONS_BRAND_ID --body "brnd_0NkekyIEbYi9v452YxAZC"
```

Delete the obsolete variable only after code/workflow deployment:

```bash
gh variable delete DODO_TRANSACTION_BRAND_ID
```

- [ ] **Step 2: Ensure GitHub has the current valid Dodo test key**

Set `DODO_PAYMENTS_API_KEY` through GitHub Secrets using the current valid test-mode key. Never print or commit it.

- [ ] **Step 3: Run Azure Production Infra after deployment**

Trigger the infrastructure workflow so the Container App secret and three brand variables are synchronized. Confirm the workflow succeeds before checkout testing.

- [ ] **Step 4: Verify effective Azure configuration without secrets**

Run `az containerapp show` and assert the active API revision contains `DODO_PAYMENTS_ENVIRONMENT=test_mode` and the three brand variable names. Do not print secret values.

### Task 7: Final Verification

**Files:**
- No additional code changes expected.

- [ ] **Step 1: Search for obsolete configuration and placeholders**

Run:

```bash
rg "DODO_TRANSACTION_BRAND_ID|transactionBrandId|pdt_TEST_CREDIT" . --glob '!node_modules/**' --glob '!.worktrees/**'
```

Expected: no matches.

- [ ] **Step 2: Run remote test-catalog verification**

Run: `bun run --cwd apps/api billing:verify:dodo-test-products`

Expected: all credit and subscription products match mode, brand, price, currency, recurrence, and tax settings.

- [ ] **Step 3: Run repository checks**

Run: `git diff --check && bun run test:ci`

Expected: clean diff check; database check, all typechecks, and all test suites pass.

- [ ] **Step 4: Test each mode deliberately**

For each value of `applicationConfig.billing.mode`, run the API with the corresponding brand configured and create one checkout. Verify the returned URL is a Dodo test Checkout Session URL. Restore `transactions` after testing unless the product configuration decision changes.

- [ ] **Step 5: Inspect production logs after transaction checkout**

Confirm `POST /me/transaction-basket/checkout` returns 200 and no `transaction_checkout.create.failed` event appears. Repeat production deployment only after the stale API key is refreshed through the infrastructure workflow.
