# Hazemate analytics

Hazemate uses PostHog for privacy-conscious product analytics.

## Configuration

Set:

- `NEXT_PUBLIC_POSTHOG_KEY`
- `NEXT_PUBLIC_POSTHOG_HOST` (default: `https://us.i.posthog.com`)

The client initializes in `instrumentation-client.ts`, which is the recommended client instrumentation entrypoint for modern Next.js App Router projects.

## Event taxonomy

| Event | Purpose |
| --- | --- |
| `environment_loaded` | Environmental data loaded successfully |
| `environment_load_failed` | Environmental request failed |
| `location_permission_requested` | User tapped "Use my location" |
| `location_permission_granted` | Browser returned a location |
| `location_permission_denied` | Permission was denied or failed |
| `region_selected` | User manually selected a Singapore region |
| `pwa_install_prompt_available` | Browser exposed the install prompt |
| `pwa_install_clicked` | User initiated installation |
| `pwa_install_result` | Install prompt was accepted/dismissed |

## Privacy guardrails

- Do not send precise latitude or longitude to PostHog.
- Track only coarse NEA region names.
- Session recording is disabled by default.
- Person profiles are created only for identified users.
