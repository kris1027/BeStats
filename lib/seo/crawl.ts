/**
 * Game detail and season page prefixes kept away from crawlers
 * (prompts/crawl-budget-cut.md). Googlebot followed game pages out into the
 * IGDB catalog and pushed Vercel Active CPU past the Hobby limit, and Hobby
 * offers no rate limit for it, so robots.txt is the lever. Robots rules match
 * by prefix with no character classes: IGDB ids never start with `0`, so
 * `/games/1` to `/games/9` cover every detail page while `/games` and every
 * `/games/{slug}` list page (all slugs start with a letter) stay crawlable.
 */
export const CRAWL_BUDGET_DISALLOW = [
  ...Array.from({ length: 9 }, (_, index) => `/games/${index + 1}`),
  "/shows/*/season/",
];
