import { expect, test } from "@playwright/test";

const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_ADMIN_PASSWORD;
const userEmail = process.env.E2E_USER_EMAIL;
const userPassword = process.env.E2E_USER_PASSWORD;
const apiURL = process.env.PLAYWRIGHT_API_URL ?? "http://127.0.0.1:18787";

if (process.env.E2E_SYSTEM !== "1" || !email || !password || !userEmail || !userPassword) {
  throw new Error("Run this suite through the test:e2e:admin:system script");
}

test("administrator can use every transaction billing section", async ({ page }) => {
  const pageErrors: string[] = [];
  const serverErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (response.url().startsWith(apiURL) && response.status() >= 500) {
      serverErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });

  await page.goto("/en/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('form button[type="submit"]').first().click();

  await expect(page).toHaveURL(/\/en\/admin\/overview(?:[/?#]|$)/);
  await expect(page.getByRole("heading", { name: "Admin Panel" })).toBeVisible();

  await page.goto("/en/admin/billing");
  await expect(page.getByRole("heading", { name: "Transaction finance" })).toBeVisible();
  await expect(page.getByText("Conversion rate", { exact: true })).toBeVisible();
  await expect(page.getByText("Revenue trend", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Orders", exact: true }).click();
  await expect(page).toHaveURL(/section=orders/);
  await expect(page.getByText("Orders · last 30 days", { exact: true })).toBeVisible();
  await page.locator("#transaction-search").fill(email);
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("search")).toBe(email);
  await expect(page.getByText(email, { exact: true }).first()).toBeVisible();
  await page.getByRole("row").filter({ hasText: email }).first().click();
  await expect(page.getByText("Payment ID", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("search")).toBeNull();
  await page.locator("#transaction-status").click();
  await page.getByRole("option", { name: "Paid", exact: true }).click();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("status")).toBe("paid");
  await expect(page.getByText("Paid", { exact: true }).first()).toBeVisible();

  await page.getByRole("link", { name: "Refunds", exact: true }).click();
  await expect(page).toHaveURL(/section=refunds/);
  await expect(page.getByText("Refundable orders", { exact: true })).toBeVisible();
  await expect(page.getByText("€20.00", { exact: true }).first()).toBeVisible();

  await page.getByRole("link", { name: "Products", exact: true }).click();
  await expect(page).toHaveURL(/section=products/);
  await expect(page.getByText("Product performance", { exact: true })).toBeVisible();
  await expect(page.getByText("Starter content", { exact: true })).toBeVisible();
  await expect(page.getByText("Premium content", { exact: true })).toBeVisible();

  expect(pageErrors).toEqual([]);
  expect(serverErrors).toEqual([]);
});

test("authenticated non-admin is rejected by the admin console", async ({ page }) => {
  const pageErrors: string[] = [];
  const serverErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (response.url().startsWith(apiURL) && response.status() >= 500) {
      serverErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });

  await page.goto("/en/login");
  await page.locator('input[type="email"]').fill(userEmail);
  await page.locator('input[type="password"]').fill(userPassword);
  await page.locator('form button[type="submit"]').first().click();

  await expect(page).toHaveURL(/\/en\/login(?:[/?#]|$)/);
  await expect(page.getByText("This account is not allowed to access the admin portal.", { exact: true })).toBeVisible();
  expect(pageErrors).toEqual([]);
  expect(serverErrors).toEqual([]);
});
