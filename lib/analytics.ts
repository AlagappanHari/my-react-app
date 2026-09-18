import posthog from "posthog-js";

export type HazemateAnalyticsEvent =
  | "environment_loaded"
  | "environment_load_failed"
  | "location_permission_requested"
  | "location_permission_granted"
  | "location_permission_denied"
  | "region_selected"
  | "pwa_install_prompt_available"
  | "pwa_install_clicked"
  | "pwa_install_result";

export function captureHazemateEvent(
  event: HazemateAnalyticsEvent,
  properties?: Record<string, string | number | boolean | null | undefined>
) {
  if (typeof window === "undefined") return;
  posthog.capture(event, properties);
}
