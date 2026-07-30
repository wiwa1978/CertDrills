import { expect, test } from "@playwright/test";

const email = process.env.E2E_WEB_EMAIL;
const password = process.env.E2E_WEB_PASSWORD;

test.describe("web authenticated", () => {
  test.beforeEach(() => {
    test.skip(!email || !password, "Set E2E_WEB_EMAIL and E2E_WEB_PASSWORD to run authenticated tests.");
  });

  test("logs in and lands on dashboard", async ({ page }) => {
    await page.goto("/en/login");

    await page.locator('input[type="email"]').fill(email!);
    await page.locator('input[type="password"]').fill(password!);
    await page.locator('form button[type="submit"]').first().click();

    await expect(page).toHaveURL(/\/en\/(dashboard|settings|billing)/);
    await expect(page.locator('a[href="/dashboard"], a[href$="/dashboard"]')).toHaveCount(1);
  });
});
