# README: mobile first

## Goal

Make `README.md` describe BeStats as it runs today: an iPhone app (Expo) whose catalog and tracking come from the Next.js project's `/api/v1`. The public website has been switched off since 2026-11-21 (prompts/web-off-keep-api.md). Ships in the same branch and PR as the website-off change (kris1027/BeStats#87).

## Inspected

- `README.md`: web only. Intro, "Live" link (now `403`), four website screenshots from 2026-10-28, web local setup, commands, deployment, and a repo map listing only `apps/web` paths.
- `apps/mobile/AGENTS.md`, `apps/mobile/package.json`, `app.json`, `eas.json`, `app.config.ts` (personal variant), `.env.example`.
- `docs/screenshots/`: the four web images.

## Skills used

`mattpocock-skills:grilling` (decisions below), `expo-dev-client` for the Simulator run.

## Decisions (user, 2026-11-21, all accepted as recommended)

1. Auto-merge on #87 paused while the README lands, then queued again. (Done: paused.)
2. Lead with the iPhone app. The Next.js project is presented as its API. The "Live" link is replaced by one line: the website was switched off on 2026-11-21 to stay within Vercel's Hobby plan, and `/api/v1` keeps serving the app.
3. Replace the four web screenshots with four iOS Simulator screenshots captured by me: Shows Home, a show's title page, Search with a filter, and Library Up next. They sit in one row, with a "captured on 2026-11-21 in the iOS Simulator" note. The four web images are deleted.
4. Mobile setup covers three ways to run, a few lines each, linking `apps/mobile/AGENTS.md`: the Simulator development build; Expo Go over Wi‑Fi (`.env.development.local` with `http://<your-mac-ip>:3000`, `ipconfig getifaddr en0`); the free personal Release build (`APP_VARIANT=personal`, reinstall every 7 days).
5. Platforms: iOS is tested; Android is configured but untested.
6. Web local setup, commands and deployment stay, reframed as "the web project and its API". Mobile commands join the table.
7. Repository map adds `apps/mobile/`, `packages/core/` and `scripts/`.
8. #87 is retitled "feat: website off, mobile-first README" and its summary covers the README.
9. The Library screenshot uses the local seed user `user-a@example.test`, with titles tracked only in the local database. `supabase db reset` afterwards, so pgTAP starts from a clean seed. Never the production account.

## Expected files

- `README.md`
- `docs/screenshots/`: four new `mobile-*.jpg`, four web `.jpg` removed.

## Security considerations

- No credentials in the README beyond the existing local-only seed users table. No real IP address and no production account data.

## Acceptance criteria

- The README describes the app first, says the website is off, and has no link that answers `403` as if it were live.
- Every command shown runs as written from the stated folder.
- The four screenshots show real TMDB and IGDB content from the running app.

## Automated checks

`pnpm lint` (no code change; the README is outside Biome but the run proves nothing else moved). Image files are checked to load locally.

## Manual test steps

1. Open README.md on the PR's Files tab: the intro, the website-off note, the screenshot row and the setup sections read correctly.
2. Follow "Run on the iOS Simulator" from a clean shell: the app opens.
