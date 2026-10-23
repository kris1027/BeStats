# 0025. Game page (tracer): rationale

The decision record behind [index.md](index.md). `/develop` builds from the index; this file says why.

## Context

G1 gave the app a trusted, cached way to read one game (`getGame`), and G2 gave it a private table for game statuses. No page shows a game yet. The games scope is built Tracer Bullet: the first thin thread has to prove that an IGDB game reaches a real, shipped page through every layer the movie page already uses (the proxy, the route, the cached read, the hero, the image pipeline and the metadata). Everything richer (summary, screenshots, similar games, Facts) waits for G9, and the status control waits for G4.

Several forces shape it. The image optimizer is closed (prompts/close-image-optimizer.md): every `next/image` goes through one global custom loader file, `lib/tmdb/image-loader.ts`, which hands back any URL that is not TMDB's unchanged, so an IGDB cover would load at whatever size its URL names. G1 pins covers to `t_cover_big` (264px wide), while the movie hero draws its poster 240px wide on desktop, so a retina screen would want about 480px. A Server Component cannot pass a loader function to `next/image`, so a per image loader prop is not available from the page.

The catalog filter hides DLC, bundles, mods, editions and the Erotic theme, yet a read by id still returns such a game with `hidden: true`, so a user's list can keep it. The page has to decide what a visitor sees for one. The proxy answers a malformed movie or show id with a real 404 before streaming starts, and the page itself can only give a soft 404 once it has streamed; games need the same split. The GAMES tab stays hidden until G5 and game pages join the sitemap only in G10, so G3 must not invite search engines in early. `/games` itself does not exist until G6, so a not found panel cannot point there yet.

## Options considered

### Option 1: Hero only page on the shared `DetailHero`, host dispatching loader, live with `noindex`

Build `/games/[id]` like `/movies/[id]`: a Suspense shell, a `loadGame` that sorts found, not found and failed, and a thin `GameHero` over `DetailHero`. `DetailHero` gains a rating slot and a fallback icon, so it stops assuming TMDB. One loader file dispatches by host. The page is reachable in production but `noindex` until G10.

**Pros**:
- Every pattern is already proven on two pages: proxy 404, soft 404, retry panel, prerendered shell.
- G4 drops its control into the existing `tracking` slot; G9 adds sections below the hero.
- One loader file keeps the closed optimizer rule intact and gives each host its own ladder.

**Cons**:
- `DetailHero`'s props change, so the movie and show heroes and their tests move with it.
- The page exists in production before anything links to it; anyone guessing a URL can open it.

### Option 2: Fuller first page with an artwork backdrop

The same route, but extend G1 with IGDB `artworks` and render the faded backdrop like the movie page.

**Pros**:
- Looks complete from day one.

**Cons**:
- Grows the tracer and changes G1's fields, query and fixtures for a visual, not a proof.
- Many games have no artwork, so the no backdrop layout is still needed.

### Option 3: A separate game hero component and a client image wrapper

Write a `GameHero` from scratch and a `GameCoverImage` client component that passes `loader=` per image.

**Pros**:
- Leaves `DetailHero` and the global loader file untouched.

**Cons**:
- Two hero layouts to keep in step, against AGENTS.md section 3 (reuse first, do not redesign).
- Every future IGDB image must remember the wrapper; a plain `next/image` silently loads the pinned size.

### Option 4: Hide game pages in production behind a flag until G5

Same build as Option 1, but a flag answers 404 in production.

**Pros**:
- Nothing about games is reachable early.

**Cons**:
- A flag to add and later remove, and the tracer cannot be checked on the live site.
- `noindex` and no links already keep the page out of sight.

## Rationale

The point of a tracer is to prove the pipe, not to finish the page. The movie and show pages already solved every hard part of a public title page under Cache Components: the proxy's real 404, the soft 404 after streaming, the honest retry panel, the static shell. Reusing them means the only new risk in G3 is IGDB data itself, which is what the tracer is meant to test. A backdrop (Option 2) adds G1 work for looks, and `DetailHero` already has a no backdrop layout for it.

Making `DetailHero` take a rating slot and a fallback icon is a small, local change that stops the shared hero from assuming TMDB, which every later games feature needs anyway. Option 3 would avoid that edit, but at the cost of a second hero and an image rule that depends on memory. The loader question has only one sound answer in this setup: one `loaderFile`, no remote patterns, and function props cannot cross from a Server Component, so a file that dispatches by host is the only way every `next/image` stays covered automatically. Raising G1's pinned cover to `t_cover_big_2x` keeps the TMDB rule (the pinned size is the ceiling) while letting the hero be sharp on retina; the ladder steps down so cards in G5 to G8 stay light.

A hidden game gets the soft 404 because the catalog filter exists to keep those games out of the browsing experience, the same reason an adult movie is not found. A list owner still removes it from its library card (G5, G8). Keeping the page live with `noindex` instead of behind a flag (Option 4) keeps it checkable in production for free, and G10 is already the one place indexing turns on.

The rest of the small calls: platforms are sorted by name because IGDB returns them in no promised order, and a stable line is easier to scan and to test. The full release date is shown because G4's gate uses the exact UTC day, and the page should agree with the gate. The id parser shares the movie rule (canonical digits, at most 2147483647) because G2 stores `game_id` as `integer`; a URL the table cannot hold names no game a user could track. The IGDB rating reuses the amber community colour because amber means "community rating" across the app, while the label and screen reader text say IGDB.
