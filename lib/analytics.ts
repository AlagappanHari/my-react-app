import posthog from "posthog-js";

export type HazemateAnalyticsEvent =
  | "environment_loaded"
  | "environment_load_failed"
  | "location_permission_requested"
  | "location_permission_granted"
  | "location_permission_denied"
  | "region_selected"
  | "activity_profile_changed"
  | "notification_permission_result"
  | "pwa_install_prompt_available"
  | "pwa_install_clicked"
  | "pwa_install_result";

export function captureHazemateEvent(
  event: HazemateAnalyticsEvent,
  properties?: Record<string, string | number | boolean | null | undefined>
) {
  if (typeof window === "undefined") return;

  const safeProperties = { ...(properties ?? {}) };
  delete safeProperties.latitude;
  delete safeProperties.longitude;
  delete safeProperties.lat;
  delete safeProperties.lon;

  posthog.capture(event, safeProperties);
}
