import { expect, test } from "@playwright/test";

test.describe("admin smoke", () => {
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

  test("loads dutch login route", async ({ page }) => {
    await page.goto("/nl/login");
    await expect(page).toHaveURL(/\/nl\/login$/);
  });
});
