# Mobile release prep (spec 0033 step 6, the part that needs no store account)

## Goal

Get everything for the store release ready that needs no Apple or Google developer account, so the day the accounts exist the release is a short runbook. That means: EAS Update wired into the app, Expo named as a processor on `/privacy` with `/terms` and `LEGAL_LAST_UPDATED` moving with it (AC-15), the store privacy label answers written down so they match `/privacy` (AC-15), and a release runbook in `docs/deploy.md`. TestFlight, Play internal testing (AC-17), `pnpm app-links` with real IDs and the https link check (AC-16) stay owed until the accounts exist.

## Inspected

- Spec 0033 `index.md` (Requirements, Proposed stack, Build plan step 6, Consequences), scope feature 28 (steps 1 to 5e ticked, step 6 open).
- `apps/mobile/AGENTS.md`, `app.json`, `app.config.ts` (the `personal` variant), `eas.json` (profiles `development`, `development-simulator`, `production`; `submit.production` empty), `package.json` (Expo SDK 58, no `expo-updates`).
- `packages/core/src/legal/operator.ts` (`PROCESSORS`: Supabase, Vercel, TMDB, YouTube; `LEGAL_LAST_UPDATED` 2026-11-21).
- `apps/web/app/privacy/page.tsx` (already has the app paragraph: same server, encrypted sign in, images straight from TMDB and IGDB; self serve deletion already described) and `apps/web/app/terms/page.tsx` (Technical requirements already names the app), their tests, `apps/web/lib/legal/boundary.test.ts`.
- `docs/deploy.md` sections 1 to 11.
- `npx eas-cli whoami`: logged in as `kris1027dev`, the EAS project `@kris1027dev/bestats` exists.

## Skills used

`eas-update` (install with `npx expo install`, configure with `eas update:configure`, never hand write `updates.url` or the runtime policy), `eas-app-stores` (for the runbook), `expo-dev-client`.

## Decisions and assumptions

1. **You have no Apple or Google developer account yet** (your answer). So this run builds only what needs no account; AC-16 and AC-17 stay owed and the step 6 box stays open.
2. **EAS Update goes in now** (your answer): `npx expo install expo-updates`, then `npx eas-cli@latest update:configure` from `apps/mobile`. That command writes `updates.url` and the `runtimeVersion` policy into `app.json` and a channel per build profile into `eas.json`. I review and keep its diff; I don't invent those values. Nothing is published (`eas update` is not run).
3. **A `preview` build profile with channel `preview`** (internal distribution), so a test update can be tried before production, as the skill advises. Small, and costs nothing until you build it.
4. **The personal variant turns updates off** (`updates.enabled: false` in `app.config.ts` when `APP_VARIANT=personal`). It is built with Xcode, not EAS, so it has no channel and could never receive an update; turning it off means it never calls Expo's servers at all.
5. **Expo joins `PROCESSORS`**: name `Expo`, url `https://expo.dev`, purpose "Delivers updates to the BeStats app, which checks for them when it starts and shares your IP address and device details with it." Transfer: Expo is a United States company and the update requests may be served from outside the EEA. I claim no Standard Contractual Clauses for Expo, since I have not read Expo's DPA; the line says only what is true.
6. **`/privacy`**: the app paragraph gains one sentence that the app checks Expo's servers for updates when it starts. **`/terms`**: Technical requirements gains that the app may download updates to itself automatically. `LEGAL_LAST_UPDATED` moves to 2026-11-22.
7. **Store privacy labels live in `docs/store-privacy-labels.md`**: the App Store "App Privacy" and Google Play "Data safety" answers, each traced to a `/privacy` sentence or the code (email and user ID for the account, tracking marks and ratings as user content, all linked to you, used for app functionality only, no tracking, no third party sharing, deletion available in app). You type them into the consoles once the accounts exist.
8. **`docs/deploy.md` gains section 12, Mobile release**: enroll, `eas credentials`, the `EXPO_PUBLIC_*` values in the EAS `production` environment, `eas build --profile production`, `eas submit`, `pnpm app-links` with the Team ID and fingerprint, the firewall rule allowing `/.well-known/` and `/reset-password/app`, the privacy labels, and publishing an update with `eas update --channel production`. Every step there is remote, so it says so.

## Expected files

- `apps/mobile/package.json`, `pnpm-lock.yaml` (`expo-updates`)
- `apps/mobile/app.json` (`updates`, `runtimeVersion`, written by the CLI)
- `apps/mobile/eas.json` (channels, `preview` profile)
- `apps/mobile/app.config.ts` (personal variant drops updates), its test
- `packages/core/src/legal/operator.ts` (Expo, date)
- `apps/web/app/privacy/page.tsx`, `apps/web/app/terms/page.tsx` and their tests
- `docs/store-privacy-labels.md` (new), `docs/deploy.md` (section 12)
- `apps/mobile/AGENTS.md` one line on EAS Update channels (or left for `/sync`)
- scope feature 28 step 6 sub boxes

## Requirements

- AC-15: Expo in `PROCESSORS`; `/privacy` says the app loads images straight from TMDB and IGDB (already true) and describes self serve deletion (already true) and the update check; `/terms` changes with it; `LEGAL_LAST_UPDATED` moves; the store labels match the text.
- The web still builds and every legal test passes.
- No secret reaches `EXPO_PUBLIC_*` or the repo (`security-boundary.test.ts`).

## Security considerations

- `updates.url` and the project ID are public values. No EAS token is written anywhere.
- Nothing is published or built remotely in this run. `update:configure` reads the linked project; if it wants to change remote state, I stop and ask.
- The legal text describes only what the code does: Expo is added in the same PR that adds `expo-updates`.

## Acceptance criteria

1. `expo-updates` installed at the SDK 58 version; `app.json` has `updates.url` and a `runtimeVersion` policy; every EAS build profile has a channel.
2. `APP_VARIANT=personal` config has updates disabled; the default config is exactly `app.json`.
3. `/privacy` lists Expo with its purpose and transfer line; `/terms` mentions automatic app updates; both show 2026-11-22.
4. `docs/store-privacy-labels.md` and `docs/deploy.md` section 12 exist and match `/privacy`.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test` (core, web legal tests, mobile Jest), `pnpm build` (web pages change), `npx expo-doctor` and `npx expo config --type public` in `apps/mobile`.

## Manual test steps

1. Run `pnpm dev:docker`, open `http://localhost:3000/privacy`: Expo is listed under Who processes your data, its transfer line under Transfers outside the EEA, Last updated reads 22 November 2026.
2. Open `/terms`: Technical requirements mentions automatic app updates.
3. In `apps/mobile`, run `npx expo config --type public` and check `updates.url` and `runtimeVersion`; run it again with `APP_VARIANT=personal` and check `updates.enabled` is false.
4. Optional (needs a new development build, since `expo-updates` is native): build the simulator profile and confirm the app still starts.
