# 0023. IGDB integration module: rationale

The decision record behind [index.md](index.md). `/develop` builds from `index.md` and can skip this file.

## Context

BeStats is adding games as a third media type ([games.md](../../scope/games.md)), with IGDB as the catalog. Every later games feature (the game page, status and rating, the library tabs, home rows, search, cards, launch) needs game metadata, and none of them should decide on its own how to authenticate, how fast to call IGDB, or what to do when IGDB is slow or wrong (basis: your AGENTS.md section 5, a server only integration module per provider).

IGDB differs from TMDB in ways that matter. Access needs a Twitch app token from a client id and secret, and that token expires (about 58 days in Twitch's example). Requests are `POST`s with a query language body, so visitor search text ends up inside a query string, an injection risk TMDB's URL parameters never had. IGDB enforces a low request rate, and the per query maximum is 500 records. IGDB also returns an empty list rather than a 404 for a missing id, and holds many records the product hides (DLC, bundles, editions, the Erotic theme).

The project already has a working answer for most of the general problem: spec 0002's TMDB module, with its read pairs, plain results across the `use cache` boundary, explicit lifetimes and its fixture plus live test split (basis: spec 0002, lib/tmdb/AGENTS.md). The forces are: keep the shipped TMDB code stable, keep secrets server only (basis: AGENTS.md section 11), stay inside IGDB's limits on a serverless host with many instances, and never show invented data.

Not deciding this would leave G3 to make it up under pressure, and each later feature would copy whatever G3 did.

## Options considered

### Option 1: Separate `lib/igdb/` mirroring `lib/tmdb/`, in memory token, in process limiter (chosen)

A new module with the same file layout and conventions as TMDB, plus `token.ts`, `limiter.ts` and `query.ts`.

**Pros**:
- Zero risk to the shipped TMDB module; every convention is already proven and documented.
- No new infrastructure or provider.
- The token never touches a shared store.

**Cons**:
- Duplicates result, retry and logging code.
- The rate limit is per instance, not global.

### Option 2: Extract a shared catalog client, then build IGDB on it

Move result, failure profile, retry, concurrency and logging into a common module used by both providers.

**Pros**:
- One retry and failure rule for both providers.
- Less code overall.

**Cons**:
- Reopens a tested module in a games PR, so a games bug can break movies.
- IGDB's POST bodies, token refresh and limiter don't fit TMDB's GET plus static bearer shape, so the shared core grows options to serve both.

### Option 3: Option 1 with a distributed limiter and shared token store

Same module, but the token and a request counter live in a shared store (Upstash Redis or Vercel Runtime Cache), giving a true fleet wide limit and one token.

**Pros**:
- A real global 4 a second cap and one token across instances.

**Cons**:
- A new provider and a network hop on every read, for a hobby scale app whose catalog reads are mostly cached.
- The token secret sits in a third party store.
- One more thing to break at 2am, and its outage would take games down with it.

### Option 4: Use an IGDB client library from npm

Wrap a community IGDB SDK instead of writing the client.

**Pros**:
- Less hand written query building.

**Cons**:
- Community clients are small and unevenly maintained, and none follows this repo's cache boundary, failure and logging rules, so the wrapper would be about as large as the client.
- A new dependency that sees the secret.

## Rationale

Option 1 wins because the shape of the problem is already solved in this repo. Spec 0002's conventions came from real bugs (the cache boundary losing error classes, the failure profile making Retry actually retry), and copying them is cheaper and safer than generalizing them (basis: spec 0002, lib/tmdb/AGENTS.md). Duplication of a few small files is the price for not touching movie and TV code in a games change. Option 2 is worth doing only once a third provider appears and the shared shape is obvious.

Option 3 solves a problem not yet measured. Library and catalog reads are cached for hours, so real IGDB traffic is far below the limit, and 429 retries cover bursts. The in process limiter plus retry is the same accepted gap TMDB carries (basis: premature optimisation, profile first). The follow up in index.md names the signal that would change this.

**Smaller calls made with the engineer** (each the recommended pick):
- **Read surface**: the core set (detail, batch, search, discover, two reference lists) so G6 and G7 build on reads instead of reopening the client; G6's popularity row and G9's extras stay with their features.
- **Hidden games by id**: returned with `hidden: true`, the same pattern as `movie.adult` (basis: lib/tmdb/AGENTS.md, a detail read does not exclude adult titles). A game IGDB later reclassifies stays visible and removable in a user's list instead of looking deleted.
- **Editions hidden**: `version_parent = null` joins the settled filter, so search shows one entry per game.
- **Rating field**: `rating` (IGDB users), matching the settled "community rating" label honestly. `total_rating` blends critic scores.
- **Detail width**: hero plus summary now; G9 extends the type.
- **Batch cache**: the whole batch keyed by sorted ids. Per game caching would need a cache you can peek into, which `use cache` is not.
- **Token**: in process memory with refresh on expiry or 401. A `use cache` entry would write a bearer secret into the cache backend.
- **Lifetimes**: hours, hours, minutes, max, so a release date change unlocks Playing and Finished within hours.
- **Missing variables**: fail loudly on first read, build still passes, the same as TMDB.

**Calls made in writing the spec** (pick, why, runner up):
- **Limiter: 4 open slots plus 250 ms between starts**: IGDB is commonly described as 4 requests a second with 8 open, but a Twitch forum thread describes 4 concurrent. This single mechanism satisfies either reading. Runner up: 8 open, if the docs confirm it in step 3.
- **Page size 20, pages 1 to 50**: matches the existing grids; 50 pages bounds the offset without relying on an undocumented IGDB maximum. Runner up: 500 pages like TMDB, rejected because IGDB's offset limit is unknown.
- **Search text 1 to 100 characters, escaped**: a quote in user text must never close the `search` string (basis: input validation at the trust boundary, AGENTS.md section 11). Runner up: strip quotes, rejected because it changes what the visitor searched for.
- **Counts from the response header or `null`**: never a second request just for a count, and never an invented total (basis: AGENTS.md section 10, truthful counts). Runner up: IGDB's count endpoint, an extra request per search page.
- **Absent `game_type` does not hide**: older records may lack it, and hiding them would drop real games; the live check reports how common this is. Runner up: hide unknown types.
- **Token refresh margin 10 minutes**: far inside a weeks long token, avoids a request racing expiry.
- **Live checks get separate configs**: `vitest.live.mts` matches every `*.live.ts` and is named `tmdb-live`, so it is narrowed to `lib/tmdb` and IGDB gets `vitest.igdb-live.mts`. Runner up: one config with a folder argument per script, rejected because reports would carry the wrong name.
- **Bounded waits** (added after the cross check): the attempt timer starts only after a limiter slot is held, a slot wait is capped at 5 s, `Retry-After` at 10 s, and a whole read at 20 s, so a busy limiter or a slow Twitch never stalls a render without limit.
- **Filter parity** (added after the cross check): a query clause like `game_type = (…)` silently drops records with no value, while the `hidden` rule kept them. The query form now lets missing values through, and a parity test holds the two forms together.
- **Missing credentials as an `IgdbError`**: `toFailure` rethrows anything that is not an `IgdbError`, so a plain env error would crash the page instead of showing its error state.

## References

**Project sources**:
- `AGENTS.md` sections 5, 10, 11, 12 and the cache components repo fact
- Spec 0002 ([index](../0002-tmdb-integration-module/index.md)) and `lib/tmdb/AGENTS.md`
- [games.md](../../scope/games.md), settled decisions of 2026-10-17
- `security-boundary.test.ts`, `vitest.live.mts`
- `next-cache-components-adoption` skill

**Practices & standards**:
- OAuth 2.0 client credentials grant
- Input escaping at the trust boundary (query injection)
- Premature optimisation: measure before adding shared infrastructure
- Single flight for a shared expiring credential

**Links** (web verified):
- Twitch, Getting OAuth access tokens (client credentials flow, `expires_in`): https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/
- IGDB API documentation: not verified (the site refused automated reads on 2026-10-17); cite by name and confirm in a browser during build step 3

### IGDB facts and how sure they are

Checked on 2026-10-17. Twitch's token flow was confirmed from Twitch's own page, and `multiquery` (up to 10 queries per request) from search snippets of IGDB's docs. The game type id list matches the snippet of IGDB's old `category` list. Not confirmed, and so checked live in build step 3: that `game_type` uses the same ids, the Erotic theme id 42, `version_parent` semantics, the rating fields, `search` combined with `where`, the count header, the exact rate limit, array filter syntax, and IGDB's terms.
