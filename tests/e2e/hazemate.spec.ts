import { expect, test } from "@playwright/test";

test.describe("Hazemate responsive PWA", () => {
  test("opens directly on the live dashboard with no onboarding gate", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Hazemate/i);
    await expect(page.getByText("PSI (24-hr)")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("PM2.5 (1-hr)")).toBeVisible();
    await expect(page.getByRole("heading", { name: /healthier you/i })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Use your location" })).toHaveCount(0);
  });

  test("region can be changed from the dashboard", async ({ page }) => {
    await page.goto("/");
    const viewportWidth = page.viewportSize()?.width ?? 390;
    const regionSelect = viewportWidth >= 700
      ? page.locator(".headerRegionSelect")
      : page.locator(".mobileLocationControls .regionSelect");
    await regionSelect.selectOption("east");
    await expect(regionSelect).toHaveValue("east");
    await expect(page.locator(".locationChip strong")).toContainText("East", { timeout: 15_000 });
  });

  test("live environmental data and primary navigation work", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Temperature")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Humidity")).toBeVisible();

    await page.getByRole("button", { name: "Advice" }).click();
    await expect(page.getByRole("heading", { name: /Do I need a mask today/i })).toBeVisible();

    await page.getByRole("button", { name: "Activity" }).click();
    await expect(page.getByText("Walking")).toBeVisible();
    await expect(page.getByText("Running")).toBeVisible();
  });

  test("regional map supports PSI and PM2.5", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Map" }).click();
    await expect(page.getByText("Air Quality Map")).toBeVisible();
    await page.getByRole("button", { name: "PM2.5", exact: true }).click();
    await expect(page.getByText("µg/m³").first()).toBeVisible();
  });

  test("indoor PM2.5 comparison persists locally", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Indoor air/i }).click();
    const input = page.getByPlaceholder("Indoor PM2.5");
    await input.fill("12");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    expect(await page.evaluate(() => localStorage.getItem("hazemate-indoor-pm25"))).toBe("12");
  });

  test("responsive desktop view does not use a phone-sized shell", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await expect(page.locator(".appShell")).toBeVisible();
    const width = await page.locator(".appShell").evaluate((el) => el.getBoundingClientRect().width);
    expect(width).toBeGreaterThan(1000);
    await expect(page.locator(".desktopNav")).toBeVisible();
  });

  test("mobile navigation remains usable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.locator(".bottomNav")).toBeVisible();
    await expect(page.getByRole("button", { name: "Home" }).last()).toBeVisible();
  });

  test("geolocation never exposes precise coordinates in the UI", async ({ browser }) => {
    const context = await browser.newContext({
      permissions: ["geolocation"],
      geolocation: { latitude: 1.3521, longitude: 103.8198 }
    });
    const page = await context.newPage();
    await page.goto("/");
    const viewportWidth = page.viewportSize()?.width ?? 390;
    if (viewportWidth >= 700) {
      await page.locator(".headerControls").getByRole("button", { name: "Use my location" }).click();
    } else {
      await page.locator(".mobileLocationControls").getByRole("button", { name: "Use my location" }).click();
    }
    await expect(page.getByText("PSI (24-hr)")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).not.toContainText("1.3521");
    await expect(page.locator("body")).not.toContainText("103.8198");
    await context.close();
  });
});
