# AI-detection score, purple theme, mobile + Android — Implementation Plan

> Executed natively in one session (user asked for a short plan and no waiting).

**Goal:** Add a pluggable AI-likeness score (input and output), re-theme to violet with no green, and make Insan a first-class phone app (mobile UI, PWA, Capacitor Android APK, iOS-ready).

**Architecture:** New `src/detection/` module: pure local scorer (config-weighted signals), LLM judge using the existing `makeChat`, external BYO-key adapters behind one interface, and an ensemble. UI adds a gauge, before/after card, sentence heatmap, report drawer and "re-humanize flagged". Theme moves to OKLCH tokens. Capacitor wraps a static export (`CAP=1 next build` → `out/`); native code is a thin layer in `src/native/` that is a no-op on the web.

**Tech stack:** Next 16, React 19, TS, zustand; Capacitor 8 (android, ios, haptics, clipboard, status-bar, splash-screen, share, app, keyboard), `@aparajita/capacitor-secure-storage`, CapacitorHttp (explicit calls only, so model streaming keeps working).

## Global constraints
- Do not break existing features; all 9 existing tests stay green.
- No green anywhere (hex/rgb/hsl/oklch/Tailwind classes), colours only via CSS variables, OKLCH tokens; WCAG AA for text pairs in both themes.
- Privacy: local detector offline; external detectors off by default, direct from the browser, nothing stored; keys in secure native storage inside the app.
- Scores are estimates — one-line disclaimer always visible.
- Score bands: 0–30 low, 31–60 mixed, 61–100 high; < 50 words → "unreliable" warning.

## Tasks
1. **Detection engine** — `src/detection/{types,config,local,judge,external,ensemble}.ts`; `tests/detection.test.ts` (AI sample scores > human sample in EN/FR/AR; short text flagged; ensemble weights renormalise when a source fails; judge JSON parsing).
2. **Theme** — rewrite tokens in `globals.css` (OKLCH violet / magenta / tinted neutrals / score scale), purge green from icons, manifest, layout theme-color, inline styles; `scripts/contrast-check.mjs` verifies AA.
3. **Detection UI** — `src/ui/detect/{Gauge,ScoreCard,DetectReport,useDetection}.tsx`, heatmap in `OutputView`/`InputEditor`, re-humanize flagged (threshold slider), auto-check toggle, detector settings section, PDF report export, i18n strings EN/FR/AR, all states.
4. **Mobile + PWA** — < 768px: Input | Output | Diff tabs, sticky bottom action bar (keyboard-aware via `visualViewport`), options bottom sheet with snap points, score pill → report sheet, long-press sentence menu, safe areas, 44px targets; manifest shortcuts + share_target, install prompt + iOS guide, offline banner, Web Share out.
5. **Capacitor Android** — static export config, `capacitor.config.ts`, android platform with share intent filter, local `ShareIn` plugin, adaptive icon + splash (vector), theme colours, secure key storage, native HTTP for detectors, haptics/clipboard; `android:dev`, `android:build` scripts; keystore + iOS docs. Build debug + release APK, run on emulator.
6. **Verification** — browser tests at 360×800, 390×844, 412×915 + desktop, light/dark, AR/EN; detection score table (raw / humanized / human × EN/FR/AR) in README.

## Review focus
- Arabic sentence splitting with `؟` `!` and no spaces after punctuation → heatmap offsets must still line up.
- Text under 50 words, or one long sentence → no division by zero, "unreliable" state.
- External detector returns 401/CORS → partial state names the failing source, ensemble continues.
- Re-humanize flagged when no sentence crosses the threshold → no model call, toast instead.
- App restart inside Android → keys read back from secure storage before the first run.
