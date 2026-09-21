# 0001. User tracking schema and Row Level Security

**Date**: 2026-09-20
**Status**: Accepted

Scope feature: [3. Data model and security policies](../../scope/scope.md) · GA tier

## Summary

This decides how BeStats stores what each user is tracking, and how the database stops one user reaching another user's data. Three tables hold private state: one for movies, one for TV shows, one for episodes. Nothing about the TMDB catalog is copied into the database, so titles and posters are always fetched fresh from TMDB, and season and show ratings are never stored because they are worked out from episode ratings whenever they are needed. Every table is protected by Row Level Security, meaning Postgres itself filters rows by who is asking, so a bug in the application cannot leak one user's data to another.

## Requirements

**User stories**:
- As a signed in user, I want my watchlist, watched history, statuses and ratings kept private, so that nobody else can read or change them even if they try to reach the data directly.
- As a signed in user, I want my watched marks and my ratings to stay independent, so that unmarking something as watched does not quietly delete how I rated it.
- As a developer, I want the whole schema reproducible from committed migrations, so that any environment can be rebuilt exactly and no change exists only in a dashboard.

**Acceptance criteria**:

- **AC-1**: Applying the committed migrations to an empty database creates the `tv_status` and `status_source` enum types, the three tables `user_movie_state`, `user_show_state` and `user_episode_state`, their constraints, the episode lookup index, and both trigger functions. Running `supabase db reset` twice produces an identical schema both times.
- **AC-2**: All three tables have Row Level Security enabled and forced, and each carries exactly four policies, one each for select, insert, update and delete. Every policy targets the `authenticated` role and predicates on `(select auth.uid()) = user_id`. The update policy carries both a `using` clause and a `with check` clause.
- **AC-3**: Acting as user A, every read of user B's rows in all three tables returns zero rows, and every insert, update and delete aimed at user B's rows is refused or affects zero rows. Proven for all three tables and all four commands.
- **AC-4**: An unauthenticated request, made as the `anon` role, can neither read nor write any row in any of the three tables. Furthermore the `anon` and `public` roles hold no privilege on those tables at all, so the refusal does not depend on Row Level Security staying enabled.
- **AC-5**: A user cannot move a row to another user. An update that sets `user_id` to a different user's id is rejected by the update policy's `with check` clause.
- **AC-6**: Writing the same state twice leaves one row, not two. Repeating an identical upsert for a movie, show or episode results in exactly one row carrying the later values.
- **AC-7**: `rating` accepts only null or an integer from 1 to 10 inclusive. The values 0, 11 and negative numbers are rejected by the database itself, not only by application validation.
- **AC-8**: `status` accepts only `want_to_watch`, `watching`, `on_hold`, `dropped` and `completed`. `status_source` accepts only `user` and `system`. Any other value is rejected by the database.
- **AC-9**: `season_number` accepts 0 and above, so specials are storable. `episode_number` accepts 1 and above. Negative values for either are rejected.
- **AC-10**: Clearing a watched mark sets `watched_at` to null and leaves `rating` untouched. Clearing a rating sets `rating` to null and leaves `watched_at` untouched.
- **AC-11**: Deleting a row from `auth.users` removes every row that user owned across all three tables, leaving no orphaned rows behind.
- **AC-12**: `updated_at` advances on every update without the write path setting it. `status_changed_at` advances when `status` changes and does not advance when only another column changes.
- **AC-13**: An episode row can be created for a show that has no `user_show_state` row, and the write succeeds with no database error.
- **AC-14**: The committed TypeScript types match the live schema, with `tv_status` and `status_source` appearing as string union types. Type checking and `pnpm build` succeed with no database reachable.
- **AC-15**: The Supabase service role key appears nowhere in application code, nowhere in `.env.example`, and nowhere in the browser bundle.

## Decision

**Chosen option**: Option 1: Separate tables per media type, user state only.

Private user state lives in three purpose built tables keyed on the owner plus the TMDB id, protected by per command Row Level Security, with no TMDB catalog metadata stored in Postgres and no derived rating persisted anywhere.

**Implementation skills**: `supabase` (`supabase/agent-skills`, `.agents/skills/supabase/`) · `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`)

## Rationale

Reasoning, the options weighed, and the skill conventions applied: see [rationale.md](rationale.md).

## Feature design

### Data model sketch

**Enum types**

| Type | Values |
|---|---|
| `tv_status` | `want_to_watch`, `watching`, `on_hold`, `dropped`, `completed` |
| `status_source` | `user`, `system` |

**`user_movie_state`** · primary key `(user_id, movie_id)`

| Column | Type | Null | Default | Constraint or note |
|---|---|---|---|---|
| `user_id` | `uuid` | no | | references `auth.users(id)` on delete cascade |
| `movie_id` | `integer` | no | | TMDB movie id. `check (movie_id > 0)` |
| `in_watchlist` | `boolean` | no | `false` | |
| `watched_at` | `timestamptz` | yes | | null means not watched |
| `rating` | `smallint` | yes | | `check (rating between 1 and 10)` |
| `created_at` | `timestamptz` | no | `now()` | |
| `updated_at` | `timestamptz` | no | `now()` | maintained by `set_updated_at` trigger |

**`user_show_state`** · primary key `(user_id, show_id)`

| Column | Type | Null | Default | Constraint or note |
|---|---|---|---|---|
| `user_id` | `uuid` | no | | references `auth.users(id)` on delete cascade |
| `show_id` | `integer` | no | | TMDB TV id. `check (show_id > 0)` |
| `status` | `tv_status` | no | | `want_to_watch` is the TV watchlist state. There is no second TV watchlist flag |
| `status_source` | `status_source` | no | `'user'` | the default fires on insert only. Every caller passes it explicitly on every write, see the note under Value sourcing |
| `status_changed_at` | `timestamptz` | no | `now()` | maintained by `set_status_changed_at` trigger |
| `created_at` | `timestamptz` | no | `now()` | |
| `updated_at` | `timestamptz` | no | `now()` | maintained by `set_updated_at` trigger |

**`user_episode_state`** · primary key `(user_id, episode_id)`

| Column | Type | Null | Default | Constraint or note |
|---|---|---|---|---|
| `user_id` | `uuid` | no | | references `auth.users(id)` on delete cascade |
| `episode_id` | `integer` | no | | TMDB episode id. `check (episode_id > 0)` |
| `show_id` | `integer` | no | | parent TMDB TV id. `check (show_id > 0)` |
| `season_number` | `smallint` | no | | `check (season_number >= 0)`. Zero is specials |
| `episode_number` | `smallint` | no | | `check (episode_number >= 1)` |
| `watched_at` | `timestamptz` | yes | | null means not watched |
| `rating` | `smallint` | yes | | `check (rating between 1 and 10)` |
| `created_at` | `timestamptz` | no | `now()` | |
| `updated_at` | `timestamptz` | no | `now()` | maintained by `set_updated_at` trigger |

Additional index: `user_episode_state (user_id, show_id, season_number, episode_number)`, serving the one read the primary key does not, which is one user's episodes for one show in display order.

**Relationships**

| From | To | Cardinality | On owner delete |
|---|---|---|---|
| `auth.users` | `user_movie_state` | 1:N | cascade |
| `auth.users` | `user_show_state` | 1:N | cascade |
| `auth.users` | `user_episode_state` | 1:N | cascade |
| `user_show_state` | `user_episode_state` | none, deliberately | not applicable |

`movie_id`, `show_id` and `episode_id` are external TMDB references with no foreign key and nothing asserting they exist. No catalog table exists. No season or show rating column exists anywhere.

**Trigger functions**

- `set_updated_at()`: before update on all three tables, sets `updated_at = now()`.
- `set_status_changed_at()`: before update on `user_show_state`, sets `status_changed_at = now()` only when `new.status is distinct from old.status`.

Both are plain `SECURITY INVOKER` trigger functions. Neither needs elevated privileges.

### State transitions

This spec supplies the mechanism only. The rules governing which transition is allowed and when belong to scope features 14 and 16.

```
want_to_watch ──► watching ──► completed
      ▲              │  ▲           │
      │              ▼  │           │
      └────────── on_hold ──────────┘
                     │
                     ▼
                  dropped ──► watching
```

- Any status may be set manually to any other. `status_source` is then `user`.
- A transition made by the application without a deliberate user choice sets `status_source` to `system`.
- The database enforces only that the value is one of the five. It enforces nothing about which transitions are legitimate, and it never changes `status` by itself.

### Data access surface

There are no HTTP endpoints in this spec. The surface is the set of database operations that later features perform through the Supabase server client, reached over PostgREST as the `authenticated` role.

| Operation | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| Read one movie's state | `select` on `user_movie_state` | `movie_id:int` | `in_watchlist`, `watched_at`, `rating` | authenticated | zero rows when untracked, which is not an error |
| Write movie state | `upsert` on `(user_id, movie_id)` | `movie_id:int` (req), `in_watchlist:bool` (opt), `watched_at:timestamptz\|null` (opt), `rating:smallint\|null` (opt) | the stored row | authenticated | `23514` check violation on a rating outside 1 to 10, `42501` when the row is not yours |
| Read one show's state | `select` on `user_show_state` | `show_id:int` | `status`, `status_source`, `status_changed_at` | authenticated | zero rows when untracked |
| Write show status | `upsert` on `(user_id, show_id)` | `show_id:int` (req), `status:tv_status` (req), `status_source:status_source` (req) | the stored row | authenticated | `22P02` invalid enum value, `42501` when the row is not yours |
| Read a show's episode state | `select` on `user_episode_state`, always `order by season_number, episode_number` | `show_id:int` | rows of `episode_id`, `season_number`, `episode_number`, `watched_at`, `rating` | authenticated | empty set when nothing is tracked |
| Write one episode's state | `upsert` on `(user_id, episode_id)` | `episode_id:int` (req), `show_id:int` (req), `season_number:smallint` (req), `episode_number:smallint` (req), `watched_at` (opt), `rating` (opt) | the stored row | authenticated | `23514` check violation, `42501` |
| Mark a whole season watched | one array `upsert` on `(user_id, episode_id)` | an array of eligible episode rows, deduplicated by `episode_id` before the call | the stored rows | authenticated | the whole statement fails as a unit, never partially. A duplicated `episode_id` in the array raises `21000`, so deduplication is a precondition, not a nicety |
| Read the watchlist | `select` where `in_watchlist` is true, unioned in the application with `user_show_state` where `status = 'want_to_watch'` | none beyond the session | the tracked ids | authenticated | empty set |

**The partial write rule, which applies to every row above, not just the season case.** An upsert sets only the columns present in its payload. A key that is absent is left exactly as it was; a key present with the value `null` clears it. Every write path must therefore build its payload from only the columns it is actually changing, and must leave every other key out of the object entirely rather than including it with a stale or undefined value. Marking a season watched sends `watched_at` and nothing else, so ratings survive by omission rather than by a conditional. Clearing a watched mark sends `watched_at: null` and nothing else. This is the mechanism AC-6 and AC-10 rest on, and the most likely way to break them is to assemble the payload from the full current form state.

### Value sourcing

| Action | Value produced, computed or displayed | Source |
|---|---|---|
| any write | `user_id` | the verified Supabase session, read server side. Never accepted from a client field. Session shape decided by scope feature 6 |
| any write | `movie_id`, `show_id` | the route parameter, validated by Zod as a positive integer before the write |
| write movie or episode state | `watched_at` when marking watched | `now()` set server side at write time. Never a client supplied timestamp |
| write movie or episode state | `rating` | client input, validated 1 to 10 by Zod, enforced again by the CHECK constraint |
| any write | `updated_at` | the `set_updated_at` trigger. Never set by the write path |
| write show status | `status` | client input, constrained to the five `tv_status` values |
| write show status | `status_source` | always passed explicitly by the calling code: `user` for a deliberate choice, `system` for an automatic transition. Which transitions count as automatic is decided by scope features 14 and 16. The column default never covers this, see the note below the table |
| write show status | `status_changed_at` | the `set_status_changed_at` trigger, only when `status` actually differs |
| mark a season watched | the list of eligible episodes, already deduplicated by `episode_id` | computed server side in TypeScript from the TMDB season response. The air date eligibility rule itself is decided by scope feature 12, which also owns the deduplication, since a repeated `episode_id` in one array upsert raises `21000` and turns an all or nothing write into an unhandled error. The TMDB response shape is decided by scope feature 4 |
| write episode state | `episode_id`, `season_number`, `episode_number` | the TMDB season detail response. TMDB stays authoritative; the stored numbers are a display and ordering convenience |
| display a season rating | the season average | derived in TypeScript from `user_episode_state.rating`, excluding unrated episodes. Not stored. Scope feature 13 |
| display a show rating | the show average | derived in TypeScript from the season averages with equal weight per season, excluding season 0 and unrated seasons. Not stored. Scope feature 13 |
| display progress | the eligible aired episode total | computed from TMDB air dates, not from this schema. Scope feature 14 |
| display any list | title, poster, year, overview | TMDB at request time. Deliberately absent from this schema |
| cross user isolation tests | the ids of user A and user B | `supabase/seed.sql`, the committed fixture |

**The `status_source` default is insert only.** A column default fires when a row is inserted and never when it is updated. On the update branch of an upsert, omitting `status_source` therefore keeps whatever value the row already held, it does not fall back to `'user'`. A caller that relies on the default during an automatic transition would leave `status_source` as `user`, and the system would then correctly refuse to touch a row it actually set itself. Every caller passes `status_source` explicitly on every write. The default exists only so a row created by some other path is not left invalid.

### Key invariants

- `user_id` always equals the verified session user. No write path ever accepts an owner from client input.
- Every write payload contains only the columns being changed. An untouched column is absent from the payload, never present with a stale value. This is what makes clearing one field safe for its siblings.
- `status_source` is always supplied explicitly. No write relies on the column default.
- An array upsert contains each `episode_id` at most once.
- `rating` is null or an integer 1 to 10, enforced in the database, not only in Zod.
- Exactly one row exists per `(user, movie)`, `(user, show)` and `(user, episode)`.
- Clearing one field never modifies another. Unmarking watched never touches `rating`.
- No row is readable or writable by anyone other than its owner, enforced by Postgres, not by routing.
- No season rating and no show rating is stored in any column anywhere.
- `want_to_watch` is the sole representation of a TV show being on the watchlist. No second flag exists that could disagree with it.
- Episode rows are independent of show rows. Changing or removing a status never deletes episode history or ratings.
- The `anon` role holds no privilege on any of the three tables.

### Security model

All three tables hold private, user owned data. Nothing in this schema is public.

- **Row Level Security** is enabled and forced on every table. Forced means the rules apply even to the table owner.
- **Policies**: four per table, one per command, each `to authenticated`, each predicated on `(select auth.uid()) = user_id`. The subselect makes `auth.uid()` evaluate once per statement instead of once per row. The update policy carries both `using` and `with check`, because without `with check` a user could reassign a row to someone else.
- **Grants**: `select, insert, update, delete` granted to `authenticated`, and explicitly **revoked** from `anon` and `public`. The revoke matters and is not merely tidiness: Supabase's default privileges on the `public` schema already grant these commands to `anon` on newly created tables, which is precisely why Row Level Security is mandatory there. Simply never writing a grant leaves that default grant in place, masked by RLS alone. An explicit revoke means the privilege does not exist, so a moment with RLS disabled for debugging does not hand `anon` full read and write.
- **Roles**: the service role is not used anywhere in the application, and its key is not added to any deployed environment. The local CLI's own development key is used only for seeding on your machine.
- **Access path**: all reads and writes happen server side, in Server Components and Server Actions. The browser holds a Supabase client for authentication only and never queries these tables.
- **Compliance scope**: none. No payment data, no health data, no special category personal data. The only personal data is the account identity, which Supabase Auth owns.
- **Note on anonymous sign ins**: `to authenticated` includes anonymous users when Supabase anonymous sign ins are enabled. The ownership predicate still holds per user, but anonymous sign ins should stay off unless deliberately wanted.

### Configuration required

This spec introduces no new application environment variables. Feature 1 owns wiring the app to Supabase.

- `SUPABASE_*` local values are printed by `supabase start` and used only by the CLI and the test suite.
- Deliberately absent: the service role key. It is not added to `.env.example`, to any local file, or to any deployed environment.
- `supabase/config.toml` is committed so the local stack is reproducible.

### Critical test scenarios

- Happy path: upsert a movie as watched with a rating, read it back, unmark watched, confirm the rating survives. Verifies **AC-6**, **AC-10**.
- Happy path: upsert a whole season's eligible episodes in one array upsert, repeat the identical call, confirm the row count is unchanged and no rating was overwritten. Verifies **AC-6**.
- Failure case: attempt an update that sets `user_id` to another user's id and confirm it is rejected. Verifies **AC-5**.
- Failure case: attempt to insert a rating of 0 and of 11, and a `season_number` of -1, and confirm the database rejects each. Verifies **AC-7**, **AC-9**.
- Failure case: attempt to set `status` to a value outside the five and confirm the database rejects it. Verifies **AC-8**.
- Failure case: write an episode row for a show with no `user_show_state` row and confirm it succeeds. Verifies **AC-13**.
- Auth and permission: as user A, run select, insert, update and delete against user B's rows in all three tables, and confirm zero rows and no leakage in every case. Verifies **AC-3**.
- Auth and permission: as the `anon` role, attempt a read and a write on each table and confirm both are refused. Verifies **AC-4**.
- Auth and permission: assert directly that `anon` and `public` hold no privilege on any of the three tables, so the refusal above is proven to come from the absent grant and not from RLS alone. Verifies **AC-4**.
- Configuration: assert `relrowsecurity` and `relforcerowsecurity` are both true for all three tables, read from `pg_class`. The Supabase advisors check that RLS is enabled but not that it is forced, so the forced half of the requirement is only proven here. Verifies **AC-2**.
- Configuration: assert each table carries exactly four policies, one per command, each targeting `authenticated`, and that the update policy has a `with check` expression. Verifies **AC-2**.
- Lifecycle: delete a user from `auth.users` and confirm no rows remain for that user in any table. Verifies **AC-11**.
- Lifecycle: update a row's rating only, and confirm `updated_at` advanced while `status_changed_at` did not. Then change `status` and confirm `status_changed_at` advanced. Verifies **AC-12**.

## Build plan

Build approach is Tracer Bullet, and this feature deliberately front loads the whole schema rather than slicing it per product slice. The reasoning is in the rationale: a foundation table that arrives late forces a rewrite of everything already reading it. The Tracer Bullet shape is preserved within this feature instead: the thread runs stack, schema, policies, proof of isolation, types, so the security boundary is provably closed before any product feature is built on it.

1. Install the Supabase CLI, run `supabase init` and `supabase start`, confirm the local stack runs, and commit `supabase/config.toml`. Satisfies **AC-1**.
2. Configure the project for declarative schemas by creating `supabase/schemas/` and setting `schema_paths` in `config.toml`. Satisfies **AC-1**.
3. Author the schema files: the two enum types, the three tables with every column, default, CHECK constraint and foreign key from the data model sketch, and the episode lookup index. Satisfies **AC-1**, **AC-7**, **AC-8**, **AC-9**.
4. Author the two trigger functions and their triggers. Satisfies **AC-12**.
5. Add `enable row level security` and `force row level security` on all three tables, plus the twelve policies, four per table, in the shape given in the Security model. Satisfies **AC-2**, **AC-5**.
6. Set the table privileges explicitly in both directions: grant `select, insert, update, delete` on the three tables to `authenticated`, and `revoke all` on them from `anon` and `public`. Both halves are required. Supabase's default privileges may already grant `anon` access to a new `public` table, so omitting the revoke leaves a live grant that only RLS is masking; and depending on the project's Data API settings a new table may not be reachable without the explicit grant. Doing both makes the outcome deterministic rather than dependent on project settings. Satisfies **AC-4**.
7. Generate the migration from the schema files with the CLI diff command, read the generated SQL line by line before committing it, and commit it. Satisfies **AC-1**.
8. Run `supabase db advisors` and resolve everything it reports. Treat this as a net, not a proof: its lints check that Row Level Security is enabled, not that it is forced, so a clean advisor run does not on its own satisfy AC-2. The pgTAP assertions in step 11 are what actually prove it. Satisfies **AC-2**.
9. Run `supabase db reset` twice and confirm the resulting schema is identical both times. Satisfies **AC-1**.
10. Write `supabase/seed.sql` creating two test users in `auth.users` and a small amount of tracking state for each. Satisfies **AC-3**.
11. Write the pgTAP suite covering every critical test scenario above, including the configuration assertions on forced Row Level Security, the per command policy set and the absent `anon` privileges, and confirm it runs green with `supabase test db`. Satisfies **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-6**, **AC-10**, **AC-11**, **AC-12**, **AC-13**.
12. Add a `db:types` package script generating the types file from the local stack, run it, and commit the output. Satisfies **AC-14**.
13. Add a check that fails when the committed types file is out of date with the schema, so drift is caught rather than discovered. Satisfies **AC-14**.
14. Confirm the service role key is absent from application code, from `.env.example` and from the built browser bundle. Satisfies **AC-15**.

## Consequences

**Positive**:
- A movie id and a TV id cannot collide, because the rule is structural rather than remembered.
- Idempotency is the primary key itself, so a duplicate state row is not merely unlikely but impossible.
- Each policy filters on `user_id`, which is the leading column of each primary key, so the security predicate is served by an index that already had to exist.
- Nothing stored can go stale, because nothing stored is a copy of external data.
- The season and show rating rules, which are the fiddliest in the product, live in TypeScript where a dozen crafted cases can be unit tested cheaply.
- Every constraint is unconditional, so reading the schema tells you the rules without tracing a discriminator column.
- Cross user isolation is proven at the database boundary itself, so it holds no matter which layer above it has a bug.

**Negative / tradeoffs**:
- Every list screen must resolve titles from TMDB at request time, and TMDB has no bulk fetch by id. This is the N+1 risk in the premise note and the single largest thing to watch.
- Watch history survives a TMDB outage but cannot be displayed during one, which only partly meets the spirit of the section 12 goal about preserving history when metadata is unavailable.
- The combined watchlist unions two tables, and paginating a merged date ordered list across two tables is genuinely awkward. Feature 9 inherits that problem.
- `season_number` and `episode_number` are denormalized copies and can drift from TMDB, so TMDB stays authoritative and these are for ordering and display only.
- Composite primary keys mean a state row has no single opaque handle, which is fine today and mildly limiting if anything ever needs to reference one.
- The entire schema lands before any of it is exercised, so a wrong call in the TV or episode tables will not surface until Slice 2 or Slice 4.
- pgTAP is a second test language alongside whatever the TypeScript runner ends up being, which is more to learn and maintain.
- Local development now requires Docker.
- An episode row can exist for a show with no status row, so every join must tolerate the absence rather than assume it away.

**Neutral**:
- The declarative schema workflow means the first migration is generated and reviewed rather than hand written, which is a different habit from the usual Supabase migration flow.
- Generated types are committed, so schema changes carry a mandatory regenerate step.
- Adding `title`, `poster_path` and `year` snapshot columns later is purely additive with no data rewrite, which is what makes the no cache decision safe to take now.
- This schema constrains features 4, 6, 9, 12, 13, 14, 15 and 16, all of which are still undesigned.

## Follow-up

- [ ] Verify the Supabase changelog for breaking changes before implementation starts, rather than working from memory. The installed `supabase` skill requires this.
- [ ] Revisit the no catalog cache decision at scope feature 9, once list screens can actually be measured against real TMDB latency. Adding snapshot columns is additive; do not treat this as settled forever.
- [ ] Decide the combined watchlist's ordering and pagination in scope feature 9. If it sorts by date added, an index on `(user_id, created_at desc)` will likely be needed on both `user_movie_state` and `user_show_state`.
- [ ] Confirm anonymous sign ins are disabled in Supabase Auth configuration, as part of scope feature 6. `to authenticated` includes anonymous users when that feature is on.
- [ ] Scope feature 1 must still add the `@supabase/ssr` browser and server clients plus their environment wiring. This spec deliberately excludes them, so the gap is real until feature 1 closes it.
- [ ] Scope features 14 and 16 must define which transitions set `status_source` to `system`. This spec provides the column and nothing more, and requires only that every caller passes the value explicitly rather than leaning on the insert only default.
- [ ] Scope feature 12 owns deduplicating the eligible episode list by `episode_id` before the array upsert. This spec names it as a precondition but cannot enforce it, since the duplicate arrives inside a single statement.
- [ ] Scope feature 2 should add `typecheck` and `test` scripts. The pgTAP suite needs a documented command so it is runnable by anyone and by CI.
- [ ] Record the service role ban in `AGENTS.md` so it survives as a rule rather than living only in this spec.
- [ ] Connect the official Supabase MCP server, `supabase/mcp`, following the setup guide at `https://supabase.com/docs/guides/getting-started/mcp`. This is a step in your own MCP configuration, not something a skill can do for you. Once connected its tools are used automatically, which means schema work, advisor checks and log reading happen against the real database instead of being reasoned about blind. Worth doing before implementation starts. Flag for the `MCP servers:` line of `AGENTS.md` section 4 once connected.
- [ ] Record in `AGENTS.md` section 4 that third party Supabase, Postgres and pgTAP Agent Skills were reviewed and declined in favour of the installed first party ones, so a later stage does not offer them again.
