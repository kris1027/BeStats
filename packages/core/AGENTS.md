# packages/core

`@bestats/core`: the pure rules, Zod schemas, shared types and constants that the web app and the mobile app both run, so the two can never disagree (spec [0033](../../docs/specs/0033-mobile-app-expo/index.md), child [0034](../../docs/specs/0033-mobile-app-expo/0034-monorepo-shared-core.md)). It ships TypeScript source with no build step; `apps/web` lists it in `transpilePackages`.

## Rules

- **Pure only.** No file under `src/` imports `server-only`, `next`, `react`, `react-native`, `expo*` or `@supabase/*`, or reads `process.env`; the only dependency is `zod`. `src/purity.test.ts` fails otherwise. A rule that needs a session, a catalog read or a framework stays in `apps/web`, and only its pure half comes here.
- **A rule lives in one package.** Move a file here (with `git mv` and its test) when both apps need it; never copy it, and leave no re-export behind in the web.
- **Layout mirrors the web's old `lib/`**: `src/tracking/schemas.ts` is imported as `@bestats/core/tracking/schemas` (the `"./*"` export). There is no barrel. Inside core, files import each other by relative path; the `@/*` alias is the web's.
- Tests sit beside their files and run in core's own Vitest (`pnpm test` runs every package). A test that reads a repo file resolves it from its own file.

## API contracts

`src/api/v1/` holds the `/api/v1` contracts both apps parse with: `version.ts` (`MIN_APP_VERSION`, `checkAppVersion`, the header name), `errors.ts` (every v1 error code, its status and English copy), and one file per resource (`movie.ts`, `show.ts`, `titles.ts`, `config.ts`), plus `cleared.ts`, the one `ClearedState` union every restore route takes (`restoreBodySchema(kind)` refuses other kinds; its `season` member adds `seasonNumber` so the route can bind it to `{n}`). Each write's success body has an `…OkSchema` beside its error table, the `ok` half of the action's result. A body that is a union of objects uses `z.strictObject` members, since a plain member strips the other member's keys and turns a combined request into a silent partial success. Image sizing for both apps is `src/images/image-url.ts` (`sizeImageUrl`, `imageUrlForWidth`), with `TMDB_IMAGE_BASE` and its width ladder in `src/tmdb/images.ts`. `/api/v1` is frozen once the first store build ships, so a breaking change goes to a new `api/v2/` folder, never into these files (spec 0035, Versioning).

## Generated files

- `src/supabase/database.types.ts`: written by `pnpm db:types` from the local schema and checked by `pnpm db:types:check`. Never edit it; Biome skips it.
- `src/tokens.generated.ts`: written by `pnpm tokens` (`scripts/tokens.ts`) from the `@theme` and `:root` blocks of `apps/web/app/globals.css`, which stays the one place a colour is written. Run `pnpm tokens` after changing a token; `src/tokens.test.ts` fails while the copy is stale. Biome skips it and the colour boundary test allows exactly this file.

## Legal text

`src/legal/operator.ts` (operator facts, `IGDB_ATTRIBUTION`, `PROCESSORS`, `LEGAL_LAST_UPDATED`) and `src/legal/attribution.ts` (`TMDB_ATTRIBUTION`) are the only homes of those strings; `apps/web/lib/legal/boundary.test.ts` checks it.
