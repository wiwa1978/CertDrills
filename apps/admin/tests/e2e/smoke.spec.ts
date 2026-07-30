import { expect, test } from "@playwright/test";

test.describe("admin smoke", () => {
  test("loads localized login route", async ({ page }) => {
    await page.goto("/en/login");
    await expect(page).toHaveURL(/\/en\/login$/);
    await expect(page).toHaveTitle(/.+/);
  });

  test("loads dutch login route", async ({ page }) => {
    await page.goto("/nl/login");
    await expect(page).toHaveURL(/\/nl\/login$/);
  });
});
