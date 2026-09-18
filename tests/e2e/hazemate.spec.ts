import { expect, test } from "@playwright/test";

test.describe("Hazemate PWA", () => {
  test("renders core environmental dashboard", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/Hazemate/i);
    await expect(page.getByRole("heading", { name: /Know the air/i })).toBeVisible();
    await expect(page.getByText("24-hour PSI")).toBeVisible();
    await expect(page.getByText(/Temperature/)).toBeVisible();
    await expect(page.getByText(/Humidity/)).toBeVisible();
    await expect(page.getByText("Do I need a mask?")).toBeVisible();
  });

  test("lets a user choose a Singapore region", async ({ page }) => {
    await page.goto("/");

    const regionSelect = page.getByLabel("Choose region");
    await regionSelect.selectOption("east");

    await expect(regionSelect).toHaveValue("east");
    await expect(page.getByText(/East Singapore/i)).toBeVisible({ timeout: 15_000 });
  });

  test("handles geolocation without storing precise coordinates in the UI", async ({ browser }) => {
    const context = await browser.newContext({
      permissions: ["geolocation"],
      geolocation: { latitude: 1.3521, longitude: 103.8198 }
    });
    const page = await context.newPage();

    await page.goto("/");
    await page.getByRole("button", { name: /Use my location/i }).click();

    await expect(page.getByText(/Singapore/i).first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText("1.3521");
    await expect(page.locator("body")).not.toContainText("103.8198");

    await context.close();
  });
});
