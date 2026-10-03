import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cacheLife } from "next/cache";
import { ImageResponse } from "next/og";

import { rootTokens } from "@/lib/seo/theme-tokens";

export const alt = "BeStats, track the movies and TV shows you watch";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The site card: the share image of every page with no TMDB artwork of its own
 * (spec 0016, AC-19, AC-20).
 *
 * Its colours are read from `app/globals.css` while the image is prerendered,
 * so the card follows the theme and this file holds no colour value
 * (`design-tokens-boundary.test.ts`). It reads no request data and calls no
 * TMDB endpoint, so the build renders it once. The default `ImageResponse`
 * font is used, so the build fetches no font.
 */
export default async function OpengraphImage() {
  const tokens = await cardTokens();

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "0 96px",
        gap: 24,
        background: tokens["--background"],
      }}
    >
      <div
        style={{
          fontSize: 128,
          fontWeight: 700,
          letterSpacing: "-0.04em",
          color: tokens["--foreground"],
        }}
      >
        BeStats
      </div>
      <div style={{ fontSize: 44, color: tokens["--muted-foreground"] }}>
        Track the movies and TV shows you watch
      </div>
    </div>,
    size,
  );
}

/**
 * The three theme colours, read inside a cached scope: under Cache Components
 * an uncached file read would make the route render per request, and the card
 * must be prerendered at build (spec 0016, AC-19, AC-24). The stylesheet only
 * changes with a deploy, which starts a fresh cache.
 */
async function cardTokens() {
  "use cache";
  cacheLife("max");
  const css = await readFile(join(process.cwd(), "app/globals.css"), "utf8");
  return rootTokens(css, [
    "--background",
    "--foreground",
    "--muted-foreground",
  ]);
}
