import type { NextConfig } from "next";

import { getAuthEmailDelivery } from "./lib/env";

/**
 * Cache Components is on from the first data feature rather than adopted later
 * as a migration across finished pages (spec 0002, AC-4). Every route from here
 * on must be prerenderable or explicitly opt out with `export const instant =
 * false`, and every cached read calls `cacheLife` inside its own scope.
 *
 * TMDB serves every poster, backdrop, profile and still the app renders, and
 * `lib/tmdb` builds those URLs from the hardcoded `TMDB_IMAGE_BASE` (spec 0002,
 * AC-20), so the image config below needs no remote host of its own.
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
   *
   * The loader alone leaves `/_next/image` answering anyone who still holds an
   * old URL, so the optimizer is also given no source of ours to fetch: no
   * `remotePatterns`, and an empty `localPatterns`, because an absent one allows
   * every local path (prompts/close-image-optimizer.md). Next still appends
   * its static import folders (`/_next/static/media/**` and the immutable
   * one) to any array, which stay harmless only while no code imports an
   * image file. The one image host is recorded by `TMDB_IMAGE_BASE` in
   * `lib/tmdb/constants.ts`.
   */
  images: {
    loader: "custom",
    loaderFile: "./lib/tmdb/image-loader.ts",
    localPatterns: [],
  },
};

export default nextConfig;
