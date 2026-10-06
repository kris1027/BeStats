import Image from "next/image";
import Link from "next/link";
import type * as React from "react";

import { OPERATOR_GITHUB_URL, OPERATOR_HANDLE } from "@/lib/legal/operator";
import { TMDB_ATTRIBUTION } from "@/lib/tmdb";

/**
 * The quiet footer under every route: TMDB's logo and the notice its API terms
 * require, then the two legal pages and the credit line (spec 0017, AC-1 to
 * AC-5). The credit names the operator by handle, linked to their GitHub
 * profile, the same way the legal pages do.
 *
 * A Server Component that reads no cookie, header or session, so it sits in
 * every route's prerendered shell (`app/layout-purity.test.ts` holds it to
 * that). It carries no email address on purpose: the contact address lives
 * only on `/privacy` and `/terms`, off the pages scrapers crawl most.
 *
 * Flat, with no glass, blur or border, because it sits on the plain black
 * page rather than over artwork (`components/AGENTS.md`, backdrop blur).
 */
export function SiteFooter() {
  return (
    <footer className="w-full">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between md:gap-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
          <a
            href="https://www.themoviedb.org"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 w-fit items-center rounded-sm md:min-h-9"
          >
            {/*
             * The official file, byte for byte (`./tmdb-logo.test.ts`).
             * `unoptimized` because the image optimizer refuses SVG without
             * `dangerouslyAllowSVG`. The size attributes are the file's
             * viewBox (273.42 × 35.52) rounded, since next/image takes whole
             * pixels; CSS sets only the height, smaller than the 20px BeStats
             * wordmark, as TMDB's terms ask.
             */}
            <Image
              src="/tmdb-logo.svg"
              alt="TMDB"
              width={273}
              height={36}
              unoptimized
              className="h-3 w-auto md:h-3.5"
            />
          </a>
          <p className="max-w-[60ch] text-xs text-muted-foreground">
            {TMDB_ATTRIBUTION}
          </p>
        </div>

        <div className="flex flex-col gap-1 md:flex-row md:items-center md:gap-6">
          <nav aria-label="Legal" className="flex flex-wrap gap-x-6">
            <FooterLink href="/privacy">Privacy Policy</FooterLink>
            <FooterLink href="/terms">Terms of Service</FooterLink>
          </nav>
          <p className="text-xs text-muted-foreground">
            © BeStats · Crafted with love by{" "}
            <a
              href={OPERATOR_GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-sm text-text-link underline-offset-4 hover:text-foreground hover:underline"
            >
              {OPERATOR_HANDLE}
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}

/**
 * A footer link in the `link` button variant's colours, at the 44px mobile and
 * 36px desktop touch heights (`components/AGENTS.md`, touch targets). A plain
 * `next/link`, not `ButtonLink`, because the button base adds padding and
 * weight a line of small print should not carry.
 */
function FooterLink({
  href,
  children,
}: {
  href: "/privacy" | "/terms";
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center rounded-sm text-sm text-text-link underline-offset-4 hover:text-foreground hover:underline md:min-h-9"
    >
      {children}
    </Link>
  );
}
