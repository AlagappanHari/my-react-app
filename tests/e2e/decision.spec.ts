import { expect, test } from "@playwright/test";
import { getOutdoorDecision } from "../../lib/hazemate-decision";

test.describe("Hazemate decision engine boundaries", () => {
  const common = { pm25_1h: 20, audience: "General" as const, intensity: "moderate" as const, freshness: "fresh" as const };

  test("PSI 50/51 boundary remains non-escalated for general moderate activity", () => {
    expect(getOutdoorDecision({ ...common, psi24h: 50 }).suitability).toBe("Suitable");
    expect(getOutdoorDecision({ ...common, psi24h: 51 }).suitability).toBe("Suitable");
  });

  test("PSI 100/101 boundary escalates guidance", () => {
    expect(getOutdoorDecision({ ...common, psi24h: 100 }).suitability).toBe("Suitable");
    expect(getOutdoorDecision({ ...common, psi24h: 101 }).suitability).toBe("Use caution");
  });

  test("PSI 200/201 boundary escalates to limit or avoid", () => {
    expect(getOutdoorDecision({ ...common, psi24h: 200 }).suitability).toBe("Use caution");
    expect(getOutdoorDecision({ ...common, psi24h: 201 }).suitability).toBe("Limit");
  });

  test("PSI 300/301 boundary escalates to avoid", () => {
    expect(getOutdoorDecision({ ...common, psi24h: 300 }).suitability).toBe("Limit");
    expect(getOutdoorDecision({ ...common, psi24h: 301 }).suitability).toBe("Avoid");
  });

  test("sensitive guidance is never less conservative than general", () => {
    const general = getOutdoorDecision({ psi24h: 150, pm25_1h: 70, audience: "General", intensity: "high", freshness: "fresh" });
    const sensitive = getOutdoorDecision({ psi24h: 150, pm25_1h: 70, audience: "Sensitive", intensity: "high", freshness: "fresh" });
    const rank = { "Suitable": 0, "Use caution": 1, "Limit": 2, "Avoid": 3, "Unable to advise": 4 };
    expect(rank[sensitive.suitability]).toBeGreaterThanOrEqual(rank[general.suitability]);
  });

  test("stale suitable data is withheld rather than called suitable", () => {
    const result = getOutdoorDecision({ psi24h: 40, pm25_1h: 12, audience: "General", intensity: "light", freshness: "stale" });
    expect(result.suitability).toBe("Unable to advise");
    expect(result.confidence).toBe("Stale");
  });

  test("partial low readings become cautionary", () => {
    const result = getOutdoorDecision({ psi24h: null, pm25_1h: 20, audience: "General", intensity: "moderate", freshness: "partial" });
    expect(result.suitability).toBe("Use caution");
    expect(result.confidence).toBe("Partial");
  });
});
