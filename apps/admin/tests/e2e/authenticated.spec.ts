import { expect, test } from "@playwright/test";

const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_ADMIN_PASSWORD;

test.describe("admin authenticated", () => {
  test.beforeEach(() => {
    test.skip(
      !email || !password,
      "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run authenticated tests.",
    );
  });

  test("logs in and lands on admin overview", async ({ page }) => {
    await page.goto("/en/login");

    await page.locator('input[type="email"]').fill(email!);
    await page.locator('input[type="password"]').fill(password!);
    await page.locator('form button[type="submit"]').first().click();

    await expect(page).toHaveURL(/\/en\/admin\/(overview|users|billing|discounts|notifications)/);
    await expect(page.locator('a[href="/admin/overview"], a[href$="/admin/overview"]')).toHaveCount(1);
  });
});
