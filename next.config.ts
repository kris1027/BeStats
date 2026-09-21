import type { NextConfig } from "next";

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
   */
  async redirects() {
    return [{ source: "/", destination: "/shows", permanent: false }];
  },
  images: {
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
