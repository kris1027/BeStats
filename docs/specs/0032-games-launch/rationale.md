# 0032. Games launch: rationale

## Context

Games G1 to G9 are built and live in code, but production hides them. Every games page sets `robots: { index: false }` with no canonical or share card (spec 0025, AC-10; spec 0028, AC-13), the sitemap lists only movies and shows (`catalogListsFor` keeps game lists out by type), and the GAMES tab and the games library tabs sit behind `NEXT_PUBLIC_GAMES_LIBRARY`, unset in Production (spec 0027). The footer and `/terms` credit TMDB only.

Launching means three things at once: search engines and link previews must see game pages at the quality movies and shows already have (spec 0016), IGDB must be credited as its terms ask (the games scope's settled decision of 2026-10-17 says the credit goes in the footer and on `/terms`, not in the processor list, and that IGDB's terms are checked again before launch), and production must expose the games navigation.

The forces: `lib/seo/` must stay pure and request free, so the prerendered sitemap and static shells survive; no rating of any kind may appear in metadata; every listed URL must be linked from a public page; IGDB allows 4 requests a second per server instance, and a crawl lands on uncached pages; the legal pages must describe only what the code does (spec 0017). The IGDB terms could not be read automatically: `api-docs.igdb.com` and the IGDB FAQ answered 403 to the research fetch, so only search snippets were available.

Not deciding leaves nine finished features invisible in production and no record that BeStats meets IGDB's terms.

## Options considered

### Option 1: One launch release on the existing SEO and legal modules

Extend `catalogMetadata`, `jsonLdScript`, the sitemap and `lib/legal/operator.ts` for games, exactly as movies and shows use them, and delete the flag in the same release.

**Pros**:
- No new pattern; every rule in `lib/seo/AGENTS.md` already covers the new code.
- A visitor from search lands on a site that shows the GAMES tab.
- One fewer flag and one fewer environment difference between Preview and Production.

**Cons**:
- A larger single PR: the flag removal touches many files and tests.
- No kill switch after launch; only a rollback hides games.

### Option 2: Flag first, indexing later

Set `NEXT_PUBLIC_GAMES_LIBRARY=on` in Production now, then open indexing in a second release after watching production.

**Pros**:
- Smaller first change and a chance to watch real traffic before crawlers arrive.

**Cons**:
- Two releases for one launch, and the flag still has to go later.
- A `NEXT_PUBLIC_` change needs a redeploy anyway, so it is no faster than a rollback.

### Option 3: Indexing only, flag stays off

Index games while the navbar keeps hiding them.

**Pros**:
- Smallest change to production navigation.

**Cons**:
- Visitors from search land on pages they can't reach from the menu, and the games library pages answer "That page doesn't exist".

## Rationale

Option 1 wins because every piece of machinery already exists and is tested: canonicals, share cards, escaped JSON-LD and failure isolated sitemap reads are rules in `lib/seo/AGENTS.md`, and games only need their inputs wired in. Splitting the launch (Option 2) buys nothing real, since the flag is a build time `NEXT_PUBLIC_` value and Vercel Instant Rollback undoes a bad release just as fast. Option 3 contradicts itself by inviting search traffic into hidden navigation.

Removing the flag rather than setting it settles what specs 0027 and 0028 planned, and makes Preview and Production render the same app. The share image prefers 16:9 art (share cards are 1200 by 630, and a portrait cover crops badly), mirroring movies' backdrop first rule, while JSON-LD `image` keeps the cover, mirroring movies' poster. `author` and `publisher` come from the companies already shown on the page, so nothing is claimed that the page does not show. The trailer is left out of JSON-LD because Google's `VideoObject` expects a thumbnail and an upload date BeStats doesn't have.

The sitemap uses the first 200 Popular games because that is the exact cached call `/games/popular` makes, so it costs no extra IGDB request and every listed game is linked from a public page, the same rule movies and shows follow. List pages follow the TMDB list rule (index a page that shows results), with one change: a games discover list may have no count, so "has results" decides instead of `totalPages`.

`IGDB_ATTRIBUTION` lives in `lib/legal/operator.ts`, not `lib/igdb/`, because `lib/igdb/index.ts` has a locked export surface (`surface.test.ts`) and components may not import `lib/igdb/constants.ts`; `IGDB_HOME_URL` already sits there for the same reason. Runner up: export it from `lib/igdb/index.ts` and widen the surface test, which pulls a server only module into the footer for a string.

The terms read is manual and gates the deploy because the automated fetch was blocked; shipping on snippets would not meet the scope's "checked again before launch".

## IGDB terms check

Read on 2026-10-26 in a real browser (Playwright driving Chromium, from the agent shell during `/develop`), which the IGDB pages served normally; the earlier 403 was the research fetch only. Worth a quick human pass before the deploy, since the reading was done by the agent.

**IGDB API docs, Getting Started and FAQ** (one page): <https://api-docs.igdb.com/#getting-started>, FAQ at <https://api-docs.igdb.com/#faq>. No last updated date shown.

- Non commercial use: "The IGDB.com API is free for non-commercial usage under the terms of the Twitch Developer Service Agreement." and "We offer commercial partnership for users with a commercial need in their projects. For more details on that process please reach out to partner@igdb.com"
- Price: "The API is free for both non-commercial and commercial projects."
- Caching: "3. Am I allowed to store/cache the data locally? Yes. In fact, we prefer if you store and serve the data to your end users. You remain in control over your user experience, while alleviating pressure on the API itself."
- Attribution (asked of commercial partners): "we ask for user facing attribution to IGDB.com from products integrating the IGDB API." and "4. Regarding user facing attribution (relating to the commercial partnership), any specific guidelines? Not really. We expect fair attribution, i.e. attribution that is visible to your users and located in a static location (e.g. not in a change log)."
- Images: "Images that are removed or replaced from IGDB.com exist for 30 days before they are removed. Keep that in mind when designing cache logic."

**Twitch Developer Services Agreement**: <https://legal.twitch.com/legal/developer-agreement/> (linked from the docs as <https://www.twitch.tv/p/legal/developer-agreement/>). Last modified 11/01/2023, as the page shows it.

- What it covers: "Program Materials: software, software development kits, libraries, application programming interfaces (“APIs”), services, documentation, specifications, sample code, data, metadata, ..." So IGDB data counts as Program Materials.
- Caching: "Do not store copies of Twitch Content or Program Materials, unless you: (a) obtain prior written authorization from Twitch (through these terms or otherwise); (b) control the rights associated with such content; or (c) cache such information for only a twenty-four hour time period without further sharing it with third parties. Re-syndication and re-distribution of Program Materials or data as available from a Twitch API is prohibited. You must use commercially reasonable efforts to cause Your Services to update cached results ..."
- Attribution: "You must ensure that there is a clear path to the source from displays of Program Materials in Your Services. Appropriately attribute uses of Program Materials or Twitch Content."
- Marks: "Use and display Twitch Marks in accordance with the Twitch Trademark Guidelines solely to attribute Twitch’s offerings as the source of the Program Materials as set forth in this Agreement." and "You will not remove, modify, or obscure any copyright, patent, trademark, or other proprietary or attribution notices".

**IGDB Press Kit**: <https://www.igdb.com/press>. Offers "IGDB logo (SVG)", "IGDB logo White (PNG)" and "IGDB logo Black (PNG)". No usage guidelines are stated beside them. The SVG (white on transparent, 114 × 55) is saved unmodified as `public/igdb-logo.svg`, SHA-256 `5269511c541a125f7dd8c71990e0c86ff4a6881be29ad8bd81e1ae4fe83527df`.

**Verdict: BeStats complies, and the launch goes ahead.**

- Non commercial and free: BeStats has no ads, fees or paid tier, so no partnership is needed.
- Attribution: a footer credit on every route is visible and in a static location, and its link to IGDB.com is the "clear path to the source". The press kit logo is shown unmodified, only as that credit.
- Caching: the IGDB FAQ is Twitch's own written permission to store and cache, which meets exception (a). Still, to stay inside the 24 hour clause without leaning on that reading, `getGameGenres` and `getGamePlatforms` drop from `max` to `hours`, the one change AC-11 allows. Every other IGDB read already lives `hours` or less, and nothing from IGDB is stored in Postgres.
- No re-syndication: game data is only displayed on pages; no API, feed or export hands it on.
- Final wording: `IGDB_ATTRIBUTION` stays `"Game data and images from IGDB.com"`. Nothing asks for different text.

## References

**Project sources**:
- `AGENTS.md`, the Games section (credit in footer and `/terms`, terms checked before launch) and the SEO and legal bullets
- `lib/seo/AGENTS.md`, every rule the new metadata, JSON-LD and sitemap code follows
- Spec 0016 (SEO metadata and sitemap), spec 0017 (legal pages, TMDB attribution), spec 0018 (deploy runbook)
- Spec 0025 (game page, soft 404), spec 0027 (games flag), spec 0028 (games landing and lists, the G10 follow up), spec 0031 (developers and publishers)
- `docs/scope/games.md`, settled decisions of 2026-10-17

**Practices & standards**:
- schema.org `VideoGame` for structured data
- Open Graph share images at a wide aspect ratio
- Single source constants guarded by boundary tests

**Links**: the IGDB API docs and FAQ, the Twitch Developer Services Agreement and the IGDB Press Kit, read on 2026-10-26 and listed under *IGDB terms check*.
