# 0001. User tracking schema and Row Level Security · Rationale

Reasoning, alternatives and evidence. `/develop` does not need this file; `index.md` is the build spec.

## Context

> ⚠️ Premise note: keeping no catalog metadata in Postgres means every list screen (watchlist, watched history, Up Next) has to resolve its titles from TMDB at request time, and TMDB offers no bulk fetch by id. That is the classic N+1 read pattern, and it will show up as slow list pages the moment a user has more than a handful of tracked titles. The mitigating fact, and the reason to proceed, is that it is cheaply reversible: adding `title`, `poster_path` and `year` snapshot columns later is a purely additive migration with no data rewrite and no change to any existing reader. Proceed as chosen, measure it at feature 9, and treat the snapshot columns as a known escape hatch rather than a redesign.

BeStats stores two very different kinds of data. Catalog metadata (titles, posters, cast, air dates) belongs to TMDB and changes without warning. Private user state (what you want to watch, what you have watched, how you rated it) belongs to the user and must never be visible to anyone else. This spec decides how the second kind is stored.

Three forces shape it.

First, correctness is load bearing and the cost of being wrong is high. The scope calls this the costliest thing to redo, because every later feature reads these tables. A movie id and a TV id can carry the same number, ratings must never be stored as editable derived values, watched state and rating must stay independent, and status must stay independent of episode history. Each of those is a rule someone could break by accident unless the schema makes breaking it hard.

Second, privacy is a database problem, not a routing problem. `AGENTS.md` section 11 is explicit that page redirects are a UX measure and not the security boundary, and that one user must not reach another's data even through a direct data request. That means Row Level Security (database rules that filter rows by who is asking) has to be right on day one, on every table, for every command.

Third, this is a greenfield repository with a single developer and no production data. There is no migration burden and no legacy shape to respect, so the schema can be designed as a coherent whole rather than negotiated against what already exists. The flip side is that there is also no real usage to learn from, so the design has to lean on the product rules in `AGENTS.md` rather than on measurement.

**Assumptions this spec rests on that have no spec of their own yet.** Authentication (scope feature 6) is assumed to provide a verified Supabase session whose user id the server can read. The TMDB module (scope feature 4) is assumed to supply movie, show, season and episode metadata including TMDB ids and air dates. Neither is designed yet. This spec depends on both and is written so that it constrains them as little as possible: it stores TMDB ids as plain integers with no foreign key, and it derives the owner from whatever verified session the auth design ends up providing.

## Options considered

### Option 1: Separate tables per media type, user state only

Three tables, `user_movie_state`, `user_show_state` and `user_episode_state`, each keyed on a natural composite key of the owner plus the TMDB id. No catalog metadata in Postgres at all. Season and show ratings computed in TypeScript from episode ratings.

**Pros**:
- A movie id and a TV id cannot collide, because they live in different tables. The rule is structural rather than remembered.
- Every column applies to every row in its table, so all CHECK constraints are unconditional and readable.
- The leading column of each primary key is `user_id`, which is exactly the column the RLS policies filter on, so the policy is served by the primary key index with no extra index.
- Nothing in the database can go stale, because nothing in the database is a copy of something external.

**Cons**:
- The combined watchlist has to union two tables, and paginating a merged, date ordered list across two tables is genuinely fiddly.
- Every list screen needs TMDB lookups to render a title, which is the N+1 concern in the premise note.
- Watch history becomes unreadable when TMDB is unavailable, which sits awkwardly against the section 12 goal of preserving user history through outages. History is preserved, but it cannot be displayed.

### Option 2: One unified state table with a media type discriminator

A single `user_title_state` keyed on `(user_id, media_type, tmdb_id)`, with episode state in its own table.

**Pros**:
- The combined watchlist is one query with one ordering and straightforward pagination.
- One table, one policy set, one write path to get right.

**Cons**:
- `status` applies only to TV and `in_watchlist` only to movies, so both turn nullable and every constraint on them has to be conditional on `media_type`. Conditional constraints are where this exact class of bug hides.
- The collision rule becomes a convention enforced by a column value rather than by structure.
- Generated TypeScript types describe one row shape that is really two, so the application has to narrow by hand everywhere.

### Option 3: User state plus cached catalog tables

Option 1 plus public read tables caching movies, shows, seasons and episodes, written server side with a refresh policy.

**Pros**:
- List screens render from one database query with no TMDB call, which removes the N+1 concern entirely.
- History stays fully readable during a TMDB outage.
- Ordering and filtering a watchlist by title or year becomes a normal SQL problem.

**Cons**:
- A freshness policy is a real, permanent piece of engineering: what refreshes, how often, what happens to a row nobody has requested in a year, and how a newly aired episode reaches the cache.
- Two classes of table with two security models in one schema, which makes the "is everything protected" question harder to answer at a glance.
- It is the largest amount of schema to design before a single feature has been built, on a product with no measured performance problem.

### Option 4: A row per fact

Separate tables for watchlist entries, watched events and ratings, so every row asserts one thing.

**Pros**:
- No meaningless rows, and every row's existence carries information.
- Watch history (repeat viewings) becomes natural to add later.

**Cons**:
- Three times the tables, policies and write paths for movies alone.
- Rendering one movie's state needs joins or three reads, on the hottest read path in the product.
- The independence of watched and rating is already guaranteed more cheaply by two independent nullable columns.

## Rationale

Option 1 wins on the force that dominates: the cost of a subtle correctness bug here is higher than the cost of a slow list screen. Context says a movie id and a TV id can share a number and must never collide, and separate tables make that impossible rather than merely forbidden. The same logic applies to the constraints: in Option 2 the rating bound, the status validity and the watchlist flag would all become conditional on a discriminator column, and conditional constraints are exactly the kind of thing that passes review and fails in production.

The natural composite key falls out of the same reasoning rather than being a separate preference. `AGENTS.md` requires that repeated writes never duplicate state rows; making `(user_id, tmdb_id)` the primary key means idempotency is the key itself rather than a constraint that could be dropped. It also happens to be the right performance shape, because the installed Postgres skill's RLS guidance is to index the column a policy filters on, and `user_id` is already the leading column of that key. Nothing references these rows, so the usual argument for a surrogate key does not apply here. Note this does diverge from that skill's primary key guidance, which is about choosing between `bigint identity` and UUID for surrogate keys; that question does not arise when the key is natural.

Option 3 was the strongest alternative and is the one to revisit. It is rejected now for the reason in the Context: there is no measured performance problem, and the refresh policy it requires is permanent operational work. The deciding factor is reversibility. Moving from Option 1 to a denormalized snapshot is additive and cheap; moving away from a cache once features depend on its freshness guarantees is not. Deferring is therefore the lower risk order, provided the decision is actually revisited at feature 9 rather than forgotten, which is why it is enrolled as a follow up rather than left as a remark.

Computing season and show ratings in TypeScript rather than in SQL views follows the same "keep the tricky rule testable" instinct. The rule is not a simple average: seasons carry equal weight regardless of episode count, unrated episodes are excluded rather than counted as zero, and season 0 is excluded entirely. That is a rule worth unit testing against a dozen crafted cases, which is easy in TypeScript and awkward in a view. `AGENTS.md` section 5 also already asks for reusable domain functions, so this keeps the rule in the layer the project intends to own it.

On the one place where the engineer's answers and the project document read slightly differently: `AGENTS.md` describes movie state as "watched state, an optional watched timestamp", which reads a little like two columns. A single nullable `watched_at` was chosen instead. It satisfies the same requirement, it makes the contradictory state (watched with no date, or a date with watched false) unrepresentable rather than merely constrained, and the only capability it gives up is recording a watch whose date is genuinely unknown. No MVP screen offers that, so the tradeoff is worth taking consciously.

## Evidence: conventions drawn from installed skills

Taken from `supabase-postgres-best-practices` and `supabase`, both installed in `.agents/skills/`. These are project conventions and override generic advice.

| Convention | Effect on this design |
|---|---|
| `TO authenticated` alone is authentication without authorization | Every policy pairs the role clause with an ownership predicate on `user_id` |
| `auth.uid()` called per row is slow; wrap it in a subselect | Every policy uses `(select auth.uid()) = user_id`, evaluated once per statement |
| UPDATE policies need both `USING` and `WITH CHECK` | Without `WITH CHECK` a user could reassign a row to another user. AC-5 exists to prove this is closed |
| An UPDATE first needs a SELECT policy, or it silently affects zero rows | The per command policy set always includes SELECT |
| `auth.role()` is deprecated, and breaks when anonymous sign ins are on | Never used. Role targeting is the `TO` clause only |
| Index the column an RLS policy filters on | Satisfied by `user_id` being the leading column of every primary key |
| New tables may not be exposed to the Data API automatically | The build plan grants `authenticated` explicitly and grants `anon` nothing |
| Never expose the service role key to a public client | The key is kept out of the application and out of `.env.example` entirely |
| Views bypass RLS unless created with `security_invoker` | Not applicable, since no views are created. Relevant if the rating views in Option 3's spirit are ever added |
| `SECURITY DEFINER` functions bypass RLS and are publicly callable in `public` | The two triggers are plain trigger functions and need no elevated privileges |
| Use `INSERT ... ON CONFLICT` rather than select then insert | The chosen write path, which also removes the check then insert race |
| `ADD CONSTRAINT IF NOT EXISTS` is not valid Postgres | Relevant to any hand written follow up migration; the generated migration creates tables whole |
| Declarative schema projects edit `supabase/schemas/` and generate the migration | The build plan never hand writes the first migration |
| Run `supabase db advisors` before committing a migration | An explicit build plan step |
| Supabase changes often; verify against the changelog rather than memory | Enrolled as a follow up before implementation starts |
