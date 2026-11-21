# Personal iPhone Release build

## Goal

Run BeStats on the owner's iPhone anywhere (Wi‑Fi or mobile data) with no Mac running: a Release build with its JavaScript inside the app, talking to production (`https://bestats-app.vercel.app` for `/api/v1`, the cloud Supabase project for sign in), installed over the cable with Xcode and a free Apple ID. Personal use only; the store release stays spec 0033 step 6.

## Inspected

- `apps/mobile/AGENTS.md`, `app.json` (bundle ID `com.kris1027.bestats`, plugins, `version` read by `api.ts`), `eas.json`, `src/lib/env.ts` (the four `EXPO_PUBLIC_*` values), `src/lib/api.ts` (`X-BeStats-App-Version` header).
- `docs/deploy.md`: production origin `https://bestats-app.vercel.app`, Supabase project `kyatxtclyikcmkebjxan`, production sends no email.
- Production check (2026-11-21): `GET /api/v1/lists/tv/trending` with the app header answers 200 with results.
- `supabase migration list --linked`: all 29 migrations are on the cloud project, so tracking works there.
- Mac: Xcode 27.2, `apps/mobile/ios/` exists and is gitignored (CNG), entitlements are empty (nothing a free team cannot sign), **0 code signing identities**, no iPhone connected.
- `apps/web/security-boundary.test.ts`: forbids secrets under `EXPO_PUBLIC_`; reading a non-secret `APP_VARIANT` in an app config is allowed.

## Skills used

`expo-dev-client` (local builds), Expo SDK 58 docs for `expo run:ios` and environment variable loading.

## Decisions and assumptions

1. **Separate bundle ID for the personal build: `com.kris1027.bestats.personal`, app name "BeStats Personal".** AGENTS.md says `com.kris1027.bestats` can never change after the first store upload. If a free personal team registers that ID, Apple can refuse it later for the paid team ("not available"). A separate ID keeps the real one clean and lets both apps live on the phone. Done with a small `apps/mobile/app.config.ts` that starts from `app.json` and swaps the ID and name only when `APP_VARIANT=personal`. Without the variable, nothing changes for the simulator, EAS or tests.
2. **Production values go in `apps/mobile/.env.production.local`** (gitignored by `.env*.local`). Expo loads it only when bundling for production, so Release builds get production values and `expo start` keeps the LAN values from `.env.development.local`. Values, all public: `EXPO_PUBLIC_API_BASE_URL=https://bestats-app.vercel.app`, `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` copied from the cloud values in `apps/web/.env.local`, `EXPO_PUBLIC_AUTH_EMAIL_DELIVERY=off` (production sends no email).
3. You sign in with your **production account**, not a local seed user. Data you track is real production data.
4. Free signing limits (Apple's): the app stops opening 7 days after install, at most 3 such apps per device, 10 new App IDs per week. Reinstalling is the same one command with the cable; your data lives on the server, so nothing is lost.
5. No EAS, no paid account, no store submission, no `PROCESSORS` or legal change (nothing new processes data; the app already talks to production services the web uses).

## Expected files

- New, committed: `apps/mobile/app.config.ts`.
- New, gitignored: `apps/mobile/.env.production.local`.
- Regenerated, gitignored: `apps/mobile/ios/` (`expo prebuild --clean`, since the bundle ID changes).
- Edited: `apps/mobile/AGENTS.md` (one line under Building: how to make the personal build).

## Requirements

- Release build bundles JS (no Metro needed) and reads `/api/v1` from production.
- Simulator dev build and `pnpm test`, `pnpm typecheck` unchanged when `APP_VARIANT` is unset.
- No secret enters the app: only the four public `EXPO_PUBLIC_*` values.

## Security considerations

- Only public values (publishable key, URLs) go into the bundle; `security-boundary.test.ts` still passes.
- The phone talks to production over HTTPS; no LAN HTTP in the Release build.
- No Apple ID password passes through me: you add your account in Xcode yourself.

## Your steps (I can't do these)

1. Xcode, Settings, Accounts, **+**, sign in with your Apple ID. Then select the "Personal Team", **Manage Certificates**, **+**, **Apple Development**.
2. Plug the iPhone in with a cable, unlock it, tap **Trust This Computer**.
3. On the iPhone: Settings, Privacy & Security, **Developer Mode** on (it restarts).
4. After the first install: Settings, General, VPN & Device Management, your Apple ID, **Trust**.

## My steps

1. Add `app.config.ts`; run `pnpm typecheck`, `pnpm lint`, mobile `pnpm test`.
2. Write `.env.production.local`.
3. `APP_VARIANT=personal npx expo prebuild --clean -p ios`.
4. `APP_VARIANT=personal npx expo run:ios --configuration Release --device "<your iPhone>"`, picking your Personal Team when asked.
5. Check the built bundle holds `https://bestats-app.vercel.app` and no `192.168.` or `localhost:3000` API value.
6. Add the AGENTS.md line; commit on `feat/mobile-personal-build`, PR per the usual labels.

## Acceptance criteria

- "BeStats Personal" is on the iPhone next to Expo Go and opens with Wi‑Fi off.
- Home, Search and a title page load on mobile data.
- Sign in with your production account works; marking a movie watched shows on `https://bestats-app.vercel.app` too.
- With `APP_VARIANT` unset, `npx expo config --type public` still shows `com.kris1027.bestats`.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test` (repo root). No `pnpm build` or `test:db`: no web or database change.

## Manual test steps

1. Turn Wi‑Fi off on the phone, open BeStats Personal: Home shows posters.
2. Search a title, open it: details load.
3. Account tab, sign in with your production account.
4. Mark a movie watched; open it on the website: same state.
5. Close the app and quit Expo on the Mac; reopen the app: still works.
