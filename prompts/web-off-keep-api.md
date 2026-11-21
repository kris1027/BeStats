# Website off, mobile API on

## Goal

Stop the Vercel Hobby plan limits from being hit by switching the public website off, while `/api/v1` keeps serving the iPhone app. The owner now uses only the mobile app (2026-11-21).

## Inspected

- `docs/deploy.md` section 5 and `prompts/crawl-budget-cut.md`: on 2026-10-28 crawlers made 99.5% of requests and pushed Fluid Active CPU past the Hobby limit of 4 hours, because each title page renders its content in a function. Firewall today: one custom rule (`Rate limit api search`, rate limit) and the managed AI Bots ruleset on Deny (`vercel firewall overview`).
- The current limit couldn't be read: the Vercel connector isn't authorized for the team, and `vercel usage` has no billing data on Hobby. The plan assumes the same cause as last time: page renders, mostly from crawlers.
- `apps/mobile/src`: the app calls only `${EXPO_PUBLIC_API_BASE_URL}/api/v1/...` (`src/lib/api.ts`); it links to no website page. Sign in goes straight to Supabase.
- `apps/web/app/robots.ts` and `robots.test.ts`, `app/sitemap.ts`, `lib/seo/AGENTS.md`, `proxy.ts` matcher (skips `api/`).
- `apps/web/public`: only `tmdb-logo.svg` and `igdb-logo.svg`.

## Skills used

None beyond the repo rules: no Supabase, cache or route shape change.

## Decisions and assumptions

1. **User's choice: block all pages** (not just crawlers, and no notice page). A Vercel Firewall custom rule denies every request except an allow list. A denied request gets `403` at the edge and runs no function, so neither crawlers nor visitors cost Active CPU.
2. **Allow list** (everything else answers `403`):
   - paths starting with `/api/` (the mobile app's `/api/v1`, plus `/api/search`, which keeps its rate limit),
   - `/privacy` and `/terms` (the legal pages stay reachable, needed later for the store listing), plus what they load: paths starting with `/_next/`, `/favicon.ico`, `/tmdb-logo.svg`, `/igdb-logo.svg`,
   - `/robots.txt`, so crawlers read "disallow everything" and stop asking.
3. **robots.txt disallows everything on every deployment and names no sitemap.** Crawlers that obey stop requesting pages, so even the blocked `403`s fade. `app/sitemap.ts` stays in the code but is no longer linked from robots and is blocked by the firewall. Removing it is a later cleanup if the website stays off.
4. **Reversible.** Turning the website back on means disabling the firewall rule (`vercel firewall rules disable`) and reverting the robots change. No data or account is touched.
5. One firewall rule is enough. Hobby allows deny rules beside the existing rate limit. If the CLI refuses a second custom rule, I stop and report back. I won't remove the rate limit rule.

## Expected files

- `apps/web/app/robots.ts`: always `{ rules: { userAgent: "*", disallow: "/" } }`. JSDoc says why.
- `apps/web/app/robots.test.ts`: assert disallow everything and no sitemap on production too; drop the production-allows cases.
- `apps/web/lib/seo/AGENTS.md`: replace the crawl budget rule's present tense with the new state (website off, robots shuts crawlers out). `crawl.ts` stays, now unused by robots, and is noted as kept for a reopening.
- `docs/deploy.md` section 5: the new rule, its exact CLI, how to check it, how to undo it.
- `docs/scope/scope.md` if it lists the website as live (one line).

## Remote change (part of this plan)

```sh
vercel firewall rules add "Website off, API on" \
  --condition '{"type":"path","op":"pre","value":"/api/","neg":true}' \
  --condition '{"type":"path","op":"pre","value":"/_next/","neg":true}' \
  --condition '{"type":"path","op":"eq","value":"/privacy","neg":true}' \
  --condition '{"type":"path","op":"eq","value":"/terms","neg":true}' \
  --condition '{"type":"path","op":"eq","value":"/robots.txt","neg":true}' \
  --condition '{"type":"path","op":"eq","value":"/favicon.ico","neg":true}' \
  --condition '{"type":"path","op":"eq","value":"/tmdb-logo.svg","neg":true}' \
  --condition '{"type":"path","op":"eq","value":"/igdb-logo.svg","neg":true}' \
  --action deny --yes
vercel firewall publish --yes
```

Applied right after the robots change is merged and deployed, so robots.txt already says disallow when pages start answering `403`.

## Requirements

- `GET /api/v1/...` from the app keeps answering exactly as before.
- Every other page (`/`, `/movies`, `/shows/1399`, `/games/2554`, `/search`, `/sign-in`, `/watchlist`) answers `403` without running a function.
- `/privacy`, `/terms` and `/robots.txt` still answer `200`.

## Security considerations

- Nothing private is exposed. The private pages are blocked too, and `/api/v1/me` still checks the bearer token and RLS as before.
- No secret or env change. The rule matches paths only, never headers or IPs.

## Acceptance criteria

- `curl -s -o /dev/null -w '%{http_code}' https://bestats-app.vercel.app/movies` gives `403`; the same for `/`, `/shows/1399`, `/games/2554`, `/sign-in`.
- `/api/v1/lists/tv/trending` with `X-BeStats-App-Version: 1.0.0` gives `200`.
- `/privacy`, `/terms`, `/robots.txt` give `200`; robots.txt reads `Disallow: /` with no Sitemap line.
- BeStats Personal on the iPhone still loads Home, Search and the Library.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test` (robots tests), `pnpm build` (a route's output changes).

## Manual test steps

1. Open `https://bestats-app.vercel.app/movies` in a browser: a Vercel `403` page.
2. Open `https://bestats-app.vercel.app/privacy`: the privacy page shows normally.
3. Open BeStats Personal on the phone, on mobile data: Home, Search, a title and the Library load. Mark something and undo it.
4. A day later, check the Vercel dashboard's Firewall tab: blocked requests counted under the new rule, Active CPU flat.
