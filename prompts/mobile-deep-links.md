# Mobile deep links and password reset in the app (feature 28, step 5e)

## Goal

Finish step 5 of spec 0033 with its last slice: the deep link plumbing of AC-16 and the in app password reset of child 0036. After this slice a link to `/movies/*`, `/shows/*`, `/games/*` or `/reset-password/app` can open the app, the app can ask for a reset email and set a new password from the link, and the web has a fallback page for that link. Everything stays dormant in production while email delivery is off, exactly like the web's own reset.

## Inspected code

- Spec 0033 (`index.md`: AC-16, Build plan step 5, Proposed stack "Deep links") and child 0036, "Password reset and deep links" and "Value sourcing".
- `docs/scope/scope.md`, feature 28: 5e is the only open item of step 5.
- `apps/mobile`: `app.json`, `app.config.ts` (the `personal` variant), `eas.json`, `src/app/_layout.tsx` (root stack with the `sign-in` and `sign-up` modals), `src/app/sign-in.tsx` (no Forgot password yet), `src/lib/supabase.ts` (`detectSessionInUrl: false`, no `flowType`, so supabase-js uses the implicit flow today), `src/lib/env.ts` (`EXPO_PUBLIC_AUTH_EMAIL_DELIVERY`, `EXPO_PUBLIC_API_BASE_URL`), `src/lib/auth-errors.ts`, the route tree under `(tabs)/(index,search,library,account)/` (title routes already mirror the web paths).
- `apps/web`: `proxy.ts` matcher, `next.config.ts` (`redirects()`, no `headers()` yet), `app/(auth)/` (`forgot-password`, `reset-password`, `resetPasswordAction` which calls `updateUser` then `signOut({ scope: "global" })`, the noindex layout), `app/auth/callback/route.ts`, `public/` (only the two logos).
- `packages/core/src/auth/next-path.ts` (`isSafeNextPath`, `safeNextPath`) and `auth/messages.ts` (`RECOVERY_UNAVAILABLE_MESSAGE`).
- `supabase/config.toml`: `additional_redirect_urls` already allows `http://localhost:3000/**` and `https://bestats-app.vercel.app/**`, so `/reset-password/app` is already allowed on both. No `supabase config push` is needed.
- `docs/deploy.md` section 5: the "Website off, API on" firewall rule denies every path outside its allow list, which today includes neither `/.well-known/` nor `/reset-password/app`.

## Skills used

`expo-router` (linking, `+native-intent`), `eas-app-stores` (associated domains and intent filters in app config), `supabase` (PKCE recovery, `exchangeCodeForSession`), `react-native-testing`, `next-dev-loop` for the web page. Expo docs for SDK 58 (`docs.expo.dev/versions/v58.0.0/`, linking into your app) are read before touching `app.json`.

## Decisions and assumptions (please check these)

1. **The two well known files are not committed in this slice.** An `apple-app-site-association` needs `<TeamID>.com.kris1027.bestats`, and an `assetlinks.json` needs the SHA-256 fingerprint of the Android signing key. Neither exists yet (no Apple Developer Program membership, no Play upload), and a file with a made up ID is invented data that verifies nothing (AGENTS.md section 14). Instead I build what produces them: a pure core module, `packages/core/src/links/app-links.ts`, holds `APP_LINK_PATHS` (`/movies/*`, `/shows/*`, `/games/*`, `/reset-password/app`) and two builders, `appleAppSiteAssociation(teamId)` and `assetLinks(sha256Fingerprints)`, validating their input with Zod. A small root script, `pnpm app-links --apple-team-id <id> --android-sha256 <fp>`, writes both files into `apps/web/public/.well-known/`. In step 6, once you have the two IDs, you run it once and commit the files. A test checks that any committed file equals the builder's output, so the files and the paths never drift. This replaces the spec's "ship with only the title paths filled in" line, which cannot work without an app ID; I'd note that in the scope line, and `/architect` can confirm it later.
2. **Serving the files is wired now.** `next.config.ts` gains `headers()` setting `Content-Type: application/json` on `/.well-known/apple-app-site-association` (the file has no extension) and `/.well-known/assetlinks.json`. The `proxy.ts` matcher skips `.well-known/`, with a case in `proxy.test.ts`, so no session refresh attaches `Set-Cookie` to a file Apple's CDN caches.
3. **The firewall change waits for step 6.** Production must let `/.well-known/` and `/reset-password/app` through the "Website off, API on" rule before links can verify, but there is nothing to serve until the files exist and email delivery is on. I'd add the exact two extra conditions to `docs/deploy.md` section 5 as a step 6 note, and change no remote rule now.
4. **App config.** `app.json` gains `ios.associatedDomains: ["applinks:bestats-app.vercel.app"]` and an Android `intentFilters` entry with `autoVerify: true` for the same four path prefixes on `https://bestats-app.vercel.app`. The host comes from `site_url` in `supabase/config.toml`, the one production origin. `app.config.ts` drops `associatedDomains` for `APP_VARIANT=personal`, because a free Apple team cannot sign that entitlement and the personal build would fail. The simulator build is unaffected.
5. **Incoming links outside the four paths.** `src/app/+native-intent.tsx` rewrites any incoming path that is not one of `APP_LINK_PATHS` (and not the root) to `/`, so a hand typed `bestats://library` or a stale link never lands on a half matched route. Title paths pass through unchanged; the routes under `(tabs)` already match them.
6. **Forgot password on the phone.** A `forgot-password` modal beside `sign-in`, same copy and schema as the web (`forgotPasswordSchema`, core messages). Sign in shows its `Forgot password?` link only while `EXPO_PUBLIC_AUTH_EMAIL_DELIVERY` is `on`, like the web; with it off the screen shows `RECOVERY_UNAVAILABLE_MESSAGE` and no form. It calls `resetPasswordForEmail` with `redirectTo` from a new core helper, `appResetRedirectUrl(siteOrigin)`, which returns `<origin>/reset-password/app` and refuses an origin that is not `http` or `https`. The origin is the origin of `EXPO_PUBLIC_API_BASE_URL`, since the API and the site are one Vercel project. Locally that means the reset only works when that value is `http://localhost:3000` (the simulator), because the local allow list has only `localhost:3000/**`; a LAN IP build would be refused by Supabase. I'd note that in `apps/mobile/AGENTS.md`.
7. **PKCE on the phone.** `src/lib/supabase.ts` sets `flowType: "pkce"`, so the reset code can only be exchanged on the phone that asked (child 0036). Email and password sign in does not change. The code verifier lives in the same encrypted storage as the session.
8. **The reset screen.** `src/app/reset-password/app.tsx` reads `code` from the URL, calls `exchangeCodeForSession` once, then shows the new password form (`resetPasswordSchema`, the web's copy). Saving calls `updateUser({ password })`, then `signOut({ scope: "global" })` through the same path as `signOutLocally()`, then opens sign in with a "Password updated, sign in with the new one" notice from core's messages, matching the web. A missing, used or foreign code shows the web's expired link message with a button to ask for a new link; a failed save shows its error and keeps the form. With email delivery off the screen shows `RECOVERY_UNAVAILABLE_MESSAGE`. Nothing claims success before Supabase answers (AGENTS.md section 11).
9. **The web fallback.** `apps/web/app/(auth)/reset-password/app/page.tsx`, a static page in the existing `AuthPanel`: title "Open the link on your phone", text saying this link only works on the phone where you asked for the reset, opened in the BeStats app, and a "Back to sign in" link. It inherits the group's `noindex`, reads nothing from the request, and prerenders. This is a new screen built from an existing pattern (the off state of `/reset-password`), so this paragraph is its layout approval.

## Expected files

- New: `packages/core/src/links/app-links.ts` and its test; `packages/core/src/auth/app-reset.ts` (or a function in `next-path.ts`) and its test; `scripts/app-links.ts` and a `pnpm app-links` script in the root `package.json`; `apps/web/app/(auth)/reset-password/app/page.tsx` and a test; `apps/mobile/src/app/forgot-password.tsx`, `apps/mobile/src/app/reset-password/app.tsx`, `apps/mobile/src/app/+native-intent.tsx`; mobile tests in `src/__tests__/password-reset.test.tsx` and `src/lib/native-intent.test.ts`.
- Changed: `apps/web/next.config.ts`, `apps/web/proxy.ts`, `apps/web/proxy.test.ts`; `apps/mobile/app.json`, `apps/mobile/app.config.ts`, `apps/mobile/src/app/_layout.tsx` (the two new screens), `apps/mobile/src/app/sign-in.tsx` (the link), `apps/mobile/src/lib/supabase.ts`; possibly `packages/core/src/auth/messages.ts` if a message the phone needs only lives in the web today; `docs/deploy.md` section 5 (the step 6 note); `docs/scope/scope.md` (5e line); `apps/mobile/AGENTS.md` and `apps/web/app/AGENTS.md` are left to `/sync`.

## Requirements

- AC-16: the app declares the four path prefixes and only those; library routes and every other path stay on the web.
- Child 0036: reset is PKCE, asked from the app with `redirectTo` `<site>/reset-password/app`; the web keeps `/auth/callback`; the web serves a fallback at `/reset-password/app`; the files are served as JSON with `.well-known` outside the proxy.
- Forgot password stays hidden while email delivery is off, on both apps.

## Security considerations

- `redirectTo` is built from a validated env origin, never from user input, and its path is fixed, so the reset cannot be pointed elsewhere. Supabase's allow list is the second check.
- PKCE binds the code to the device that asked; a forwarded link cannot be redeemed on another phone, and the web page does not try.
- The reset screen never logs or shows the code; the URL param is read once and dropped from the screen state after the exchange.
- Saving a new password signs out everywhere, like the web.
- No new env var, no secret, no service role; the well known files hold only public IDs. `security-boundary.test.ts` stays green.
- `.well-known` stays out of the proxy so no cookie is set on a CDN cached file.

## Acceptance criteria

1. `app.json` lists `applinks:bestats-app.vercel.app` and an auto verified Android intent filter for exactly `/movies`, `/shows`, `/games` and `/reset-password/app`; the personal variant has no associated domains.
2. `appleAppSiteAssociation("ABCDE12345")` and `assetLinks([...])` return documents with exactly those paths and the app ID `ABCDE12345.com.kris1027.bestats` and package `com.kris1027.bestats`; bad IDs throw.
3. Locally, `/.well-known/assetlinks.json` (after a test run of the script into a temp folder, not committed) would be served as `application/json` with no `Set-Cookie`; with no file the path is a plain 404.
4. `/reset-password/app` on the web renders the fallback page with `noindex`.
5. In the app, `bestats://movies/550` opens the movie, `bestats://shows/1396` the show, `bestats://games/1942` the game, and `bestats://library` lands on Home.
6. With email delivery off, sign in shows no Forgot password link and `bestats://reset-password/app` shows the unavailable notice.
7. With email delivery on locally, Forgot password sends the email (seen in the local mail catcher); following its code into the app (`bestats://reset-password/app?code=...` in the simulator) sets a new password, signs out, and the new password signs in. A bad code shows the expired link message.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test` (core, web and mobile Jest), `pnpm build` (route and config change). No database change, so no `pnpm test:db`.

## Manual test steps

1. Run `pnpm dev:docker` for the local web and Supabase, and Metro with `npx expo start --dev-client` in `apps/mobile` with `EXPO_PUBLIC_API_BASE_URL=http://localhost:3000`.
2. Open `http://localhost:3000/reset-password/app` in a browser: you should see the fallback page.
3. Run `curl -sI http://localhost:3000/.well-known/apple-app-site-association`: a 404 with no `Set-Cookie` (no file yet).
4. In the simulator: `xcrun simctl openurl booted "bestats://movies/550"`, then `bestats://shows/1396`, `bestats://games/1942`, `bestats://library`. Each opens its title; the last lands on Home.
5. With `EXPO_PUBLIC_AUTH_EMAIL_DELIVERY=off`: open Sign in, no Forgot password link; `xcrun simctl openurl booted "bestats://reset-password/app?code=x"` shows the unavailable notice.
6. Set it to `on`, restart Metro, open Forgot password, ask for a reset for a seeded user, open the local mail catcher (Mailpit on port 54324), follow the link in the simulator's Safari, copy the `code` from the final URL and run `xcrun simctl openurl booted "bestats://reset-password/app?code=<code>"`. Set a new password: you're signed out and the new password signs in.
7. Repeat step 6 with the same code: the expired link message shows.

Universal Links and App Links themselves (an https link opening the app) can only be checked after step 6, with the IDs, the committed files, the firewall change and a signed build. That check moves to step 6 in the scope.

## Amendments during the build

Found in the simulator check and fixed in this slice, inside the approved scope:

1. **PKCE was weak on the phone.** Hermes has no `crypto.subtle`, so supabase-js sent a `plain` challenge (and with no `crypto` at all would draw the verifier from `Math.random`). `src/lib/web-crypto.ts` installs `getRandomValues` and a SHA-256 `subtle.digest` from `expo-crypto` (already a dependency, already in the dev build) before the client is created. Checked: `auth.flow_state.code_challenge_method` is now `s256` and the warning is gone.
2. **A reset link opened under the open modals.** With Sign in and Forgot password open, the reset screen was pushed beneath them, and its code exchange made Sign in close the top screen. Now the reset screen is presented as a modal, Sign in closes itself only while it is the focused screen, and a saved reset dismisses every modal before opening Sign in with the notice.
