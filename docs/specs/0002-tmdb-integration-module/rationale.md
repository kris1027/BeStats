# 0002. TMDB integration module: rationale

The decision record for [index.md](index.md). Reasoning, options, research findings and sources. Not read during a build.

## Context

> ⚠️ Premise note: three things about this decision are larger or riskier than the topic suggests, and they should be seen before the design is read.
>
> **This spec makes a project wide rendering decision inside a feature spec.** Choosing Cache Components means setting `cacheComponents: true`, which applies to every route in the application, not only to this module. Every page built from feature 7 onward must be prerenderable or explicitly opted out. That is the right call now, while `app/` holds one starter route, and a genuinely expensive migration later. But it is a decision whose blast radius exceeds feature 4, so it is recorded here and a follow up asks for it to be written into `AGENTS.md` where later features will actually see it.
>
> **The N+1 is contained here, not solved.** Spec 0001 chose to store nothing from TMDB, and recorded as its largest tradeoff that every list screen must resolve titles from TMDB at request time with no bulk fetch by id. The research confirmed no bulk endpoint appears to exist. This module's batch helper bounds the damage with a concurrency cap and per item caching, but a fifty title watchlist on a cold cache is still fifty requests. Feature 9 must measure this against real latency rather than inherit an assumption, exactly as spec 0001's own follow up says.
>
> **Building the full surface now sits in tension with Tracer Bullet.** The project's approach is a thin end to end thread first, and this feature builds movies, TV, seasons, credits, search, discover and genres in one pass. The justification is the same one spec 0001 used for front loading the whole schema: a foundation that arrives late forces a rewrite of everything already built on it. The tension is resolved inside the feature rather than ignored, by running the thread through one movie end to end and verifying it in the running app before any other strand is written. If that feels too broad, the honest smaller alternative is to cut search and discover from this spec and let feature 11 design them, which is Option 3 below.

BeStats displays no catalog data of its own. Every title, poster, cast list, season and episode comes from TMDB, and spec 0001 deliberately stored none of it, so TMDB is not a source that fills a database once but a dependency on the critical path of nearly every page. That makes the integration layer load bearing in a way a typical API client is not: its latency is the app's latency, its failures are the app's failures, and its response shape is the app's data model.

Several forces push on the design at once. TMDB is rate limited, so an uncontrolled fan out from a list screen is a real failure mode rather than a theoretical one. TMDB's metadata changes over time, and `AGENTS.md` section 12 explicitly forbids relying on an indefinitely cached catalog, because a newly aired episode that never appears breaks the core TV tracking loop. TMDB's data is also frequently incomplete, and `AGENTS.md` is emphatic that missing metadata must be shown honestly rather than filled in, which means the boundary has to distinguish "absent" from "zero" rigorously. The credential is a secret that must never reach the browser, and `AGENTS.md` section 13 wants that proven rather than assumed.

The framework adds its own force. The project runs Next.js 16.3.5, where caching is built around Cache Components and the previous `fetch` based model is documented as the legacy path. Choosing between them is unavoidable, and the cost of choosing is asymmetric: adopting now costs almost nothing because `app/` holds one starter page, while adopting later is a migration across every finished route.

Not deciding has a specific cost. Features 7, 9, 10, 11, 12, 14, 15 and 16 all read through this layer. Without it they each invent their own fetch call, their own cache lifetime and their own handling of a null air date, and the inconsistency surfaces as bugs in the rating and progress rules, which are the fiddliest part of the product.

## Options considered

### Option 1: Thin typed fetch helpers, no normalization layer

A small set of functions that request a TMDB endpoint, apply TypeScript types to the JSON and return it. Caching comes from `fetch` options, errors propagate as thrown responses, and components read TMDB's fields directly.

**Pros**:
- The least code to write and the fastest route to a working movie page.
- Nothing to keep in step: a field TMDB adds is immediately available with no mapping to update.
- No dependency on Zod and no adoption of Cache Components required.

**Cons**:
- TypeScript types over a JSON response are an assertion, not a check. A field that becomes null upstream fails at render time in a component rather than at the boundary, which is the hardest kind of bug to trace back to its cause.
- TMDB's `snake_case` naming and its inconsistent nulls spread into every component, so a rename upstream becomes a change across the whole app.
- The distinction between "TMDB gave us nothing" and "TMDB gave us zero" has to be remembered at every call site, and `AGENTS.md` forbids getting it wrong.
- Keeps the app on the legacy caching model, deferring a migration that only grows.

### Option 2: One server only module, normalized types, cached with Cache Components

A single module owning auth, requests, retries, validation, normalization, caching and errors, exporting the app's own domain types. `use cache` with explicit per resource `cacheLife` profiles, Zod on the fields actually read, and a typed error class.

**Pros**:
- Every cross cutting concern is decided once, so no page author re-decides a cache lifetime or a null handling rule.
- Validation at the boundary turns an upstream change into a clear, attributable failure instead of a mysterious render error.
- The normalized types are the contract spec 0001 deferred to this spec, and they carry exactly the four episode identity values the database needs.
- Adopting Cache Components while the app is empty is nearly free, and puts the project on the model its installed Next version is documented against.
- The typed split between search and discover turns the trap in `AGENTS.md` section 10 into a compile error.

**Cons**:
- The most code in this spec, and a mapping layer that must be maintained: a newly needed field is a change in three places.
- Zod parsing costs CPU on every cache miss.
- `cacheComponents: true` constrains every future route, which is a commitment made before most routes exist.
- The full surface is built before most of it is used, so a mistake in search or discover surfaces at feature 11 rather than now.

### Option 3: The same module, but scoped to movies and TV only

Option 2 with search, discover and genres deferred to feature 11, where the filter rules are actually being designed.

**Pros**:
- Truest to the Tracer Bullet approach: the thinnest foundation that unblocks Slice 1 and Slice 2.
- Search is the part `AGENTS.md` flags as most likely to be got wrong, and designing it next to its product rules would produce a better result than designing it in the abstract.
- A materially smaller spec and a shorter build.

**Cons**:
- Feature 11 then designs the search reads and the module's conventions at the same time, which is how a second, slightly different set of conventions gets introduced into the same module.
- The research already surfaced the search versus discover mismatch, so the knowledge is available now and would have to be rediscovered later.
- Genres are needed by the filter UI and are trivial, so deferring them buys almost nothing.

### Option 4: Adopt a community TMDB SDK

Use an existing typed TMDB client library rather than writing the request layer.

**Pros**:
- Endpoint coverage and types arrive complete, with no request code to write.
- Someone else tracks TMDB's API surface.

**Cons**:
- You inherit its error handling, its types and its release cadence, and most TMDB SDKs lag the API.
- An SDK that wraps `fetch` in its own client can bypass the framework's fetch instrumentation, and an SDK that returns raw TMDB shapes still leaves the normalization problem unsolved.
- The genuinely hard parts here are the caching policy, the honest null handling and the retry contract, and no SDK decides those for you. The part an SDK saves is the part that was already easy.

## Rationale

Option 2 was chosen because the forces in Context are almost all boundary problems, and a thin helper layer has no boundary to put them at. The requirement to show missing metadata honestly, the requirement to keep the TMDB token off the browser provably, and the requirement to tell a null air date apart from an unaired episode are each a rule that has to hold everywhere; a rule that has to hold everywhere belongs in one place, enforced by types, not repeated in each component. Option 1's real cost is not that it is untyped but that it has nowhere to enforce anything.

The Cache Components call was made on timing rather than on preference. The installed Next version documents the previous model as the legacy path, `app/` currently holds a single starter page, and the project has the `next-cache-components-adoption` skill installed. The cost of adopting now is close to zero and the cost of adopting after features 7 through 15 exist is a migration across every route. Deciding this in a data module spec is not ideal, which is why the premise note raises it and a follow up asks for it to be recorded in `AGENTS.md`.

Option 3 is the honest runner up and the closer reading of Tracer Bullet. It was not chosen because the search versus discover mismatch is already understood from this spec's research, and deferring the search reads would mean feature 11 extends this module while simultaneously designing the hardest product rules in the app, which is how a module acquires a second set of conventions. The Tracer Bullet concern is answered inside the build plan instead: one movie runs end to end through every layer and is verified in the running app before any other strand is written, so a wrong call in the client or the error contract surfaces on strand one rather than after strand seven.

Option 4 was rejected on the principle that a dependency should remove work you would otherwise do badly. Writing a `fetch` wrapper with a timeout and a retry is not work anyone does badly; deciding cache lifetimes, null semantics and an error contract is, and no SDK does it for you.

Two smaller calls were made rather than asked, and both could reasonably go the other way. The batch helper omits ids TMDB reports as not found and returns them separately, rather than failing the whole batch, because a watchlist should not go blank when one title is removed from TMDB; the runner up, failing the batch, is more predictable but produces a worse user outcome in the one case it applies to. And a systemic failure such as a rejected credential does raise, because returning a short list there would silently hide data the user owns. The concurrency cap of 8 and the 8 second timeout are starting values chosen to sit well inside TMDB's limit rather than measured ones, and feature 9 is where they should actually be tuned.

## Research findings

A web check was run on 2026-09-20 against TMDB's official documentation. The full output is cached at `docs/.agent-cache/research/tmdb-api-facts.md`. What it established, and what it could not, both shaped the design.

**Confirmed**:
- The v4 Read Access Token works as `Authorization: Bearer <token>` against v3 endpoints. The legacy `api_key` query parameter is still supported. Both grant the same access, which made the header form a free improvement.
- `append_to_response` is supported on the detail endpoints with a maximum of 20 appended items, comfortably above what a movie or TV detail page needs.
- The endpoint paths are `/3/movie/{id}`, `/3/tv/{id}` and `/3/tv/{id}/season/{number}`, with configuration at `/3/configuration`.
- **`/search/movie` accepts only query, year, page, include_adult, language and region. It accepts no genre filter and no vote filter.** `/discover/movie` is where `with_genres`, `vote_average.gte` and `primary_release_year` live. This is the single most consequential finding and it confirms the warning in `AGENTS.md` section 10 is describing a real API constraint rather than a general caution. It is why the module exposes two typed function families rather than one.
- The paged response envelope is `page`, `results`, `total_pages`, `total_results`.
- The image base is `https://image.tmdb.org/t/p/`, with poster sizes from `w92` to `w780` plus `original`, backdrop sizes from `w300` to `w1280` plus `original`, and profile sizes `w45`, `w185`, `h632` and `original`. Calling `/configuration` is recommended by TMDB but not required, which is what makes hardcoding defensible.
- The rate limit is in the region of 40 requests per second, not the older 40 requests per 10 seconds. A 429 is returned on breach. This is a more generous ceiling than assumed and it is why a concurrency cap of 8 is comfortable rather than tight.
- Attribution requires the exact wording "This product uses the TMDB API but is not endorsed or certified by TMDB.", use of approved logos only, displayed less prominently than the app's own branding and unmodified.

**Not confirmed, and handled defensively**:
- Whether a 429 carries a `Retry-After` header. The retry logic therefore honours it when present and falls back to exponential backoff when it is not.
- The maximum page number TMDB will return. Historically it has been capped, but the cap could not be verified, so nothing is hardcoded and the build plan probes for the real value instead.
- `/discover/tv`'s exact filter parameter names. The build plan requires confirming them against TMDB's reference before writing them.
- TMDB's behaviour when an English translation is missing: whether it returns an empty string or falls back to the original language. This directly affects whether treating an empty overview as missing is correct, and it must be observed during the build.
- Whether any bulk fetch by id exists. None was found, which corroborates spec 0001's recorded N+1 tradeoff but does not prove the negative.

Seven unconfirmed items in a foundational integration is more uncertainty than is comfortable, and it is the reason the build plan contains explicit verification steps rather than treating the research as settled.

## Cross check findings applied

An independent read only review on a different model was run on 2026-09-20, before the spec was accepted. It raised ten findings, all of which were judged legitimate and applied. Three changed the design rather than the wording, and they are recorded here because the reasoning is not obvious from the final text.

**The module could not serve features 14 to 16.** The original surface exposed `getSeason` one season at a time and nothing else. But progress, Up Next and automatic completion all need every regular episode's air date across a whole show, which no single TMDB endpoint returns. As written, each of those three features would have fanned out over seasons independently, with no concurrency bound and no way to tell a complete fetch from a partial one. The second half matters most: `AGENTS.md` section 9 forbids establishing completion on partial metadata, and the module gave a caller no way to know. `getShowEpisodes` was added with an explicit `complete` flag and `failedSeasonNumbers`, so the rule is enforceable rather than aspirational. This was the most valuable finding in the review.

**AC-9 was too blunt.** "A missing required field raises, nothing partial is returned" is right at the top level and wrong inside an array. TMDB is inconsistent at the item level, and one uncredited cast member would have failed an entire movie page. The rule now differs by level and by collection: a malformed cast member is dropped, an episode is never dropped because a missing episode silently corrupts a progress count, and only the three episode identity fields stay required. `Episode.name` became nullable as a result.

**AC-23 was probably unachievable.** `use cache` is a compiled directive tied to Next's pipeline, so calling the exported reads from a plain test runner with no network might have thrown or silently done nothing. Every read is now an inner uncached function plus a thin cached wrapper, which makes the logic testable without Next's transform and costs nothing at runtime.

The remaining seven were smaller but real: the claim that the TV season list is appended was simply wrong, since `/3/tv/{id}` returns `seasons` natively; no image size was pinned per field, leaving four constants for the builder to invent; the pagination probe task traced to no acceptance criterion and drove no behaviour, so it moved to Follow-up; nothing exported a shared `not_found` to `notFound()` helper, so several pages would each have hand rolled one; the retry attempt count was implied rather than pinned at 3; no invariant warned against Zod's `.strict()`, which would have silently broken AC-8; and the concurrency cap was described as if it protected against the rate limit when it is per process, which on serverless does not bound the fleet. That last one is now named as an accepted gap in Consequences rather than glossed over.

## References

**Project sources** (verifiable, in this repo):
- `AGENTS.md` section 3, English first metadata and honest handling of missing data
- `AGENTS.md` section 5, the requirement for a server only TMDB module with normalized responses, caching and error handling
- `AGENTS.md` section 10, the warning that search and discovery endpoints differ and that counts must stay truthful
- `AGENTS.md` section 11, secrets in environment variables, a committed `.env.example`, and private responses kept out of shared caches
- `AGENTS.md` section 12, rate limits, missing images, incomplete episode data and the ban on an indefinitely cached catalog
- `AGENTS.md` section 13, the check that secrets are absent from browser bundles and the ban on passing a mock only check off as a live integration result
- Spec [0001](../0001-user-tracking-schema-and-rls/index.md), which stores no catalog data, defers the TMDB response shape to this spec, and records the N+1 on list screens as its largest tradeoff
- The `next-cache-components-adoption` skill at `.agents/skills/next-cache-components-adoption/`, which sets the adoption sequence and confirms Next.js 16.3 or later is required
- The `next-dev-loop` skill at `.agents/skills/next-dev-loop/`, used to verify each strand in the running app rather than only in the type checker
- The Next.js documentation bundled at `node_modules/next/dist/docs/`, read directly for the installed 16.3.5 rather than from memory: the caching guide, the `use cache` directive reference and the `cacheLife` profile table
- `package.json`, confirming Next.js 16.3.5, React 19.2.8 and pnpm
- `next.config.ts` and `tsconfig.json`, confirming no `cacheComponents` flag today and the `@/*` alias mapping to the repo root

**Practices & standards**:
- Validate external data at the trust boundary, not at the point of use
- Anti corruption layer: an external system's naming and semantics stop at a translation layer rather than spreading through the domain
- Fail fast on configuration: a missing credential should break at startup, not at first request
- Bounded retry with backoff and jitter, and never retrying a deterministic failure such as a 401 or a 404
- Timeouts on every outbound call, because an unbounded request is an unbounded render
- Bulkhead: cap concurrency against a rate limited dependency rather than fanning out freely
- Never log credentials, and log failures rather than successes
- Prefer absence over a substituted default when reporting external data

**Links** (web verified during this spec's research):
- TMDB authentication: https://developer.themoviedb.org/docs/authentication-application
- TMDB rate limiting: https://developer.themoviedb.org/docs/rate-limiting
- TMDB movie details: https://developer.themoviedb.org/reference/movie-details
- TMDB TV series details: https://developer.themoviedb.org/reference/tv-series-details
- TMDB TV season details: https://developer.themoviedb.org/reference/tv-season-details
- TMDB search movie: https://developer.themoviedb.org/reference/search-movie
- TMDB discover movie: https://developer.themoviedb.org/reference/discover-movie
- TMDB configuration details: https://developer.themoviedb.org/reference/configuration-details
- TMDB API terms of use: https://www.themoviedb.org/api-terms-of-use
- TMDB logos and attribution: https://www.themoviedb.org/about/logos-attribution
