import posthog from "posthog-js";

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

if (key && typeof window !== "undefined") {
  posthog.init(key, {
    api_host: host,
    capture_pageview: true,
    capture_pageleave: true,
    person_profiles: "identified_only",
    disable_session_recording: true,
    autocapture: true,
    loaded: (client) => {
      if (process.env.NODE_ENV === "development") {
        client.debug();
      }
    }
  });
}

export default posthog;
