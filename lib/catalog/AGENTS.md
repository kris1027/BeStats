# lib/catalog

Pure catalog helpers: ID and `page` param parsing (`ids.ts`, also used by `proxy.ts`), media type params and link builders (`media-type.ts`), library page routes and names (`library-list.ts`, `library-metadata.ts`), and the movie and game page classifiers. Nothing here imports `server-only`, so the proxy and tests can use it; the same holds for `lib/format.ts`.

## Media types

- `MediaType` is `movie | tv`; `LibraryType` is `MediaType | "game"`. Every TMDB read takes `MediaType`, so narrow `game` away first; title pages and the proxy never receive it.
- The navbar's SHOWS | MOVIES | GAMES tabs filter every page ([prompts/media-tabs-everywhere.md](../../prompts/media-tabs-everywhere.md)). The library routes (`LIBRARY_PATHS`) and `/search` take their type from `?type=`: a bare `/search` means `tv`, a bare library route its first tab (`parseLibraryPageType`, `defaultLibraryTypeAt`), and an invalid value shows a "That page doesn't exist" panel, never a redirect.
- All parsing and URL building lives here. Write `type` on every link: `libraryHref` for any library link (a shows or movies link to a games only page lands on that tab's first page, through `libraryPath`), `libraryTabSwitchHref` for a tab switch on a library route (it keeps the matching page), `typedHref` for `/search` only.
- `CATALOG_PATHS`, `CATALOG_SOURCES` and the list registry cover `game` too (spec 0028).
- `useSearchParams` is read only on the library routes and `/search`, inside its own Suspense boundary; anywhere else it costs `/shows`, `/movies` and the title pages their prerendered shells (see [components/AGENTS.md](../../components/AGENTS.md)).

## Library pages

Each library page has a route named for it ([prompts/library-page-urls.md](../../prompts/library-page-urls.md)):

| Tab | Pages, in nav order |
|---|---|
| Shows | `/up-next`, `/upcoming`, `/watched` |
| Movies | `/watchlist`, `/coming-soon`, `/watched` |
| Games | `/coming-soon`, `/want-to-play`, `/playing`, `/finished` |

- Tabs that name a page alike share its route, and `?type` picks the tab. A tab with no page at a route gets the "doesn't exist" panel.
- `LibraryPageKey` (`watchlist`, `upcoming`, `watched`, `coming-soon`) names the logical page. Only `LIBRARY_PAGE_PATHS` writes a route; `libraryPageAt(path, type)` finds the page for a route.
- A page's visible name comes only from `libraryPageName` (shows: Up next, Upcoming, Watched; movies: Watchlist, Coming soon, Watched; games: Coming soon, Want to play, Playing, Finished), so the nav, `<h1>` and `<title>` agree and a games tab never reads Watchlist, Upcoming or Watched. Write a page name only through it ([prompts/library-page-names.md](../../prompts/library-page-names.md)). The heading streams through a Suspense-wrapped reader so the shell stays prerendered.
- The old shared URLs (`/watchlist?type=game` and four more) are temporary redirects, `legacyLibraryRedirects`, wired in `next.config.ts`.
- Which page a title is on: [lib/tracking/AGENTS.md](../tracking/AGENTS.md).
