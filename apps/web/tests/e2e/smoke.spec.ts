import { expect, test } from "@playwright/test";

test.describe("web smoke", () => {
  test("loads localized login route", async ({ page }) => {
    await page.goto("/en/login");
    await expect(page).toHaveURL(/\/en\/login$/);
    await expect(page).toHaveTitle(/.+/);
  });

  test("switches locale route from english to dutch", async ({ page }) => {
    await page.goto("/en/login");
    await page.goto("/nl/login");
    await expect(page).toHaveURL(/\/nl\/login$/);
  });
});
