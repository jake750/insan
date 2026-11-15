# Insan

Next.js 16 humanizer (web + PWA), Capacitor Android/iOS app in `android/` and `ios/`. Details in README.md.

- Checks: `npm run check` (typecheck + tests, prints only failures). Build: `npm run build`.
- Native: `npm run native:build` (static export to `.next-native/`, `cap sync`); the proxy route is `route.web.ts` so the export skips it.

## Releases

- No PRs: commit finished work and push straight to `main`.
- App changes (src, public, android/ios config, icons, dependencies) ship in a new release without asking; CI, scripts, tests and docs ride in the next one. Batch fixes that land together.
- `npm run release [patch|minor|major|X.Y.Z]` bumps package.json, package-lock, Android versionName/versionCode and iOS versions, commits and pushes to `main`. Nothing else by hand.
- `.github/workflows/release.yml` sees the new version, creates the `vX.Y.Z` release and attaches the Android APK/AAB (signed from the `ANDROID_*` secrets) and the PC zip (source + one-click installers).
- Never type keys or passwords into GitHub; the user sets secrets themselves (README → Releases).
