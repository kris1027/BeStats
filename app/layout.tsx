import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";

import { AccountSlot } from "@/components/layout/account-slot";
import { Navbar } from "@/components/layout/navbar";
import { Skeleton } from "@/components/skeleton";
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
 * (spec 0004, AC-18).
 *
 * `AccountSlot` is the one exception, and the Suspense boundary is what
 * contains it (spec 0005, AC-14). It reads the session, which is request
 * scoped; without the boundary that would make every route dynamic and cost
 * `/shows` and `/movies` their prerendered static shells. Inside it, only the
 * account control waits. Nothing else in this tree may read a cookie, a header
 * or a Supabase client, and `app/layout.test.ts` fails if it does.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full scroll-pt-36 md:scroll-pt-24`}
    >
      <body className="flex min-h-full flex-col antialiased">
        <Navbar
          accountSlot={
            <Suspense
              fallback={
                /*
                 * The signed out button's footprint, so the bar does not
                 * resize when the real control arrives. A skeleton rather
                 * than a Sign in button, because painting Sign in and then
                 * swapping it for an avatar is exactly the wrong-state-first
                 * flash AC-13 rules out.
                 */
                <Skeleton shape="pill" className="h-11 w-24 md:h-9" />
              }
            >
              <AccountSlot />
            </Suspense>
          }
        />
        <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col px-4 py-8 md:py-12">
          {children}
        </main>
      </body>
    </html>
  );
}
