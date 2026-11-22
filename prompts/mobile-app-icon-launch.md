# Mobile: new app icon and launch animation

## Goal

Replace Expo's template icon (the blue "A" on a grid) and the static blue splash with the BeStats mark from Claude Design option 3a, and play the design's launch animation on cold start: the bars breathe and grow centre stage, then glide left while "Be" and "Stats" wipe in, and the app fades in over it.

Design reference: `prompts/design/bestats-launch/BeStats Launch.dc.html` (exported 2026-11-22 from claude.ai/design project c4d98c23, option 3a, `launch(8)`). `support.js` beside it is only the design tool's runtime.

## Inspected code

- `apps/mobile/app.json`: `icon` (`assets/images/icon.png`, Expo template), `android.adaptiveIcon` (`#E6F4FE` background, foreground, background and monochrome PNGs), `expo-splash-screen` plugin (`#208AEF`, `splash-icon.png`, `imageWidth: 76`).
- `apps/mobile/app.config.ts`: only renames the personal variant; it touches no icon or splash field.
- `apps/mobile/src/app/_layout.tsx`: `SplashScreen.preventAutoHideAsync()` at import, `SplashScreen.hideAsync()` once `useSession().loading` is false.
- `apps/mobile/package.json`: `react-native-reanimated` 4.7.1 and `react-native-worklets` 0.13.0 are installed but no screen uses them yet; no `react-native-svg`; no custom font (the app uses the system font, as the design does).
- `packages/core/src/tokens.generated.ts`: `color-background` is `#000000`; no white token meant for the brand (`color-page-stripe` is `#ffffff` but belongs to the web's page stripe).
- `apps/web/design-tokens-boundary.test.ts`: no colour literal in any `.ts`, `.tsx`, `.css`, `.js` or `.mjs` outside `globals.css` and the generated tokens; `design` directories and `.json` are not scanned.
- `pnpm-workspace.yaml`: `sharp` is in `allowBuilds: false`; sharp 0.35 ships prebuilt `@img/sharp-*` binaries, so it needs no build step.

## Skills used

`expo-design-system` (tokens, no colour literals), `vercel-react-native-skills` and `react-native-best-practices` (Reanimated on the UI thread, transforms and opacity only), `react-native-testing` (RNTL v14), Expo SDK 58 docs for `expo-splash-screen` and app icons.

## Decisions and assumptions

Agreed in the grilling session on 2026-11-22.

1. **Mobile only.** The web favicon and touch icons wait until the website is back on (it is firewalled since 2026-11-21).
2. **Ships in the next native build, no version bump.** Icon and splash are native config, so no EAS Update can carry them; `version` stays `1.0.0`.
3. **The icon, exactly 3a.** A pure black rounded square (iOS masks the corners itself) with three white bars rising left to right: in a 120 unit square, bars 15 wide with radius 4, heights 26, 43 and 64, gaps 9, bottom aligned, the group centred. One iOS icon, no dark or tinted variant.
4. **Generated, not hand drawn.** `apps/mobile/src/lib/brand-mark.ts` holds the geometry and timeline as plain numbers (no imports, no colours). `apps/mobile/scripts/brand-icons.ts` builds the SVG from it and renders with `sharp` (new `devDependency` of `@bestats/mobile`) every PNG `app.json` names, under the same file names:
   - `icon.png` 1024, opaque (iOS refuses alpha in the app icon);
   - `android-icon-foreground.png` 512, transparent, the bars inside the 66 dp safe zone;
   - `android-icon-background.png` 512, solid black;
   - `android-icon-monochrome.png` 432, white bars on transparent;
   - `splash-icon.png`: the bars at rest, transparent, at 3x of the splash size in decision 6.
   Run with `pnpm --filter @bestats/mobile brand-icons` (Node 24 runs the `.ts` directly, like `pnpm tokens`). The outputs are committed.
5. **Colours come from tokens.** Black is `color-background`. White gets a new token, `--brand-mark: #ffffff` with `--color-brand-mark` in `apps/web/app/globals.css`, then `pnpm tokens` and its line in `apps/mobile/src/global.css`. The script and the overlay read both through `@bestats/core/tokens.generated`. `app.json` (not scanned) sets `#000000` for the splash and adaptive backgrounds, and a test holds it equal to `color-background`.
6. **Native splash = the design's first frame after the expand.** The bars at rest, centred on black. The mark has a fixed size in points on every phone, the design's 300 px mock values times 4/3: bars 9.33 wide, gap 5.33, heights 16, 26.67 and 40, radius 2.67; text bold system font 45.33 pt, letter spacing -1.33, "Be" padded 13.33 on the left. So `imageWidth` is the bar group's 38.67 pt width, and the native frame and the first animated frame line up exactly.
7. **The animation, from the design's `launch(8)`, times measured from the overlay's start** (the design's `T = 500` expand is the OS's own):
   - bars, each 700 ms, starting at 100, 220 and 340 ms: height 1 → 0.12 (at 30%) → 1, curve `(.3, 1.5, .5, 1)`, scaled from the bottom;
   - lockup, 1600 ms from 0: centred on the bars at scale 1 → 1.8 by 35% → hold to 50% → its true position at scale `min(1.3, 0.767 × screen width / lockup width)`, curve `(.45, 0, .2, 1)`;
   - "Be" reveal at 900 ms for 450 ms and "Stats" at 1150 ms for 600 ms, left to right with opacity 0 → 1, curve `(.4, 0, .2, 1)`;
   - the app fades in at 2400 ms over 420 ms, scale 1.04 → 1, while the overlay fades out.
8. **Drawn with Views and Text, Reanimated, transforms and opacity only.** No `react-native-svg`. React Native has no `clip-path`, so each word's wipe is a black cover (`color-background`) inside the lockup sliding right off the word; it scales with the lockup, and the ground is solid black, so it reads as the design's clip. The lockup is measured on its first layout (the design's `offsetWidth`) before anything moves.
9. **Handoff and timing.** The overlay mounts once in the root layout, above the stack, so it plays on cold start only, never on return from background. It calls `SplashScreen.hideAsync()` after its first measured layout (replacing the hide on session load). It leaves only when the animation has finished and the session has loaded; until then the final lockup holds. A tap anywhere skips to the end. With Reduce Motion (`useReducedMotion`) it shows the final lockup and fades into the app. The full design timing is kept (about 2.8 s).
10. **Android 12+.** The system splash draws the splash image itself at a size it picks, so the first frame may not match the overlay to the point. Checked on the emulator; if it jumps, the overlay fades its lockup in over 150 ms on Android only, recorded under Changes after the build.
11. **Branch and commits:** `feat/mobile-app-icon-launch` off `main`. Small commits that each build: brand token; geometry module and icon script with the generated assets; `app.json`; the launch overlay and root layout; tests; docs.

## Expected files

- `apps/web/app/globals.css`, `packages/core/src/tokens.generated.ts`, `apps/mobile/src/global.css` (the `brand-mark` token)
- `apps/mobile/src/lib/brand-mark.ts` (new)
- `apps/mobile/scripts/brand-icons.ts` (new), `apps/mobile/package.json` (`brand-icons` script, `sharp` dev dependency), `pnpm-lock.yaml`
- `apps/mobile/assets/images/icon.png`, `android-icon-foreground.png`, `android-icon-background.png`, `android-icon-monochrome.png`, `splash-icon.png` (regenerated)
- `apps/mobile/app.json` (splash and adaptive background colours, `imageWidth`)
- `apps/mobile/src/components/launch-overlay.tsx` (new)
- `apps/mobile/src/app/_layout.tsx` (mount the overlay, move `hideAsync`)
- `apps/mobile/src/__tests__/launch-overlay.test.tsx`, `apps/mobile/src/__tests__/brand-assets.test.ts` (new); `jest.setup.ts` if Reanimated needs its mock
- `prompts/design/bestats-launch/` (the design export, committed as the reference)
- `apps/mobile/AGENTS.md` and `docs/scope/scope.md` through `/sync` afterwards.

## Requirements

- No visible jump between the native splash and the overlay's first frame on iOS.
- The app never waits longer than the animation plus the session load; a tap skips the animation.
- Reduce Motion: no bar, scale or glide motion, only the final lockup and a fade.
- The overlay is not an accessibility trap: it is hidden from VoiceOver and TalkBack (the app name is read by the OS), and it stops intercepting touches once it starts leaving.
- An expired session notice still opens Sign in once the overlay has left.
- Works at small (iPhone SE) and large widths: the final lockup never exceeds 76.7% of the screen width.
- No colour literal in any scanned file.

## Security considerations

No network call, env value, secret, route or user data. `sharp` is a dev dependency used only by a local script and never bundled into the app. The design export is static HTML and runtime JS kept as reference; nothing imports or serves it.

## Acceptance criteria

1. The home screen shows the black icon with three white bars, on iOS and on Android (adaptive, and monochrome in themed icons).
2. A cold start shows the bars on black, then the design's sequence, then the Home tab, with no white or blue flash.
3. Returning from the background shows no animation.
4. A tap during the animation goes straight to the app (or to the final lockup while the session still loads).
5. With Reduce Motion on, the lockup appears without motion and fades into the app.
6. A slow session load holds the final lockup; the app appears as soon as it loads.

## Automated checks

From the repo root: `pnpm typecheck`, `pnpm lint`, `pnpm test` (includes the token boundary and `tokens.test.ts`). `npx expo-doctor` in `apps/mobile`. `pnpm build` too, since the web's `globals.css` gains a token. No `pnpm test:db`.

Jest tests:
- `brand-assets.test.ts`: every PNG `app.json` names exists with its expected size; `icon.png` has no alpha channel (PNG colour type 2); `app.json`'s splash and adaptive backgrounds equal `color-background`; `imageWidth` equals the bar group width from `brand-mark.ts`.
- `launch-overlay.test.tsx`: hides the native splash after layout; stays while the session loads after the animation ends; leaves when both are done; a press skips to the end; Reduce Motion takes the no-motion path; it is hidden from accessibility.

## Manual test steps

1. `pnpm --filter @bestats/mobile brand-icons`, then open each PNG in `apps/mobile/assets/images/` and compare with the design's icon.
2. iOS Simulator: rebuild the development client with `npx expo run:ios` in `apps/mobile` (the icon and splash are native config), then `npx expo start --dev-client`.
3. Home screen: the BeStats icon is black with three white bars.
4. Kill and launch the app: bars on black, they breathe and grow, glide left, "Be" then "Stats" wipe in, the Home tab fades in. No flash.
5. Launch again and tap during the animation: the app appears at once.
6. Send the app to the background and back: no animation.
7. Settings, Accessibility, Motion, Reduce Motion on; launch: the lockup appears still and fades into the app.
8. Android emulator (`npx expo run:android`): the adaptive icon on the launcher, the monochrome icon with themed icons on, and the splash to overlay handoff (decision 10).
9. Record a simulator video of step 4 beside the design's Replay at speed 1 and compare timing.

## Changes after the build

Recorded after the build (2026-11-22), so this plan matches what shipped.

- **The geometry lives in core**, as `packages/core/src/brand/mark.ts` (with `mark.test.ts`), not `apps/mobile/src/lib/brand-mark.ts`. The icon script imports it as `@bestats/core/brand/mark` with no `.ts` path (which mobile's tsconfig refuses), it is pure, and a later web favicon can draw from the same SVG builder.
- **The script is `apps/mobile/scripts/brand-icons.mts`**, so Node runs it as ES module without a warning. `sharp` 0.35.4 is a dev dependency of `@bestats/mobile`; its prebuilt binary needs no `allowBuilds` change.
- **The token is `--color-brand-mark` in the web's product `@theme` block** (the block that holds the other meaning colours), not a `:root` `--brand-mark`.
- **The splash image is a square 40 points tall**: iOS and Android both draw the splash in a square box of `imageWidth`, so the 38.67 point wide bars sit centred inside a 40 point square, and `imageWidth` is 40.
- **The overlay hides the native splash one frame after it is measured**, with the bars' centring offset and final scale in shared values. The first simulator run drew one frame with the bars off centre because the offset arrived a frame late.
- **The words' baseline comes from the laid out text.** The design sets it on the bars' bottom edge. A fixed 40 point word box made Yoga shrink the text to 51 points and push the glyphs 3 points down, so each word takes its measured line height and drops by `height - ascender` (`onTextLayout`). Measured on the simulator: bars and the "B" end within a pixel.
- **Jest uses a small Reanimated stand in** (`src/test-utils/reanimated-mock.ts`, wired in `jest.setup.ts`). Reanimated 4.7's own mock and its Jest resolver both load its native or web runtime, which does not run under jest-expo. The stand in keeps animation durations on Jest's timers. `session-notice.test.tsx` stubs the overlay, because expo-router's test helper replaces Reanimated with its own mock.
- **Biome skips `prompts/design/`**, the vendored design export.
- **Not checked: Android** (decision 10). No Android emulator was run, so the adaptive icon, the monochrome icon and the Android 12+ splash handoff still need a look.
