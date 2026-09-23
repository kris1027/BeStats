# Verify: Movie page · spec 0006 · updated 2026-09-23
_Steps derived from spec 0006 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Run against `pnpm dev` unless a step says build. Use a signed out browser.

## UI / manual
- [x] Open `/movies` → heading "Popular movies", the TMDB popularity line, 20 poster cards each with an amber rating badge; a card with no poster shows the fallback tile → AC-1
- [x] Click any card → lands on `/movies/{that id}` → AC-1
- [x] On `/movies`, only "Next" shows and the text reads "Page 1 of 500" (or TMDB's count if under 500); on `/movies?page=2` both links show, Previous goes to `/movies` → AC-2
- [x] View source on `/movies?page=2`: the HTML holds `<a rel="prev" href="/movies">` and `<a rel="next" href="/movies?page=3">` (real anchors, not script only buttons) → AC-2
- [x] Open `/movies?page=0`, `?page=-2`, `?page=abc`, `?page=2.5`, `?page=501` → "That page doesn't exist" with a link to `/movies`; the dev log shows no TMDB request for them → AC-2
- [x] Open `/movies/550` at 1440px → backdrop fading into black at the bottom and left, poster overlapping its lower edge, `h1` "Fight Club", tagline, "1999 · 2h 19m", Drama and Thriller chips, amber badge + "TMDB" + "N votes", then Overview and Cast headings → AC-3, AC-7
- [x] Runtime text: find a movie under an hour (shows `45m` style) and one exactly on the hour (`2h`) → AC-3 (value source: `formatRuntime(runtimeMinutes)`)
- [x] Open `/movies/1274847` (Radio Bonheur: no poster, no backdrop) → no backdrop area, poster fallback tile at the same 2:3 size, no invented text → AC-4
- [x] Open `/movies/556279` (La Maternelle: no overview in any language) → "No overview available." → AC-4, AC-5
- [x] Open `/movies/427311` (Nouveau Monde) → French overview, its `<p>` has `lang="fr"`, note "Shown in the original language (French)"; "No TMDB rating yet" instead of a badge → AC-5, AC-7 (value sources: `overview`/`overviewLanguage`, `languageName`)
- [x] `/movies/550`: Cast shows exactly 12 cards in billing order (Edward Norton first), no card is a link; Tab to the cast row, the focus ring shows, ArrowRight scrolls it → AC-6 (value source: `cast` sliced to 12)
- [x] No watchlist, watched, rating or other tracking control anywhere on the page → AC-7
- [x] Vote count reads with a comma separator, e.g. `32,899 votes` → AC-7 (value source: `formatVoteCount`)
- [x] Open `/movies/999999999` → "We couldn't find that movie" with a link to `/movies`, tab title "Movie not found · BeStats", `<meta name="robots" content="noindex">` in the HTML → AC-9
- [x] Stop TMDB access (restart dev with `TMDB_READ_ACCESS_TOKEN=bad-token`), open `/movies/551` and `/movies?page=3` → "Couldn't reach TMDB" panel with "Try again" linking to the same URL; navbar still works; tab title "Movie" on the detail page → AC-10, AC-12
- [x] Restore access, click "Try again" on a timeout or rate limit failure → the page loads within seconds (transient failures are cached for `seconds`) → AC-10
- [x] Reproducible transient failure: with the real token, block TMDB at the network (add `0.0.0.0 api.themoviedb.org` to `/etc/hosts`, or turn the network off), open a movie id not yet visited, e.g. `/movies/552` → "Couldn't reach TMDB" (the dev log shows `kind: "upstream"`); remove the hosts line or reconnect, click "Try again" → the movie loads within a minute at most (the `seconds` profile), not after minutes. The bad token in step 21 is `unauthorized`, which keeps `minutes`, so it cannot prove this → AC-10. Verified 2026-09-23 on `/movies/552`, with a Node preload that sent TMDB requests to a closed local port (a real `ECONNREFUSED`, no sudo needed): the panel showed, the log had `kind: "upstream"`, and the movie loaded about 8 seconds after access came back
- [x] Tab titles: `/movies/550` is "Fight Club (1999) · BeStats"; the meta description is the overview cut at a word with `…`, at most 160 characters; `/movies` stays "Movies · BeStats" → AC-12
- [x] At 375px on `/movies` and `/movies/550`: no horizontal page scroll, small poster beside the title, facts below, cast row scrolls inside itself, pagination links are 44px tall → AC-14
- [x] Every backdrop, poster and cast `<img>` on the detail page has `alt=""` → AC-14

## Commands
- [x] `curl -s -o /dev/null -w "%{http_code}" localhost:3000/movies/abc` and `/movies/0123` and `/movies/2147483648` → `404`, with the styled "Page not found" panel → AC-8
- [x] Same with auth env unset (`NEXT_PUBLIC_SUPABASE_URL=` in the dev env) → still `404` → AC-8
- [x] `curl … /movies/999999999` → `200` (soft 404, accepted) → AC-9
- [x] `pnpm build` → route table shows `◐ /movies` and `◐ /movies/[id]`, no TMDB error in the log → AC-11
- [x] `pnpm test` → includes `app/movies/request-scope.test.ts` and `app/layout-purity.test.ts` green → AC-13
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all pass → AC-11, AC-13, AC-14
- [x] Cold cache spot check: with the dev log open, first load of an unseen movie id sends one TMDB request for body plus metadata (record it if two) → build plan task 1. Verified 2026-09-23 on `/movies/680`: one request, `/3/movie/680` with `credits,translations` appended, served both the body and the tab title; a second load sent none. The dev log lines tagged `Cache` are Next replaying the logs of a cached scope, not new requests

## Acceptance-criteria coverage
- AC-1 … UI steps 1, 2 · AC-2 … UI 3, 4, 5 · AC-3 … UI 6, 7 · AC-4 … UI 8, 9 · AC-5 … UI 9, 10 · AC-6 … UI 11 · AC-7 … UI 6, 10, 12, 13 · AC-8 … Commands 1, 2 · AC-9 … UI 14, Commands 3 · AC-10 … UI 15, 16, 17 · AC-11 … Commands 4, 6 · AC-12 … UI 15, 18 · AC-13 … Commands 5 · AC-14 … UI 19, 20
