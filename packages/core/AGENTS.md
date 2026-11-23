# packages/core

`@bestats/core`: the pure rules, Zod schemas, shared types and constants that the web app and the mobile app both run, so the two can never disagree (spec [0033](../../docs/specs/0033-mobile-app-expo/index.md), child [0034](../../docs/specs/0033-mobile-app-expo/0034-monorepo-shared-core.md)). It ships TypeScript source with no build step; `apps/web` lists it in `transpilePackages`.

## Rules

- **Pure only.** No file under `src/` imports `server-only`, `next`, `react`, `react-native`, `expo*` or `@supabase/*`, or reads `process.env`; the only dependency is `zod`. `src/purity.test.ts` fails otherwise. A rule that needs a session, a catalog read or a framework stays in `apps/web`, and only its pure half comes here.
- **A rule lives in one package.** Move a file here (with `git mv` and its test) when both apps need it; never copy it, and leave no re-export behind in the web.
- **Layout mirrors the web's old `lib/`**: `src/tracking/schemas.ts` is imported as `@bestats/core/tracking/schemas` (the `"./*"` export). There is no barrel. Inside core, files import each other by relative path; the `@/*` alias is the web's.
- Tests sit beside their files and run in core's own Vitest (`pnpm test` runs every package). A test that reads a repo file resolves it from its own file.

`src/brand/mark.ts` holds the BeStats mark's geometry and launch timeline as plain numbers (no colours; those are the `color-background` and `color-brand-mark` tokens), so the mobile icon PNGs and the app's launch animation never drift apart.

## API contracts

`src/api/v1/` holds the `/api/v1` contracts both apps parse with: `version.ts` (`MIN_APP_VERSION`, `checkAppVersion`, the header name), `errors.ts` (every v1 error code, its status and English copy), and one file per resource (`movie.ts`, `show.ts`, `game.ts`, `profile.ts`, `titles.ts`, `browse.ts` for genres, search and lists, `library.ts`, `config.ts`, `account.ts` for the delete body; `V1_PAGE_SIZE` in `browse.ts` equals the web grid's 24, so app page N is web page N), plus `cleared.ts`, the one `ClearedState` union every restore route takes (`restoreBodySchema(kind)` refuses other kinds; its `season` member adds `seasonNumber` so the route can bind it to `{n}`). Each write's success body has an `…OkSchema` beside its error table, the `ok` half of the action's result. A body that is a union of objects uses `z.strictObject` members, since a plain member strips the other member's keys and turns a combined request into a silent partial success. Image sizing for both apps is `src/images/image-url.ts` (`sizeImageUrl`, `imageUrlForWidth`), with `TMDB_IMAGE_BASE` and its width ladder in `src/tmdb/images.ts`. `/api/v1` is frozen once the first store build ships, so a breaking change goes to a new `api/v2/` folder, never into these files (spec 0035, Versioning).

## Generated files

- `src/supabase/database.types.ts`: written by `pnpm db:types` from the local schema and checked by `pnpm db:types:check`. Never edit it; Biome skips it.
- `src/tokens.generated.ts`: written by `pnpm tokens` (`scripts/tokens.ts`) from the `@theme` and `:root` blocks of `apps/web/app/globals.css`, which stays the one place a colour is written. It also holds `TOKENS_SRGB` (each oklch token as sRGB hex, since React Native cannot draw oklch) and `GLASS` (the glass utilities' gradients and shadow, read from their `@utility` rules). Run `pnpm tokens` after changing a token; `src/tokens.test.ts` fails while the copy is stale. Biome skips it, and the colour boundary test exempts it plus `scripts/tokens.ts` and `src/tokens.test.ts`, which parse oklch to convert it.
- `apps/web/public/.well-known/apple-app-site-association` and `assetlinks.json`: written by `pnpm app-links --apple-team-id <id> --android-sha256 <fp>` (`scripts/app-links.ts`) from the builders in `src/links/app-links.ts`, whose `isAppLinkPath` is also the app's incoming link rule and whose `APP_BUNDLE_ID` must equal `app.json`. `src/links/app-links.test.ts` fails when a committed file drifts from the builders. The script imports `.ts` paths, hence `allowImportingTsExtensions`.

## Legal text

`src/legal/operator.ts` (operator facts, `IGDB_ATTRIBUTION`, the legal page paths and labels the web footer and the app's About share, `PROCESSORS`, `LEGAL_LAST_UPDATED`) and `src/legal/attribution.ts` (`TMDB_ATTRIBUTION` for the web, `TMDB_APP_ATTRIBUTION` for the app, both from one template sentence) are the only homes of those strings; `apps/web/lib/legal/boundary.test.ts` checks it, and checks that `docs/store-privacy-labels.md` names every processor and records the current `LEGAL_LAST_UPDATED`.
