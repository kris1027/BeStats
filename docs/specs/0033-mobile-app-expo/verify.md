# Verify: Mobile app (iOS and Android) · spec 0033 · updated 2026-11-19
_Steps derived from spec 0033 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Slice 5a: shell, home, lists, search (prompts/mobile-app-shell-catalog.md)

Run against the local stack (`pnpm dev:docker`) with `npx expo start --dev-client` in `apps/mobile`.

## UI / manual
- [ ] Open the app signed out → it lands on Home (Shows) with Trending this week, Popular, On TV today (label and blurb), On the air, Top rated, and the TMDB notice at the bottom → AC-14
- [ ] Switch Home to Movies, then Games → sections and labels change (In cinemas, Upcoming; New releases, Coming soon with date pills from core); Games shows the IGDB notice → AC-14
- [ ] Every card and Top rated row shows its community rating as "TMDB …" or "IGDB …", never a bare number and never a personal score → AC-14
- [ ] Tap See all on each Home section → the list scrolls to its end with no error shown → AC-10 (shares paths with the web)
- [ ] Search tab: type a title → exact count line ("95 shows"); add a genre and 7+ → the partial line "N matches in TMDB results a–b of T for “q”"; compare with the web's `/search` for the same filters → same count wording
- [ ] Open a result from Search and go back → query, filters and results are still there
- [ ] Switch the media type in Search → Home follows; filters reset and the title stays
- [ ] Stop the web server and pull to refresh Home → each section shows "Couldn't load …" with Try again; start it again and tap Try again → the section loads
- [ ] Signed out, open a movie → "Sign in to track"; tap it → Sign in opens as a modal; sign in → back on the same movie with the Watched control
- [ ] Signed out, browse Home, lists and Search → the web log shows no `/api/v1/me` request → AC-13, AGENTS.md section 11
- [ ] Library tab: signed out offers Sign in; signed in shows "Your library pages are on their way" with no rows → AC-10 (rest in slice 5c)
- [ ] Account tab: signed in shows "Signed in as …" and Sign out; after Sign out, Home still shows its lists → AC-13
- [ ] Open a show and a game from Home → read only pages with poster, rating labelled TMDB or IGDB, overview, and the catalog notice; a missing field is left out → AC-14
- [ ] VoiceOver on Home and Search → every card, tab, chip and button reads a label

## Commands
- [ ] `pnpm typecheck` → passes in every package
- [ ] `pnpm lint` → no errors
- [ ] `pnpm test` → core, web and mobile suites pass, including `apps/mobile/src/lib/search-results.test.ts` and `apps/mobile/src/__tests__/catalog-screens.test.tsx`

## Acceptance-criteria coverage
- AC-10: partly (shared list paths and the Library tab placeholder); the library pages come in slice 5c
- AC-13: partly (no private reads signed out; public queries survive sign out); the persisted cache and its wipe come in slice 5d
- AC-14: catalog notice and labelled community ratings on every catalog screen; the About screen comes in slice 5d
- AC-12, AC-16: not in this slice (5d, 5e)
