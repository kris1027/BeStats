# Close the image optimizer

## Goal

Stop Vercel Image Optimization from running any transformation for BeStats.
PR #48 (prompts/tmdb-image-loader.md) moved every `next/image` onto a custom
loader, so no page renders a `/_next/image` URL any more. The endpoint itself
is still open, though, and anything holding an old URL (HTML cached before
2026-10-17, image search indexes, bots) still costs transformations. Close it
in the config so it rejects every request.

## Inspected

- `next.config.ts`: `images.loader: "custom"`, `loaderFile:
  "./lib/tmdb/image-loader.ts"`, and `remotePatterns` for
  `image.tmdb.org/t/p/**`, kept as "the record of the one image host". No
  `localPatterns`.
- `next.config.test.ts`: "allows TMDB images and nothing else" asserts that
  `remotePatterns` entry; "loads images through the TMDB loader" asserts the
  loader.
- Every `next/image` import (13 components plus `lib/tmdb`) goes through the
  loader; `components/layout/site-footer.tsx` renders the TMDB logo
  `unoptimized`. `app/opengraph-image.tsx` uses `ImageResponse`, which is not
  Image Optimization.
- Production (`bestats-sable.vercel.app`, 2026-10-19): `/shows`, `/movies`,
  `/shows/1399`, `/movies/550`, `/search`, `/shows/popular` and `/privacy`
  contain no `/_next/image` URL; every image is `image.tmdb.org/t/p/w…`.
- Production `/_next/image` is still live:
  - `?url=https://image.tmdb.org/t/p/w500/…&w=640` → `200 image/jpeg`,
    `x-vercel-cache: MISS` (a fresh transformation).
  - `?url=/opengraph-image&w=640` → `200 image/png`.
  - `?url=/favicon.ico&w=64` → `200 image/x-icon`.
- `node_modules/next/dist/server/image-optimizer.js` and
  `shared/lib/match-local-pattern.js`: a remote URL needs a `remotePatterns`
  (or `domains`) match; an undefined `localPatterns` allows **every** local
  path, while an empty array allows none. `build/index.js` writes
  `remotePatterns` to the build output as `[]` when unset, which is what
  Vercel's optimizer reads.

## Skills used

None of the installed skills cover image config; the Next.js docs in
`node_modules/next/dist/docs/` and the Next source above were read instead.

## Decisions (settled in the grilling session, 2026-10-19)

1. Remove `remotePatterns` and set `localPatterns: []`, so the optimizer
   accepts no remote and no local source. The loader does not need either.
   `localPatterns` was not raised in the session; it closes the local half of
   the same endpoint, found while checking the fix.
2. Rewrite the `images` comment in `next.config.ts`: the TMDB host is recorded
   by `TMDB_IMAGE_BASE` in `lib/tmdb/constants.ts`, not by the config.
3. Replace the `remotePatterns` test with a guard that fails if the config
   brings back `remotePatterns`, `domains` or a non empty `localPatterns`, or
   drops the custom loader.
4. Update the docs that call `image.tmdb.org` the allowed remote pattern:
   `AGENTS.md` (commands and repo facts) and a dated note in
   `prompts/tmdb-image-loader.md`. Specs 0002 and 0004 stay as they are; they
   record what was built then.
5. Leave old deployments alone. Each keeps its own config, so deployments
   built before this one keep an open endpoint at their hashed URLs. Check
   usage a few days after the fix; if transformations keep coming in, list them
   and delete with approval.

## Expected files

- `next.config.ts`
- `next.config.test.ts`
- `AGENTS.md`
- `prompts/tmdb-image-loader.md` (one dated line)
- `prompts/close-image-optimizer.md` (this file)

## Requirements and acceptance criteria

- **AC-1**: `nextConfig.images` has `loader: "custom"`, the TMDB `loaderFile`,
  `localPatterns: []`, and no `remotePatterns` or `domains`.
- **AC-2**: Every page still renders its TMDB images, and the footer logo, as
  before (the loader and `unoptimized` paths are unchanged).
- **AC-3**: On the deployed build, `/_next/image` returns a 4xx, not 200, for a
  TMDB URL, `/opengraph-image` and `/favicon.ico`.
- **AC-4**: `next.config.test.ts` fails if AC-1 is broken.

## Security considerations

Shrinks surface: the endpoint no longer fetches any remote URL for the
server. No secrets, auth or user data are touched.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.

## Manual test steps

1. `pnpm build && pnpm start`, open `/shows`, `/movies/550`, `/shows/1399`:
   posters, backdrops, cast and stills load from `image.tmdb.org` (Network tab),
   with no `/_next/image` request; the footer TMDB logo shows.
2. Locally:
   `curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:3000/_next/image?url=%2Ffavicon.ico&w=64&q=75'`
   returns 400.
3. After the PR's production deploy, repeat for
   `https://bestats-sable.vercel.app/_next/image?url=` with
   `https%3A%2F%2Fimage.tmdb.org%2Ft%2Fp%2Fw500%2F1XS1oqL89opfnbLl8WnZY1O1uJx.jpg&w=640&q=75`,
   `%2Fopengraph-image&w=640&q=75` and `%2Ffavicon.ico&w=64&q=75`: each returns
   4xx.
4. A few days later, check Image Optimization usage in the Vercel dashboard
   has stopped growing.

## Delivery

Branch `feat/close-image-optimizer`, small conventional commits, a PR with
labels, assignee and the BeStats project status In review.
