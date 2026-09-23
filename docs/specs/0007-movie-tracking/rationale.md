# 0007. Movie tracking: rationale

The decision record behind [index.md](index.md). `/develop` builds from `index.md` and can skip this file.

## Context

> ⚠️ Premise note: the scope row puts tracking on the movie page only, and the engineer chose to add the card bookmark to the `/movies` grid in the same feature. That is a reasonable call (the design draws the bookmark on the card, and planning from a grid is the fastest way to build a watchlist), but it changes the nature of the landing page. Until now `/movies` was a purely public, cached page with no request scoped code, guarded by spec 0006's AC-13 and a grep test. It now renders one private Suspense hole per card and makes a Supabase read per render for signed in users. This spec keeps the damage contained (every private read sits in `components/tracking/` inside its own boundary, the TMDB grid stays cached, visitors pay nothing), and amends the test rather than deleting it. The right framing is "the catalog stays public, and private state is a hole punched into it", not "the landing becomes a private page".

BeStats already has the storage for this feature. Spec 0001 built `user_movie_state`, one row per user and movie, with `in_watchlist`, `watched_at` and `rating`, a CHECK on the rating, and Row Level Security that limits every command to the owner. Spec 0005 built the session layer (`getOptionalUser()` verifies claims locally; cookies are HttpOnly, so the browser never talks to Supabase directly). Spec 0006 built the public movie page as a prerendered shell streaming a cached TMDB read, and left an empty slot under the rating block for this feature. What is missing is everything a person actually touches: the controls, the writes, and the rules that connect watched, watchlist and rating.

The product rules are strict and partly in tension with convenience. AGENTS.md section 7 says watched and rating are separate, marking watched needs no rating, and removing watched never silently deletes a rating. The engineer added two couplings on top: rating a movie you have not marked watched counts as watching it, and the first watch takes a movie off the watchlist. Both couplings depend on the row's current value, which is exactly the kind of rule that breaks when two tabs write at once or when a stale tab replays an old intention.

The scope row's done line adds a reliability bar: state must survive a reload and a second session, and a failed write must show an error, not a false success. That bar has to hold for a single click on a phone with a flaky connection, for a session that expired while the page sat open, and for a TMDB outage. It also has to hold without any private value leaking into the shared caches that make the catalog fast, since `cacheComponents` is on and a user specific value in a `use cache` scope would be served to everyone.

There is no reference design for the watched or score controls. `design/` draws only the card bookmark and the Plan and Planned marks, so the rest is proposed here from spec 0004's vocabulary and approved with this spec, as AGENTS.md section 3 requires.

## Options considered

### Option 1: Server Actions with plain upserts, conditional logic in TypeScript

Each action reads the current row, decides in TypeScript whether this is a first watch, and upserts the result. Controls wait for the server before changing (a pending spinner), so there is no optimistic state to reconcile.

**Pros**:
- All business rules live in one language, next to the tests that cover the rest of the app.
- No migration, no SQL to review, no new grants to get right.
- The simplest client code: a control only ever shows confirmed state.

**Cons**:
- Read then write is a race. Two tabs, or a stale tab replaying "mark watched", can clear a bookmark the user just set, which is exactly the rewatch case the engineer wanted to support.
- Every click waits 200 to 400ms for a round trip before anything moves, which feels broken on a phone.
- Two statements per conditional write means either a transaction the Supabase client does not offer, or a half applied write to report.

### Option 2: Server Actions with optimistic controls, and two invoker functions for the conditional writes (chosen)

Three actions take a target value. Planning is a partial upsert, and the three removals (unplan, unwatch, clear rating) are updates that never insert. The two conditional ones (mark watched, rate) call `SECURITY INVOKER` Postgres functions that do the whole thing in one `insert ... on conflict do update` using `coalesce` on the old `watched_at`. Controls use `useOptimistic` over state the server passes down, and each successful action calls `refresh()` so the server state catches up.

**Pros**:
- The coupling rules are atomic and cannot race: Postgres evaluates the old row and writes the new one in one statement.
- Invoker rights keep RLS fully in force; the functions can do nothing the user could not do with a direct upsert.
- Instant feedback, with a settled state that is always the server's, which meets "no false success" by construction.
- Idempotent: every call names the value it wants, so retries, double clicks and queued clicks converge.

**Cons**:
- Rules now live in two places, TypeScript and SQL, and the SQL needs its own pgTAP tests and a careful `revoke` from `anon`.
- `refresh()` costs an extra server render per successful click.
- Optimistic UI is more client code and more states to test than a spinner.

### Option 3: Client writes straight to Supabase through the browser client

The browser holds a Supabase client and upserts directly, with RLS as the only guard.

**Pros**:
- The fastest possible write path, with no Server Action hop.
- Realtime subscriptions would become easy later.

**Cons**:
- It breaks spec 0005: session cookies are HttpOnly and the browser never calls Supabase Auth, so the browser client has no session to write with.
- It skips the server side TMDB check and Zod validation, leaving only database constraints.
- AGENTS.md section 5 asks for mutations through Server Actions or Route Handlers with the user taken from the verified session.

### Option 4: A Route Handler API (`POST /api/movies/{id}/tracking`)

A small REST surface that the controls call with `fetch`.

**Pros**:
- A stable, testable HTTP contract, reusable by a future mobile client.
- Easy to rate limit per route later.

**Cons**:
- The repo's established pattern is Server Actions (spec 0005), so this adds a second mutation style.
- It needs its own CSRF thinking, which Server Actions handle.
- No `refresh()`: keeping other views current would need a separate mechanism.

## Rationale

Option 2 is the only one that makes both coupling rules safe under the conditions this app will actually meet: two open tabs, a phone that retries, and a page left open until its session expired. The engineer chose "first watch clears the bookmark" and "rating implies watched" together with "a watched movie can be planned again". That combination only holds if the database decides "was it unwatched?" at write time; a TypeScript read followed by a write (Option 1) quietly loses the rewatch bookmark in exactly the stale tab case. Two ten line SQL functions with invoker rights are a small price for that, and they add no privilege: RLS, the grants and the owner check from spec 0001 apply unchanged.

The optimistic client follows from the scope row's "failed writes show an error, not a false success". A spinner is honest but slow; an optimistic flip is fast but can lie. Deriving the optimistic state from a server prop, and letting `refresh()` deliver the new prop, gives both: the flip is immediate, and when the transition settles the control can only show what the server returned. A failure simply ends the transition with the old prop still in place, plus a toast. Sonner was chosen for the toast because the card bookmark has no room for an inline message and one pattern for page and card is easier to keep consistent; it is the shadcn standard and features 12 and 14 will need the same thing.

Options 3 and 4 were ruled out by existing decisions rather than on their own merits. The HttpOnly cookie model from spec 0005 makes browser writes impossible without undoing a deliberate security choice, and a Route Handler would introduce a second mutation style next to the Server Actions every auth surface already uses.

**Smaller calls made in this spec** (each with its runner up):

- **The TMDB check runs on every write that can create state** (engineer's pick, narrowed after the cross check). It is a cached read, and it stops rows being created for made up or adult ids sent straight to the action. Removals skip it, so a movie TMDB later delists, or an outage, never traps a row the user cannot clear. Runner up: shape check only, which never blocks on TMDB but lets garbage ids reach feature 9's lists.
- **Removals are updates, and empty rows are kept.** An update never inserts, so removing from an untracked movie creates nothing. Deleting a row once all three facts are empty would turn one statement into read, decide, then delete, which reopens the race Option 2 exists to close. Runner up: delete through a third function, deferred until table size ever matters.
- **Actions return only `{ ok }`.** The controls converge on the server prop that `refresh()` sends back in the same response, so a returned row would be a second source of truth nobody reads. Runner up: returning the row and using it as the settled state, which duplicates what `refresh()` already delivers.
- **One optimistic reducer mirrors the SQL.** `applyTrackingIntent` makes the linked fields (watched, bookmark) move on the same click the database will move them, and is tested against the same cases as the pgTAP file, so the two copies of the rule cannot drift unnoticed.
- **`42501` is a bug, not an expired session.** It means a missing grant or a policy refusal; mapping it to `session_expired` would send users to sign in over a deploy mistake. Expired tokens surface as `PGRST301`/`PGRST303` or a null user.
- **The picker is a hand built radio group.** Base UI's `RadioGroup` selects on arrow keys, which here would save a rating on every key press. Runner up: accept selection on arrows, which turns browsing the scale into a stream of writes.
- **Grid read batched with React `cache()`.** Each card is its own Suspense hole, but all of them call one per request memoised read keyed by the page's sorted id list, so the grid makes one query. Runner up: one server component wrapping the whole grid, which would force the TMDB grid to wait on Supabase.
- **`fallback={null}` for both holes** (engineer's pick). Visitors never see a skeleton that then vanishes; signed in users accept one small shift. Runner up: a reserved skeleton row that shows for everyone.
- **The `next` path comes from a server prop**, not `usePathname()`, because the server already knows the exact path and `useSearchParams()` would add a client boundary constraint under `cacheComponents`. Runner up: reading it on the client.
- **The rating picker is a Popover on every width** (engineer's pick): two rows of five 44px targets fit at 375px. Runner up: a bottom sheet on mobile, which doubles the code paths.
- **Rapid clicks queue** (engineer's pick). Next.js runs a client's Server Actions one after another, and target values make the last click win. Runner up: disabling the control mid write, which drops taps.
- **No app level rate limit** (engineer's pick). A caller can only ever write their own rows, one primary key upsert at a time, under Supabase's platform limits. Runner up: a per user counter table, a new moving part for no measured problem.
- **Logs carry no ids** (engineer's pick). A movie id plus a timestamp is viewing history, which AGENTS.md section 11 asks us not to log. Runner up: logging the user id, easier to debug but a privacy cost.
- **`refresh()` after success** rather than nothing. Next.js reuses pages on browser Back, so without it the grid could show a stale bookmark after planning from the movie page. Runner up: no refresh, relying on reload.
