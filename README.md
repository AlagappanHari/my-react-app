# Hazemate

Hazemate is a Singapore-focused PWA that combines haze, temperature and humidity into one simple decision-support experience.

## Stack
- Next.js + TypeScript
- GitHub source control
- Vercel deployment
- Supabase Postgres + Edge Functions
- data.gov.sg / NEA environmental feeds

## What is implemented
- Installable PWA shell
- Current 24-hour PSI
- 1-hour PM2.5
- Temperature from the nearest available weather station
- Relative humidity from the nearest available weather station
- Browser geolocation with manual Singapore region fallback
- Activity guidance and mask guidance
- Offline shell / cached last environmental API response
- Supabase-backed environmental snapshot cache
- iOS WidgetKit and Android Glance reference widget code

## Architecture
Browser/PWA → Next.js /api/environment → Supabase Edge Function → data.gov.sg/NEA → Supabase snapshot cache.

The Supabase function caches upstream environmental payloads for a few minutes so all clients do not repeatedly call the public APIs.

## Mobile installation
- iOS/iPadOS: Safari → Share → Add to Home Screen
- Android: browser menu → Install app

## Native widgets
A PWA can be installed to the home screen, but iOS/Android OS widgets are native extensions. Reference code is in `native-widgets/`. A thin native wrapper (for example Capacitor) can be added in Phase 2 while keeping the same Next.js/Supabase backend.

## Privacy
Precise coordinates are used only to resolve the user's current environmental context. The current implementation does not write user GPS coordinates to the database.

## Health note
Hazemate is decision support, not a medical device. During haze events, official NEA/MOH guidance should take precedence.
