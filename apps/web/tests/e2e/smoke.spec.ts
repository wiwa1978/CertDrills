import { expect, test } from "@playwright/test";

test.describe("web smoke", () => {
  test("loads localized home with browser assets", async ({ page }) => {
    const failedFrameworkRequests: string[] = [];
    page.on("requestfailed", (request) => {
      if (new URL(request.url()).pathname.startsWith("/_next/")) {
        failedFrameworkRequests.push(request.url());
      }
    });

    await page.goto("/nl");
    await page.waitForLoadState("networkidle");

    expect(failedFrameworkRequests).toEqual([]);
  });

  test("loads localized login route", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await page.goto("/en/login");
    await expect(page).toHaveURL(/\/en\/login$/);
    await expect(page).toHaveTitle(/.+/);
    expect(consoleErrors.filter((message) => message.includes("eval() is not supported"))).toEqual([]);
  });

  test("switches locale route from english to dutch", async ({ page }) => {
    await page.goto("/en/login");
    await page.goto("/nl/login");
    await expect(page).toHaveURL(/\/nl\/login$/);
  });
});
