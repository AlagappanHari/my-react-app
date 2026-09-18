import { expect, test } from "@playwright/test";

async function markOnboarded(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("hazemate-onboarded", "1");
  });
}

test.describe("Hazemate PWA", () => {
  test("first-time user can complete onboarding", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/Hazemate/i);
    await expect(page.getByText("Hazemate").first()).toBeVisible();

    await expect(page.getByRole("heading", { name: /A healthier you/i })).toBeVisible({
      timeout: 5_000
    });
    await page.getByRole("button", { name: "Next →", exact: true }).click();

    await expect(page.getByRole("heading", { name: /Know/i })).toBeVisible();
    await page.getByRole("button", { name: "Next →", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Use your location" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Allow Location Access/i })).toBeVisible();
    await expect(page.getByLabel("Choose region")).toBeVisible();
  });

  test("returning user sees the live environmental dashboard", async ({ page }) => {
    await markOnboarded(page);
    await page.goto("/");

    await expect(page.getByText(/Haze/).first()).toBeVisible();
    await expect(page.getByText("PSI (24-hr)")).toBeVisible();
    await expect(page.getByText("PM2.5 (1-hr)")).toBeVisible();
    await expect(page.getByText("Quick Actions")).toBeVisible();

    await page.getByRole("button", { name: "Advice" }).click();
    await expect(page.getByRole("heading", { name: /Do I need a mask today/i })).toBeVisible();

    await page.getByRole("button", { name: "Activity" }).click();
    await expect(page.getByText("Walking")).toBeVisible();
    await expect(page.getByText("Running")).toBeVisible();
  });

  test("manual region selection completes onboarding", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("heading", { name: /A healthier you/i }).waitFor({ timeout: 5_000 });
    await page.getByRole("button", { name: "Skip" }).click();

    await expect(page.getByRole("heading", { name: "Use your location" })).toBeVisible();

    const regionSelect = page.getByLabel("Choose region");
    await regionSelect.selectOption("east");

    await expect(page.getByText(/East Region/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("PSI (24-hr)")).toBeVisible();
  });

  test("geolocation flow does not expose precise coordinates in the UI", async ({ browser }) => {
    const context = await browser.newContext({
      permissions: ["geolocation"],
      geolocation: { latitude: 1.3521, longitude: 103.8198 }
    });
    const page = await context.newPage();

    await page.goto("/");
    await page.getByRole("heading", { name: /A healthier you/i }).waitFor({ timeout: 5_000 });
    await page.getByRole("button", { name: "Skip" }).click();
    await page.getByRole("button", { name: /Allow Location Access/i }).click();

    await expect(page.getByText("PSI (24-hr)")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).not.toContainText("1.3521");
    await expect(page.locator("body")).not.toContainText("103.8198");

    await context.close();
  });
});
