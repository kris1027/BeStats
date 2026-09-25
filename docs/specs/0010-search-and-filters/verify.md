# Verify: Search and filters · spec 0010 · updated 2026-09-24

_These steps come from the acceptance criteria in spec 0010. `/check verify` runs them, and `/test` locks in the ones that should last. Run the app with `pnpm dev:docker` so the movie bookmark can read the local Supabase stack._

## UI / manual

- [x] On `/shows` at 1440px, the navbar shows the glass field `Search shows` between the tabs and the account controls. On `/movies` and `/movies/550` it reads `Search movies`, on `/watchlist` it reads `Search shows`, and on `/search?type=movie` it reads `Search movies` → AC-1
- [x] Type `d` and wait: nothing is sent. Type `une`: after about 250 ms the panel shows `RESULTS`, up to 5 rows (poster, title, year, amber star with one decimal) in TMDB order, then `95 shows` (the live value) and `See all` → AC-2, AC-3
- [x] Type `zzqqxxyy`: the panel says `No shows match “zzqqxxyy”`, with no count and no See all → AC-3
- [x] Type `du`, then `ne` quickly: the `du` rows never show after the `dune` rows → AC-2
- [x] Press ArrowDown twice: the second row is highlighted and the combobox's `aria-activedescendant` points at it. Press Enter: it opens `/shows/{id}` and the field is empty → AC-4, AC-17
- [x] Type `dune` and press Enter with no row active: it opens `/search?type=tv&q=dune` → AC-4
- [x] Press Escape once: the panel closes and `dune` stays. Press it again: the field clears. Click outside an open panel: it closes. The × clears the field and closes the panel. `ESC` shows beside the × on desktop → AC-4
- [x] In DevTools, set the network to offline (or block `/api/search`) and type: while it waits, 5 skeleton rows show (a later keystroke dims the previous rows instead). On failure the panel shows `Couldn't reach TMDB` with `Try again`, no rows, and See all still there. Go back online and click Try again: the rows load → AC-5
- [x] At 375px, the navbar shows a round `Search` icon. Tap it: a full screen overlay opens with the field focused. Typing shows the same panel. Escape or the close button closes it and focus goes back to the icon. Choosing a result or See all closes it and navigates. There is no horizontal scroll → AC-6
- [x] `/search` shows the heading `Search`, the title field, `SHOWS | MOVIES`, Genres, `Any year` (next year down to 1900) and `Any TMDB rating` (`5+` to `9+`). Choosing `7+` shows `Only titles with at least 100 TMDB votes` and `Clear filters` → AC-8
- [x] Against `pnpm build && pnpm start`, block every `/_next/static/**/*.js` request (DevTools request blocking, or a Playwright route that aborts them) so the page never hydrates. JavaScript itself stays on, because the inline scripts that reveal streamed content must run. `/search?type=tv` shows the filter bar, an `Apply` button and the results. Setting the year to 2020 and pressing Apply loads `/search?q=&type=tv&year=2020&rating=`, and every card is from 2020. Unblock and reload: Apply is hidden. JavaScript turned off entirely is out of scope (AC-9) → AC-9
- [x] Still with the bundles blocked: open `/search?type=tv&genre=18`, set the year and press Apply. The URL keeps `genre=18` and the results stay Drama. The Genres button does not open (expected before hydration) → AC-9
- [x] Still with the bundles blocked: open `/search?type=tv&genre=10766`, choose MOVIES and press Apply. The page shows `That filter isn't valid` naming `genre`, with `Clear filters` (the accepted behavior before hydration, not AC-24's `Removed:` note) → AC-9, AC-18
- [x] With JavaScript on, change the rating: the URL is replaced (the length of `history` does not grow), `page` is dropped, the results show their skeleton while `Updating results` shows beside the controls. Type a title: it applies after about 400 ms, or at once on Enter → AC-9, AC-21
- [x] `/search?type=tv` (nothing set) shows `Popular shows on TMDB`, a poster grid and `Page 1 of 500` → AC-11
- [x] `/search?type=tv&genre=18&genre=35` shows discover results, where every card is both Drama and Comedy on its page, a count like `1,234 shows`, and numbered pages → AC-10, AC-12
- [x] `/search?type=tv&q=dune` shows `95 shows` and numbered pages. `/search?type=tv&q=the` shows `10,000+ shows`. `/search?type=movie` with only a year shows an exact count, or `20,000+ movies` at the cap → AC-3, AC-12
- [x] `/search?type=movie&q=dune&genre=878&rating=7` shows only science fiction movies rated 7 or more, the line `N matches in TMDB results 1–100 of 1,112 for “dune”`, and `More results` pointing at `page=6`. There are no page numbers → AC-13, AC-14
- [x] Follow `More results`: the range moves on (`101–200` and later), `Back to first page` appears, and no card from page 1 repeats → AC-14
- [x] `/search?type=movie&q=dune&genre=10402&rating=9` shows `No matches in TMDB results 1–100` with `More results`, not "no results" → AC-15
- [x] `/search?type=tv&q=zzqqxxyy` shows `No shows match “zzqqxxyy”` with `Clear filters`. `/search?type=tv&genre=10766&year=1901` shows `No shows match these filters` → AC-15
- [x] Movie results carry the bookmark (signed in as `user-a@example.test`, it saves to the watchlist). TV results carry no control. Each card shows the year under the title when TMDB has one → AC-16
- [x] Open a result from a `More results` page, then press Back: the same URL, filters, results and cursor page come back → AC-17
- [x] `/search?rating=7.5`, `/search?genre=999999`, `/search?type=anime`, `/search?q=` followed by 101 characters, `/search?page=0` and `/search?year=1899&year=1900` each show `That filter isn't valid`, naming the parameter, with `Clear filters` → AC-18
- [x] `/search?type=tv&q=dune&page=40` and `/search?type=tv&q=dune&genre=18&page=40` show `That page doesn't exist` with a link to page 1 → AC-18
- [x] With TMDB unreachable (for example, an invalid `TMDB_READ_ACCESS_TOKEN` or no network), `/search?type=tv&q=dune` shows `Couldn't reach TMDB` with `Try again`, while the heading, filter bar and navbar still work. If only the genre list fails, the Genres control is disabled with `Genres unavailable` → AC-19
- [x] On `/search?type=tv&genre=18&genre=10766`, switch to MOVIES: the URL becomes `/search?type=movie&genre=18` and `Removed: Soap` shows until the next change → AC-24
- [x] The page title is `“dune” · Search · BeStats` with a query and `Search · BeStats` without, and the HTML carries `<meta name="robots" content="noindex, follow">` → AC-22

## Commands

- [x] `curl -s -D - "http://localhost:3000/api/search?type=tv&q=dune"` → 200, `cache-control: public, s-maxage=300, stale-while-revalidate=600`, at most 5 results, each `{ id, title, year, posterUrl, tmdbRating, href }`, and no `set-cookie` → AC-20
- [x] Repeat that with `-H "Cookie: sb-127-auth-token=anything"` → the same body, and still no `set-cookie` → AC-20
- [x] `curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/api/search?type=tv&q=a"` → `400`, with `{"error":"invalid"}` and `cache-control: no-store` → AC-20
- [x] `pnpm build` → `/search` is marked `◐` (partial prerender) and `/api/search` is `ƒ` → AC-21
- [x] `pnpm test` → the `lib/search`, `app/api/search`, `components/search`, purity and request scope suites pass → AC-3, AC-7, AC-10, AC-13, AC-18, AC-20, AC-22, AC-23
- [x] `pnpm tmdb:live` → passes, including `/search/movie` ignoring `with_genres` and the 10,000 and 20,001 caps → AC-3, AC-23

## Value sourcing

- [x] Navbar type: check `/movies/550` (movie), `/account` (tv), and `/search?type=movie` (movie), in line with the table
- [x] Quick search rows: each poster URL in the `/api/search` body uses `/w92/`, and each year matches the title's release year (movie) or first air year (show)
- [x] Quick search count: compare `totalResults` from `/api/search` with the footer text for a query below the cap and one at the cap (`the`)
- [x] Genre options: the movie list (Action, Adventure and so on) shows under MOVIES and the TV list (Action & Adventure, Soap and so on) under SHOWS
- [x] Year bound: the year list starts at next year (2027 in 2026), because it is read at request time, not at build time
- [x] Mode: vary only `q`, `genre`, `rating` and `year` and check the four modes (browse, discover, search, filtered search) in the state transitions table
- [x] Browse and discover totals: the `Page N of M` value never goes above 500
- [x] Filtered search range: on `page=6`, the range starts at 101, and `toIndex` never goes above TMDB's total
- [x] Filtering fields: a title with no TMDB rating never appears under any rating filter
- [x] Bookmark `returnPath`: let the session expire, then bookmark from `/search?...`. The toast's Sign in link comes back to the same canonical search URL
- [x] Removed note: it lives only on the page. A reload of the new URL does not show it
- [x] Page title: `q` is taken from the URL, trimmed

## Acceptance-criteria coverage

- AC-1: navbar placement and type · AC-2: quick panel, race · AC-3: counts and caps · AC-4: keyboard combobox · AC-5: loading and failure · AC-6: mobile overlay · AC-7: URL parameters (unit tests) · AC-8: filter bar · AC-9: GET form and instant apply · AC-10: all genres · AC-11: browse · AC-12: discover and plain search · AC-13: filtered scan · AC-14: partial count and cursor · AC-15: empty states · AC-16: cards and bookmark · AC-17: Back navigation · AC-18: invalid and missing pages · AC-19: TMDB failures · AC-20: Route Handler · AC-21: prerendered shell and skeletons · AC-22: metadata and purity · AC-23: module changes and live check · AC-24: type switch
