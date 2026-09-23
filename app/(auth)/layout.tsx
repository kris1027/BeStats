import type { Metadata } from "next";

/**
 * The auth route group (spec 0005, AC-20).
 *
 * Its only job is the indexing rule. An auth screen in a search result is at
 * best noise and at worst a phishing target, and `/check-email` and
 * `/reset-password` carry a token or an address in the URL that must never
 * reach a search index. One `robots` here covers all five screens, so a screen
 * added later inherits it rather than having to remember.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return children;
}
