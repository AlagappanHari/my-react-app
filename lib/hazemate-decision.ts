export type Audience = "General" | "Children" | "Elderly" | "Sensitive";
export type Intensity = "light" | "moderate" | "high";
export type FreshnessStatus = "fresh" | "stale" | "partial" | "unavailable";
export type Suitability = "Suitable" | "Use caution" | "Limit" | "Avoid" | "Unable to advise";

export type DecisionInput = {
  psi24h: number | null;
  pm25_1h: number | null;
  audience: Audience;
  intensity?: Intensity;
  freshness: FreshnessStatus;
};

export type DecisionResult = {
  suitability: Suitability;
  tone: "good" | "moderate" | "unhealthy" | "neutral";
  headline: string;
  recommendation: string;
  reason: string;
  confidence: "Fresh" | "Partial" | "Stale" | "Unavailable";
};

export const DECISION_RULE_VERSION = "2026-09-21";
export const HEALTH_GUIDANCE_REVIEWED_AT = "2026-09-21";

export function classifyPsi(psi: number | null) {
  if (psi == null) return { label: "Unavailable", tone: "neutral" as const };
  if (psi <= 50) return { label: "Good", tone: "good" as const };
  if (psi <= 100) return { label: "Moderate", tone: "moderate" as const };
  if (psi <= 200) return { label: "Unhealthy", tone: "unhealthy" as const };
  if (psi <= 300) return { label: "Very Unhealthy", tone: "unhealthy" as const };
  return { label: "Hazardous", tone: "unhealthy" as const };
}

export function classifyPm25(pm25: number | null) {
  if (pm25 == null) return { label: "Unavailable", band: null, tone: "neutral" as const };
  if (pm25 <= 55) return { label: "Normal", band: 1, tone: "good" as const };
  if (pm25 <= 150) return { label: "Elevated", band: 2, tone: "moderate" as const };
  if (pm25 <= 250) return { label: "High", band: 3, tone: "unhealthy" as const };
  return { label: "Very High", band: 4, tone: "unhealthy" as const };
}

function rank(state: Suitability) {
  return { "Suitable": 0, "Use caution": 1, "Limit": 2, "Avoid": 3, "Unable to advise": 4 }[state];
}

function stricter(a: Suitability, b: Suitability): Suitability {
  return rank(a) >= rank(b) ? a : b;
}

function psiDecision(psi: number | null, audience: Audience, intensity: Intensity): Suitability {
  if (psi == null) return "Suitable";
  const vulnerable = audience !== "General";

  if (psi > 300) return "Avoid";
  if (psi > 200) return vulnerable || intensity !== "light" ? "Avoid" : "Limit";
  if (psi > 100) {
    if (audience === "Sensitive") return intensity === "light" ? "Limit" : "Avoid";
    if (vulnerable) return intensity === "high" ? "Avoid" : "Limit";
    return intensity === "high" ? "Limit" : "Use caution";
  }
  if (psi > 50 && vulnerable && intensity === "high") return "Use caution";
  return "Suitable";
}

function pmDecision(pm25: number | null, audience: Audience, intensity: Intensity): Suitability {
  if (pm25 == null) return "Suitable";
  const vulnerable = audience !== "General";

  if (pm25 >= 251) return intensity === "light" && !vulnerable ? "Limit" : "Avoid";
  if (pm25 >= 151) return vulnerable || intensity === "high" ? "Avoid" : "Limit";
  if (pm25 >= 56) {
    if (vulnerable && intensity !== "light") return "Avoid";
    if (intensity === "high") return "Limit";
    return vulnerable ? "Limit" : "Use caution";
  }
  return "Suitable";
}

function recommendationFor(state: Suitability, audience: Audience, intensity: Intensity) {
  switch (state) {
    case "Suitable":
      return "Outdoor activity is generally suitable. Keep checking conditions if you will be outside for long.";
    case "Use caution":
      return intensity === "high"
        ? "You can go out, but reduce strenuous exertion and keep the session shorter."
        : "Conditions need some caution. Keep activity light and reduce exposure if you feel unwell.";
    case "Limit":
      return audience === "General"
        ? "Reduce prolonged or strenuous outdoor activity. Prefer a shorter or lighter session."
        : "Minimise prolonged or strenuous outdoor activity. Prefer a shorter, lighter or indoor option.";
    case "Avoid":
      return "Avoid strenuous outdoor activity and minimise outdoor exposure where practical.";
    default:
      return "Hazemate does not have enough fresh air-quality data to give a confident outdoor recommendation.";
  }
}

export function getOutdoorDecision(input: DecisionInput): DecisionResult {
  const intensity = input.intensity ?? "moderate";
  const availableCount = [input.psi24h, input.pm25_1h].filter((v) => v != null).length;

  if (input.freshness === "unavailable" || availableCount === 0) {
    return {
      suitability: "Unable to advise",
      tone: "neutral",
      headline: "Current guidance unavailable",
      recommendation: recommendationFor("Unable to advise", input.audience, intensity),
      reason: "Current PSI and PM2.5 readings are unavailable.",
      confidence: "Unavailable",
    };
  }

  const base = stricter(
    psiDecision(input.psi24h, input.audience, intensity),
    pmDecision(input.pm25_1h, input.audience, intensity)
  );

  if (input.freshness === "stale") {
    return {
      suitability: base === "Avoid" ? "Avoid" : "Unable to advise",
      tone: base === "Avoid" ? "unhealthy" : "neutral",
      headline: base === "Avoid" ? "Use the more cautious option" : "Data may be out of date",
      recommendation:
        base === "Avoid"
          ? recommendationFor("Avoid", input.audience, intensity)
          : "Refresh before making a time-sensitive outdoor decision. The latest available reading is stale.",
      reason: "The latest environmental observation is older than Hazemate's freshness threshold.",
      confidence: "Stale",
    };
  }

  const partial = input.freshness === "partial" || availableCount < 2;
  const state = partial && base === "Suitable" ? "Use caution" : base;
  const tone =
    state === "Suitable" ? "good" :
    state === "Use caution" || state === "Limit" ? "moderate" :
    state === "Avoid" ? "unhealthy" : "neutral";

  const factors = [
    input.psi24h != null ? `24-hr PSI ${input.psi24h}` : null,
    input.pm25_1h != null ? `1-hr PM2.5 ${input.pm25_1h} µg/m³` : null,
    input.audience !== "General" ? `${input.audience} profile` : null,
    intensity === "high" ? "high-intensity activity" : null,
  ].filter(Boolean).join(", ");

  return {
    suitability: state,
    tone,
    headline:
      state === "Suitable" ? "Generally suitable to go outside" :
      state === "Use caution" ? "Go out with some caution" :
      state === "Limit" ? "Limit outdoor exertion" :
      state === "Avoid" ? "Prefer an indoor alternative" :
      "Current guidance unavailable",
    recommendation: recommendationFor(state, input.audience, intensity),
    reason: partial ? `Limited-data recommendation based on ${factors}.` : `Based on ${factors}.`,
    confidence: partial ? "Partial" : "Fresh",
  };
}

export function getMaskGuidance(input: Pick<DecisionInput, "psi24h" | "audience" | "freshness">) {
  if (input.freshness === "unavailable" || input.freshness === "stale") {
    return {
      title: "Check current official guidance first",
      body: "Hazemate does not have sufficiently fresh data for a mask recommendation.",
    };
  }

  const psi = input.psi24h;
  if (psi == null) {
    return {
      title: "PSI is unavailable",
      body: "Use current official haze guidance before deciding on respiratory protection.",
    };
  }

  if (psi > 300) {
    return {
      title: "Prioritise avoiding exposure",
      body: "For a healthy person who must be outdoors for several hours in hazardous conditions, a well-fitting N95 may reduce exposure. Avoiding or reducing exposure remains the priority.",
    };
  }

  if (psi > 200 && input.audience !== "General") {
    return {
      title: "Minimise outdoor exposure",
      body: "Vulnerable people should avoid or minimise outdoor activity in very unhealthy conditions. If prolonged outdoor exposure is unavoidable, consult current official guidance on N95 use.",
    };
  }

  return {
    title: "An N95 is generally not needed for short exposure",
    body: "For short trips such as commuting, official Singapore guidance generally does not require an N95. Reducing prolonged or strenuous exposure remains more important during haze.",
  };
}
