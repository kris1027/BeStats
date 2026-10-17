import type { NextConfig } from "next";

import { getAuthEmailDelivery } from "./lib/env";

/**
 * Cache Components is on from the first data feature rather than adopted later
 * as a migration across finished pages (spec 0002, AC-4). Every route from here
 * on must be prerenderable or explicitly opt out with `export const instant =
 * false`, and every cached read calls `cacheLife` inside its own scope.
 *
 * `image.tmdb.org` is the only remote image host: TMDB serves every poster,
 * backdrop, profile and still the app renders, and `lib/tmdb` builds those URLs
 * from a hardcoded base (spec 0002, AC-20).
 */
const nextConfig: NextConfig = {
  cacheComponents: true,
  /**
   * `/` sends people to `/shows` (spec 0004, AC-17).
   *
   * In the routing layer rather than a Server Component, so nothing renders and
   * the question of whether a redirecting component counts as prerendered under
   * `cacheComponents` never arises. Temporary rather than permanent, because a
   * browser caches a 308 effectively forever and a real home page later would
   * be fighting it.
   *
   * `/check-email` goes to `/sign-in` while the deployment sends no email,
   * because there is nothing to check for (spec 0018, AC-13). Decided here at
   * build time, so the page never streams a redirect after a 200. Temporary,
   * because turning email on brings the page back.
   *
   * `/shows?page=N` and `/movies?page=N` go to the Popular list page that now
   * holds that paged grid (spec 0021, AC-14), any value of `page`, with the
   * query string carried over by Next. Permanent on purpose: unlike `/`, a
   * landing with `?page` has no future meaning, so a browser caching the 308
   * forever is what an old bookmark should get.
   */
  async redirects() {
    return [
      { source: "/", destination: "/shows", permanent: false },
      {
        source: "/shows",
        has: [{ type: "query", key: "page" }],
        destination: "/shows/popular",
        permanent: true,
      },
      {
        source: "/movies",
        has: [{ type: "query", key: "page" }],
        destination: "/movies/popular",
        permanent: true,
      },
      ...(getAuthEmailDelivery() === "off"
        ? [
            {
              source: "/check-email",
              destination: "/sign-in",
              permanent: false,
            },
          ]
        : []),
    ];
  },
  /**
   * A custom loader points every `next/image` at TMDB's own pre-sized files, so
   * the browser loads from TMDB's CDN and Vercel's optimizer, whose Hobby quota
   * a catalog this size outgrows, never runs (prompts/tmdb-image-loader.md).
   * `remotePatterns` stays as the record of the one image host.
   */
  images: {
    loader: "custom",
    loaderFile: "./lib/tmdb/image-loader.ts",
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
        pathname: "/t/p/**",
      },
    ],
  },
};

export default nextConfig;
