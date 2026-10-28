# Crawl budget cut: keep crawlers off game and season pages

## Goal

Bring Vercel Fluid Active CPU back under the Hobby limit of 4 hours a month. The account is at 4h 21m. Crawlers cause it, not visitors: in the request log for 2026-10-28 14:32 to 16:00 UTC, 10,000 requests reached `bestats`, and 99.5% came from bots (Googlebot 9,080, ClaudeBot 873, possibly human 47). `/games/[id]` got 7,276 of them across 7,266 different ids, `/shows/[id]/season/[number]` 1,341 and `/shows/[id]` 603. Every one is a `partial_prerender` request. Only the skeleton shell is cached, and a function renders the content inside the Suspense boundary (`app/games/[id]/page.tsx:92`). Almost every id is new, so a full page cache would not help.

The crawl started when spec 0032 (G10) made game pages indexable and put 200 popular games in the sitemap (`a25a898`, `0619329`, 2026-10-26). Googlebot then followed links out from those pages into the IGDB catalog.

## Already done (outside this plan, at the user's request)

- Vercel Firewall, project `bestats`: the managed **AI Bots** ruleset is set to **Deny** and published on 2026-10-28. Checked: a ClaudeBot user agent on `/games/2554` gets `403`, and a plain request gets `200`.
- Tried and refused by the Hobby plan: a crawler rate limit on `/games/`, `/shows/` and `/movies/`. Keyed by `header:user-agent`, the API answered "not available for this plan". Keyed by IP, it answered "Rate limiting is not available for this plan", because the plan's one rate limit rule is already `Rate limit api search`. Googlebot therefore can only be steered through `robots.txt`.

## Decision (user, 2026-10-28)

Disallow game detail pages and season pages, which together took about 86% of crawl hits. Keep the landings, the list pages, show pages and movie pages crawlable.

## Inspected

- `app/robots.ts`, `app/robots.test.ts`: production allows `/` and disallows `/api/` and `/auth/`.
- `app/sitemap.ts`, `lib/seo/sitemap.ts`, `app/sitemap.test.ts`: lists 200 game ids from `getPopularGames(POPULAR_GAME_LISTS.popular)`. That read is also why the complete list is capped at `cacheLife("hours")` (spec 0032, AC-11).
- `app/games/`: list pages are `/games/{slug}` (`popular`, `trending`, `top-rated`, `recently-released`, `coming-soon`), and detail pages are `/games/{numeric id}`.
- `lib/seo/AGENTS.md`, `docs/deploy.md` section 5, the root `AGENTS.md` Games section ("Since G10 game pages ... are indexable and in the sitemap").

## Skills used

None needed beyond the repo rules. The change involves no Supabase, cache component or route shape.

## Design

**robots.txt (production branch only).**

```
User-Agent: *
Allow: /
Disallow: /api/
Disallow: /auth/
Disallow: /games/1   …   Disallow: /games/9
Disallow: /shows/*/season/
```

- Robots rules match by prefix and have no character classes. IGDB ids are positive integers, so they never start with `0`. The nine prefixes `/games/1` to `/games/9` therefore block every detail page, while `/games` and every `/games/{slug}` list page (all slugs start with a letter) stay allowed. A test pins that the five current slugs and `/games` are not matched.
- `/shows/*/season/` uses the `*` wildcard, which Google and Bing support. `/shows/{id}` stays crawlable.
- The preview and local branch keeps `disallow: "/"` unchanged.
- Accepted trade-off: a disallowed URL can still show in Google from links alone, without a snippet. Game pages keep their `index` meta, canonical and JSON-LD, so the change is reversed by deleting the robots lines.

**sitemap.xml.** Drop the 200 game ids, because listing URLs that robots.txt disallows sends Search Console a contradiction. The sitemap stops calling `getPopularGames`. `sitemapEntries` loses its `gameIds` argument. The games landing and its five list pages stay listed. `cacheLife` stays `hours` / `minutes` as it is now: the 24 hour IGDB cap no longer applies, but keeping it avoids changing two rules at once.

**Docs.**
- `docs/deploy.md` section 5: record the AI Bots Deny setting, the CLI command that sets it (`vercel firewall rules update ai-bots --action deny --yes` then `vercel firewall publish --yes`), and that Hobby refuses a second rate limit rule.
- `lib/seo/AGENTS.md`: the robots rules and why they exist (CPU budget, 2026-10-28 figures).
- Root `AGENTS.md`, Games section: game pages are still indexable by meta but disallowed in robots.txt and out of the sitemap, per this plan.
- Spec 0032 AC-6 (games in the sitemap) becomes stale. `/sync` flags it after merge, and the spec's amendment belongs to `/architect`. This plan does not edit the spec.

## Expected files

- `app/robots.ts`, `app/robots.test.ts`
- `app/sitemap.ts`, `lib/seo/sitemap.ts`, `app/sitemap.test.ts` (and `lib/seo/sitemap.test.ts` if it exists)
- `docs/deploy.md`, `lib/seo/AGENTS.md`, `AGENTS.md`

## Security

No user data, auth or secrets are touched. robots.txt and the sitemap stay prerendered and read no request state, and the proxy exclusions for both are unchanged.

## Acceptance criteria

1. Production robots.txt disallows `/games/1` to `/games/9` and `/shows/*/season/`, and still disallows `/api/` and `/auth/`.
2. `/games`, `/games/popular`, `/games/trending`, `/games/top-rated`, `/games/recently-released` and `/games/coming-soon` match no disallow rule. `/shows/1399` matches none either. `/games/2554` and `/shows/1399/season/1` each match one.
3. Non production robots.txt is unchanged (`disallow: "/"`).
4. The sitemap lists no `/games/{id}` URL, still lists `/games` and the five game list pages, and makes no IGDB call.
5. Private and sign in pages are still not disallowed (the existing AC-4 test).

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.

## Manual test

1. `pnpm build && pnpm start` with `VERCEL_ENV=production NEXT_PUBLIC_SITE_URL=https://bestats-sable.vercel.app`, then `curl localhost:3000/robots.txt` and check the lines above.
2. `curl localhost:3000/sitemap.xml | grep -c '/games/[0-9]'` prints `0`, and `grep '/games/popular'` finds it.
3. After deploy, open Search Console, run the robots.txt report, and test `/games/2554` (blocked) and `/games/popular` (allowed).
4. Over the following days, Vercel Usage shows Fluid Active CPU per day falling.

## Commits and rollout

Branch `feat/crawl-budget-cut`. Commits: `fix(seo): keep crawlers off game and season pages in robots.txt`, `fix(seo): drop game ids from the sitemap`, `docs: record the AI bots block and the crawl budget rules`. Open the PR with labels, assignee and the BeStats project status In review. Merging deploys to production. Google rereads robots.txt within about a day.
