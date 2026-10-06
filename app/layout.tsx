import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";

import { AccountSlot } from "@/components/layout/account-slot";
import { Navbar } from "@/components/layout/navbar";
import { SiteFooter } from "@/components/layout/site-footer";
import { Skeleton } from "@/components/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { SITE_NAME, shareMetadata } from "@/lib/seo/metadata";
import { siteUrl } from "@/lib/seo/site";
import "./globals.css";

/**
 * Inter, the typeface every one of the original designs set (spec 0004,
 * AC-2). Loaded as the variable font, so weights 400 through 800 arrive in one
 * file rather than five requests, and `display: "swap"` so text is readable
 * while it loads instead of invisible.
 *
 * The two typefaces the Next.js starter installed are gone: nothing in the
 * UI uses either of them.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const origin = siteUrl();

/**
 * The defaults every page starts from (spec 0016, AC-3, AC-20).
 *
 * `metadataBase` is set only when the site URL is valid, so a missing value
 * never fails the build. The default `openGraph` and `twitter` are what the
 * private and auth pages share as, since they set none of their own; every
 * public catalog page sets its own through `catalogMetadata()`, because the
 * merge is shallow and nested fields are replaced, not combined. Without
 * their own title and description, Next fills both cards from the page's.
 */
export const metadata: Metadata = {
  metadataBase: origin === null ? undefined : new URL(origin),
  title: {
    default: SITE_NAME,
    template: `%s · ${SITE_NAME}`,
  },
  description:
    "Track the movies and TV shows you watch. Discover titles, keep a watchlist, and rate every episode.",
  ...shareMetadata({}),
};

/**
 * The application shell: the sticky navbar, a single main region, and the
 * footer.
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
 * `SiteFooter` carries TMDB's attribution and the legal links on every route
 * (spec 0017, AC-1). It reads no request state, so it stays in the static
 * shell, and `<main>` keeps `flex-1` so a short page pushes it to the bottom.
 *
 * `Toaster` is the Sonner region the tracking controls report failed saves
 * through (spec 0007). It is a client boundary that reads no request state, so
 * it costs no route its static shell.
 *
 * `AccountSlot` is the one exception, and a Suspense boundary around each of
 * its two instances, one per navbar layout, is what contains it (spec 0005,
 * AC-14; spec 0008). It reads the session, which is request scoped; without
 * the boundary that would make every route dynamic and cost `/shows` and
 * `/movies` their prerendered static shells. Inside each, only the account
 * control waits. Nothing else in this tree may read a cookie, a header
 * or a Supabase client, and `app/layout.test.ts` fails if it does.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full scroll-pt-36 md:scroll-pt-24`}
    >
      <body className="flex min-h-full flex-col antialiased">
        {/*
         * Each fallback is the signed out button's footprint, so the bar does
         * not resize when the real control arrives. A skeleton rather than a
         * Sign in button, because painting Sign in and then swapping it for an
         * avatar is exactly the wrong-state-first flash AC-13 rules out.
         */}
        <Navbar
          mobileAccountSlot={
            <Suspense
              fallback={<Skeleton shape="pill" className="h-11 w-24" />}
            >
              <AccountSlot variant="mobile" />
            </Suspense>
          }
          desktopAccountSlot={
            <Suspense fallback={<Skeleton shape="pill" className="h-9 w-24" />}>
              <AccountSlot variant="desktop" />
            </Suspense>
          }
        />
        <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col px-4 py-8 md:py-12">
          {children}
        </main>
        <SiteFooter />
        <Toaster />
      </body>
    </html>
  );
}
