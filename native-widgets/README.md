# Native widgets

Hazemate is a Progressive Web App. A PWA can be installed to the iOS/Android home screen, but **OS-native home-screen widgets are separate native extensions**.

The repository includes reference widget implementations for a future native wrapper/app:
- iOS: WidgetKit / SwiftUI
- Android: Jetpack Glance

Both widgets should call the same Hazemate `/api/environment` contract, so the web app and native widgets share one source of truth.

## Recommended Phase 2
1. Wrap the existing PWA with Capacitor, or create thin native shells.
2. Add the iOS Widget Extension and Android Glance AppWidget.
3. Store a coarse preferred region, not precise location history.
4. Refresh widgets at OS-appropriate intervals; do not promise minute-by-minute updates.
