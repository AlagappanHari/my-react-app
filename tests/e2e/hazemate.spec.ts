import { expect, test } from "@playwright/test";

const freshResponse = {
  region: "central",
  haze: {
    psi24h: 72,
    pm25_1h: 28,
    pm25_24h: 25,
    updatedAt: new Date().toISOString()
  },
  regions: [
    { name: "north", psi24h: 70, pm25_1h: 25, pm25_24h: 24 },
    { name: "south", psi24h: 68, pm25_1h: 24, pm25_24h: 23 },
    { name: "east", psi24h: 76, pm25_1h: 30, pm25_24h: 27 },
    { name: "west", psi24h: 80, pm25_1h: 34, pm25_24h: 31 },
    { name: "central", psi24h: 72, pm25_1h: 28, pm25_24h: 25 }
  ],
  weather: {
    temperature: { value: 30.2, stationName: "Test", distanceKm: 1.2, unit: "°C" },
    humidity: { value: 74, stationName: "Test", distanceKm: 1.2, unit: "%" }
  },
  freshness: { status: "fresh", ageMinutes: 3, isStale: false, thresholdMinutes: 15 },
  sources: { psi: "ok", pm25: "ok", temperature: "ok", humidity: "ok" },
  errors: [],
  observedAt: new Date().toISOString(),
  source: "NEA / data.gov.sg"
};

test.describe("Hazemate responsive PWA", () => {
  test("opens directly on the decision dashboard", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Hazemate/i);
    await expect(page.getByRole("heading", { name: "Can I go outside now?" })).toBeVisible();
    await expect(page.getByText("PSI (24-hr)")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("PM2.5 (1-hr)")).toBeVisible();
    await expect(page.getByText(/Generally suitable|Go out with some caution|Limit outdoor exertion|Prefer an indoor alternative|Current guidance unavailable/)).toBeVisible();
  });

  test("region can be changed and manual selection remains authoritative", async ({ page }) => {
    await page.goto("/");
    const viewportWidth = page.viewportSize()?.width ?? 390;
    const regionSelect = viewportWidth >= 700
      ? page.locator(".headerRegionSelect")
      : page.locator(".mobileLocationControls .regionSelect");

    await regionSelect.selectOption("east");
    await expect(regionSelect).toHaveValue("east");
    await expect(page.locator(".locationChip strong")).toContainText("East", { timeout: 15_000 });
    expect(await page.evaluate(() => localStorage.getItem("hazemate-location-mode"))).toBe("manual");
  });

  test("primary guidance navigation works", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Advice" }).click();
    await expect(page.getByRole("heading", { name: /Do I need a mask today/i })).toBeVisible();
    await expect(page.getByText(/Exposure reduction comes first/i)).toBeVisible();

    await page.getByRole("button", { name: "Activity" }).click();
    await expect(page.getByText("Walking")).toBeVisible();
    await expect(page.getByText("Running")).toBeVisible();
    await expect(page.getByText(/Recommendations use the more cautious result/i)).toBeVisible();
  });

  test("regional comparison is clearly schematic and supports PSI and PM2.5", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Regions" }).click();
    await expect(page.getByText("Regional Air Quality")).toBeVisible();
    await expect(page.getByText(/Schematic five-region view/i)).toBeVisible();
    await page.getByRole("button", { name: "PM2.5", exact: true }).click();
    await expect(page.getByText("µg/m³").first()).toBeVisible();
  });

  test("indoor PM2.5 is manual and persists only locally", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Indoor air/i }).click();

    const input = page.getByLabel("Indoor PM2.5 (µg/m³)");
    await input.fill("12");
    await page.getByRole("button", { name: "Save", exact: true }).click();

    expect(await page.evaluate(() => localStorage.getItem("hazemate-indoor-pm25"))).toBe("12");
    await expect(page.getByText(/manually entered/i)).toBeVisible();
    await expect(page.getByText(/not sent to Hazemate analytics/i)).toBeVisible();
  });

  test("stale data is labelled and does not produce a confident suitable recommendation", async ({ page }) => {
    const stale = {
      ...freshResponse,
      freshness: { status: "stale", ageMinutes: 45, isStale: true, thresholdMinutes: 15 }
    };

    await page.route("**/api/environment?*", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(stale) });
    });

    await page.goto("/");
    await expect(page.getByText("Stale data")).toBeVisible();
    await expect(page.getByText(/Data may be out of date|Use the more cautious option/)).toBeVisible();
  });

  test("partial data keeps healthy metrics visible and labels limited guidance", async ({ page }) => {
    const partial = {
      ...freshResponse,
      haze: { ...freshResponse.haze, psi24h: null },
      freshness: { status: "partial", ageMinutes: 2, isStale: false, thresholdMinutes: 15 }
    };

    await page.route("**/api/environment?*", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(partial) });
    });

    await page.goto("/");
    await expect(page.getByText("Limited data")).toBeVisible();
    await expect(page.getByText("28", { exact: true })).toBeVisible();
    await expect(page.getByText(/Limited-data recommendation/i)).toBeVisible();
  });

  test("responsive desktop view uses full PWA shell", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await expect(page.locator(".appShell")).toBeVisible();
    const width = await page.locator(".appShell").evaluate((element) => element.getBoundingClientRect().width);
    expect(width).toBeGreaterThan(1000);
    await expect(page.locator(".desktopNav")).toBeVisible();
    await expect(page.locator(".bottomNav")).toBeHidden();
  });

  test("mobile navigation remains usable without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.locator(".bottomNav")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });

  test("geolocation never exposes precise coordinates in the UI or local preferences", async ({ browser }) => {
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

    const stored = await page.evaluate(() => JSON.stringify(localStorage));
    expect(stored).not.toContain("1.3521");
    expect(stored).not.toContain("103.8198");
    await context.close();
  });

  test("alerts explain active-session scope", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "More" }).click();
    await expect(page.getByText(/Background Web Push is not enabled/i)).toBeVisible();
    await expect(page.getByText("Privacy & data")).toBeVisible();
  });
});
