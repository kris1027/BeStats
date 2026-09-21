import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { Navbar } from "@/components/layout/navbar";
import "./globals.css";

/**
 * Inter, the typeface every one of the sixteen references sets (spec 0004,
 * AC-2). Loaded as the variable font, so weights 400 through 800 arrive in one
 * file rather than five requests, and `display: "swap"` so text is readable
 * while it loads instead of invisible.
 *
 * The two typefaces the Next.js starter installed are gone: nothing in
 * `design/` uses either of them.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "BeStats",
    template: "%s · BeStats",
  },
  description:
    "Track the movies and TV shows you watch. Discover titles, keep a watchlist, and rate every episode.",
};

/**
 * The application shell: the sticky navbar above a single main region.
 *
 * The scroll padding is what keeps an anchored heading from landing underneath
 * the sticky navbar, which is the half of AC-13 that is easy to miss because it
 * only shows up when someone follows a fragment link.
 *
 * It has to be responsive because the navbar is. `Navbar` switches to
 * `md:flex-row` at the same breakpoint, so below `md` it stacks into two rows
 * and measures 132px, while at `md` and above it is one row of 72px. A single
 * value sized for the desktop bar leaves the mobile bar covering the heading by
 * 36px, which is exactly the bug this pair of values fixes. Keep both numbers
 * above the heights in `NAVBAR_HEIGHTS` in `app/layout.test.ts`, which is the
 * guard that fails if either one drifts.
 *
 * Everything here is a Server Component. The only client boundaries in the
 * shell are the media type tabs and the menu sheet, neither of which reads a
 * server dynamic API, so routes still prerender under `cacheComponents`
 * (AC-18).
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full scroll-pt-36 md:scroll-pt-24`}
    >
      <body className="flex min-h-full flex-col antialiased">
        <Navbar />
        <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col px-4 py-8 md:py-12">
          {children}
        </main>
      </body>
    </html>
  );
}
