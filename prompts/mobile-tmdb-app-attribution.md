# TMDB notice worded for the app

## Goal

The iPhone app shows TMDB's required notice on About and under every TMDB catalog screen, and it currently reads "This website uses TMDB…". Give the app its own wording of the same notice ("This application uses…") while the web keeps "This website…", with the sentence still written in one place.

## Inspected

- `packages/core/src/legal/attribution.ts` and its test: `TMDB_ATTRIBUTION`, the web wording.
- Users: the web footer and `/terms` (stay on the web wording), and in the app `src/components/catalog-notice.tsx` and `src/screens/about-screen.tsx`, plus their tests (`about-screen.test.tsx`, `__tests__/catalog-screens.test.tsx`).
- `apps/web/lib/legal/boundary.test.ts`: the fragment "otherwise approved by TMDB" may appear only in `packages/core/src/legal/attribution.ts` (test files are not scanned).
- TMDB API Terms of Use, section 3 (last updated 20 October 2023, read 2026-11-21). The required notice is a template: "This [website, program, service, application, product] uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB." The TMDB FAQ says the attribution in an app belongs in an "About" or "Credits" type section, which About already covers.

## Skills used

None beyond the repo rules (no schema, route or Supabase change).

## Decisions and assumptions

1. **Noun: "application".** It is one of the terms' own alternatives. "app" is not in the list, so the shorter word isn't used.
2. **One template, two exports.** `attribution.ts` builds both sentences from one private function taking the noun. `TMDB_ATTRIBUTION` stays exactly as it is (web, "website"), and a new `TMDB_APP_ATTRIBUTION` holds the "application" version. The sentence is still written once, so the boundary test passes unchanged.
3. The web is untouched: the footer and `/terms` render the same text, so `LEGAL_LAST_UPDATED` and `/privacy`/`/terms` don't change.
4. Lands on `feat/mobile-offline-about` (PR kris1027/BeStats#89), since About is introduced there. Committed, not pushed, as asked. The PR description's "For reviewers" bullet about the odd wording is replaced by a line saying the app now uses the "application" form.

## Expected files

- `packages/core/src/legal/attribution.ts`: template function, `TMDB_APP_ATTRIBUTION`, JSDoc citing the terms' bracket.
- `packages/core/src/legal/attribution.test.ts`: asserts both exact strings.
- `apps/mobile/src/components/catalog-notice.tsx`, `apps/mobile/src/screens/about-screen.tsx`: use `TMDB_APP_ATTRIBUTION`.
- `apps/mobile/src/screens/about-screen.test.tsx`, `apps/mobile/src/__tests__/catalog-screens.test.tsx`: expect the app wording and check the web wording is absent.
- `packages/core/AGENTS.md`: name `TMDB_APP_ATTRIBUTION` beside `TMDB_ATTRIBUTION`.

## Requirements

- The app shows "This application uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB." on About and in the catalog notice. The web shows the "This website…" sentence exactly as before.
- No second copy of the sentence anywhere in source.

## Security considerations

None: copy only, no data, auth or network change.

## Acceptance criteria

- Both exact strings asserted in core. The mobile tests find the app sentence and not the web one. The web footer and terms tests pass unchanged. The boundary test passes.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`. No `pnpm build`: no route, config or server code changes.

## Manual test

1. With Metro running, open the app on the simulator, go to Account → About and read "This application uses TMDB…" under the TMDB logo.
2. On Home → Shows, scroll to the bottom and read the same sentence in the catalog notice. Games still shows the IGDB credit.
