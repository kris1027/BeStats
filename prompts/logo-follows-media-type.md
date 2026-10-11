# Logo follows the media type

## Goal

The BeStats logo in the navbar always links to `/shows`. Make it link to the popular page for the current page's media type: `/movies` on movie pages and `/shows` on TV pages. On a page with no type, it links to the type you last viewed.

## Inspected code

- `components/layout/navbar.tsx`: the logo is a Server Component `<Link href="/shows">`.
- `components/layout/media-type-tabs.tsx` and `components/layout/page-media-type.tsx`: the tabs read the type through `WithPageMediaType`. The type comes from the path on `/shows`, `/movies` and title pages, and from `?type=` on `/watchlist`, `/upcoming`, `/watched` and `/search`. Any other page has a null type.
- `lib/catalog/media-type.ts`: `CATALOG_PATHS` and `mediaTypeForLocation`.
- `components/AGENTS.md`: the shell's client boundary list, the "selection comes from the URL" rule, and the Suspense rule for dynamic routes.
- `components/layout/navbar.test.tsx`: it asserts that the logo goes to `/shows`.

## Skills used

None needed. This is a client navigation change that uses the existing patterns.

## Decisions (settled in the grilling session, 2026-10-11)

1. **Typed page:** the logo goes to `CATALOG_PATHS[type]`. That covers `/movies`, `/movies/{id}`, `?type=movie` and the TV equivalents.
2. **Page with no type** (`/account`, `/privacy`, `/terms`, `/sign-in`, …): the logo goes to the last type viewed. That type is kept in `localStorage` under the key `bestats:last-media-type`. It falls back to `/shows` when nothing is stored, when storage throws, or when the stored value is invalid. A cookie was rejected because the server would have to read it, and that would take every route out of its prerendered shell.
3. **Tabs:** no change. They already follow the URL. (Superseded on 2026-10-11 by [hide-tabs-without-type.md](hide-tabs-without-type.md): on pages with no type the tabs are no longer rendered.)
4. **The bare `/`** still redirects to `/shows` (`next.config.ts`).
5. **Mobile:** one logo serves both layouts, so mobile needs no extra work.

## Expected files

- `components/layout/brand-link.tsx` (new, `"use client"`): `BrandLink` uses `WithPageMediaType`.
  - On a typed page, it writes the type to `localStorage` in an effect and links to `CATALOG_PATHS[type]`.
  - On a page with no type, it reads the stored type with `useSyncExternalStore`. The server snapshot is `null`, so the server renders `/shows` and there is no hydration mismatch.
  - Every storage read and write is wrapped in try/catch, and the value is parsed with the existing `z.enum` via `parseMediaTypeParam`, treating null as absent.
  - The typed page fallback, before the query is known, uses `CATALOG_PATHS.tv`.
- `components/layout/navbar.tsx`: replace the logo `Link` with `BrandLink` inside its own `Suspense` boundary. The fallback is the same link pointing at `/shows`, so `/movies/[id]` keeps its static shell.
- `components/layout/brand-link.test.tsx` (new): the tests below.
- `components/layout/navbar.test.tsx`: update the logo assertion.
- `components/AGENTS.md`: add `layout/brand-link.tsx` to the client boundary list. Note that the logo's remembered type is its only per-browser convenience, and that it never lights a tab.

## Requirements and acceptance criteria

- AC-1: On `/movies`, `/movies/{id}`, `/watchlist?type=movie` and `/search?type=movie`, the logo's href is `/movies`.
- AC-2: On `/shows`, `/shows/{id}`, `/watchlist` and `/watchlist?type=tv`, the logo's href is `/shows`.
- AC-3: Visiting a movie page and then `/account` gives the logo an href of `/movies`. Visiting a TV page and then `/account` gives `/shows`.
- AC-4: With empty, invalid or throwing storage, a page with no type links the logo to `/shows`.
- AC-5: `/shows`, `/movies` and `/movies/{id}` still prerender, with the same build output route markers as before.
- AC-6: The tabs behave exactly as before. (Superseded by [hide-tabs-without-type.md](hide-tabs-without-type.md): the tabs are hidden on pages with no type.)

## Security considerations

- Only `tv` or `movie` is stored, and the value is validated on read.
- No user data is stored and no server reads the value.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`. Compare the route table's static and partial prerender markers for `/shows`, `/movies` and `/movies/[id]` with `main`.

## Manual test steps

1. Run `pnpm dev` and open `/movies`. Click the logo: you land on `/movies`.
2. Open a movie, then click the logo: `/movies`.
3. Click the SHOWS tab, then the logo: `/shows`.
4. Go to `/watchlist?type=movie` (signed in), then click the logo: `/movies`.
5. With MOVIES as the last tab you used, open `/privacy`. Click the logo: `/movies`.
6. In a private window, open `/privacy` directly. Click the logo: `/shows`.
7. Repeat steps 1 and 5 at mobile width.
