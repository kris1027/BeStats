# 0014. Up Next: rationale

Decision record for [index.md](index.md). `/develop` builds from the index; this file explains why.

## Context

`AGENTS.md` section 1 promises "a private Up Next view for tracked TV shows", and section 9 pins its rule: for each show with Watching status, the first unwatched eligible episode in season and episode order; "You're up to date" when every eligible episode is watched; On Hold and Dropped shows excluded until resumed. Spec 0013 already built the pieces: `showProgress(...).next` is the rule, `getWatchedEpisodeIds` reads the watched set, and the watchlist's Next episode pill renders it.

The navbar artboards draw a third library link, "Upcoming", between Watchlist and Watched, and `/upcoming` has been a private path since spec 0005. The only artboard for that page (`design/desktop-upcoming-page.svg`, `design/mobile-upcoming-page.svg`) is titled "Upcoming movies": planned movies with a calendar release date pill and the Planned bookmark, and no TV at all. The design and the product spec therefore describe different contents for the same link. `AGENTS.md` section 3 makes the designs the source of truth for layout, and section 1 makes Up Next a requirement, so neither can simply win.

Forces: BeStats stores no catalog metadata (spec 0008), so anything filtered or ordered by a TMDB value (a release date, an air date) has to fetch that value from the cached TMDB reads at view time. Postgres can order only by what it holds: statuses, watched times, plan times. Every Watching show needs its full episode list to find the next episode, which is a fan out of TMDB reads on a cold cache. Private rows must never enter a shared cache. The route must stay partially prerendered under `cacheComponents`.

Without a decision, the Upcoming link stays hidden (as `LibraryNav` does today), and the MVP misses a section 1 feature and acceptance item 9 of section 13.

## Options considered

### Option 1: One page, two sections; view ordered Up Next; Coming soon filtered from cached summaries (chosen)

`/upcoming` holds Up Next (Watching shows, most recently active first, next episode pill and a Mark watched button) and Coming soon (the artboard's planned unreleased movies). A `security_invoker` view gives each Watching show its last activity time; a pure rule over `showProgress` gives each card its state; Coming soon checks the latest 200 planned movies against cached TMDB summaries.

**Pros**:
- Honors both the artboard and `AGENTS.md` behind the one link the design draws.
- Order and membership are one indexed Postgres read; the rule stays in one pure function.
- Stores nothing new, so nothing goes stale.

**Cons**:
- Two different kinds of content on one page, with section headings the artboard does not draw.
- Cold cache cost: one episode list per Watching show and up to 200 movie summaries.
- The 200 ceiling can miss an old plan (disclosed on the page).

### Option 2: `/upcoming` is TV Up Next only

The artboard's layout with next episode pills instead of dates; unreleased movies deferred.

**Pros**:
- Smallest build; one kind of card.
- Exactly the scope row as written.

**Cons**:
- The only artboard for the page draws movies; the page would not match its reference.
- Upcoming movies need a later feature and a second design pass.

### Option 3: Two pages

`/upcoming` exactly as drawn (movies), and Up Next on its own route with a fourth nav link.

**Pros**:
- Each page is simple and matches its purpose.

**Cons**:
- A fourth nav link that no artboard draws, crowding the glass pill and the mobile sheet.
- Up Next, the section 1 feature, becomes the page with no design reference.

### Option 4: Store release and air dates in Postgres

Keep each planned movie's release date and each show's next air date on the user rows, so Postgres filters, orders and pages everything.

**Pros**:
- Exact counts and pagination for Coming soon at any size; no fan out.

**Cons**:
- Reopens the no catalog cache decision (spec 0008) and needs a refresh policy; stale dates would silently misplace titles.
- More migrations and a background refresh job for an MVP with small lists.

## Rationale

Option 1 is the only one that satisfies both sources of truth without inventing a nav link: the Upcoming link opens the page the artboard draws, and the section 1 Up Next lives on it, first, because it is the active queue. Option 2 would ship a page that does not match its only reference, and Option 3 would add navigation the designs never drew. Option 4 solves a scale problem nobody has measured, at the cost of the one data rule (TMDB is never copied) the whole app is built on.

Within Option 1, the smaller calls:

- **A view for the order**, not an RPC or a TypeScript merge. PostgREST cannot group, so a TypeScript merge would pull every watched episode row; an RPC works but adds grants and a types entry for a plain read. The view follows spec 0013's `user_watchlist_entries` pattern, and `security_invoker` keeps RLS as the only boundary.
- **Activity time is the later of the last regular episode watched and `status_changed_at`.** A show set to Watching by hand rises to the top, as a just started show should; specials stay out because section 9 excludes them from Up Next.
- **All Watching shows, no pagination.** Active queues are small, and two independent pagers on one URL is awkward. The cost is a long page for an unusual user, recorded as a tradeoff with a follow up to measure.
- **Mark watched on the card, with a server refresh rather than an optimistic advance.** The following episode needs the episode list, which lives on the server; sending it to the browser for every card costs more than a refresh. `newly_marked` exists so an Undo can never clear a mark another tab made (runner up: always offer Undo, accepting that rare case).
- **`newly_marked` is `watched_at = now()`, not the `prior` CTE.** The cross check showed the CTE reads the statement's starting snapshot, so two racing tabs could both report a new mark; comparing the kept `watched_at` with the transaction's own start time cannot.
- **A visible "You're up to date" caption** on caught up cards, beside the date pill, because `AGENTS.md` section 9 says the state *displays* those words; the pill alone would have hidden them behind the date.
- **New card components instead of extending `LibraryCard`.** The library card and grid are built around a card that leaves the page; Up Next cards stay and reorder, so bending the shared card would complicate both pages.
- **Unavailable pill with Retry, where the watchlist shows nothing.** On the watchlist the pill is extra; on Up Next it is the point of the card, so silence would read as a bug.
- **Release date strictly after today in UTC**, the same `airStatus` rule episodes use (spec 0011), so a movie and an episode dated the same day behave the same way. Undated movies stay only on the watchlist; showing "TBA" would add a pill state no artboard draws.
- **Checking the latest 200 planned movies** keeps a cold view bounded while covering almost every real watchlist, and the page states the limit instead of implying completeness (`AGENTS.md` section 10 asks for truthful counts). Runner up: the latest 60, cheaper but more likely to miss a film.
- **`formatShortDate`** reproduces the artboard's two formats (`Dec 25`, `Feb 3, 2027`) with the year dropped only in today's UTC year, so the printed day never shifts with the server timezone.
- **The title link's 44px target is its stretched hit area** (added 2026-09-28, from the proof pass). The `<a>` box is one line of caption text, about 20px, so measuring the element fails AC-16, yet a tap anywhere on the card lands on the link's `absolute inset-0` overlay. WCAG's target size criteria (2.5.5, where 44px comes from, and 2.5.8) define the target as the area that responds to the pointer, so AC-16 now names that area and `verify.md` measures it with `elementFromPoint`. Runner up: `min-h-11` on the caption link in `PosterCard`, which grows every card in every grid by about 24px and drifts from the artboards to fix a measurement, not a tap. Scoping that to Upcoming cards only was rejected too, since it would make them differ in height from the watchlist cards for no user benefit.

The engineer chose every ASK dimension above; the recommended pick was taken each time.
