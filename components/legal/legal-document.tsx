import type * as React from "react";

import { CONTACT_EMAIL, LEGAL_LAST_UPDATED } from "@/lib/legal/operator";

/**
 * `3 October 2026`, from the fixed constant and never the clock, parsed and
 * formatted in UTC so the day cannot shift with the server's timezone
 * (spec 0017, AC-7).
 */
const LAST_UPDATED_LABEL = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
}).format(new Date(`${LEGAL_LAST_UPDATED}T00:00:00Z`));

/**
 * The reading column both legal pages share: a centred measure of at most
 * 72 characters, the page title and the `Last updated` line (spec 0017, AC-7).
 *
 * There is no reference artboard for these pages, so it reuses the type scale
 * the rest of the app already draws (the auth panel's heading, the movie
 * overview's body text) rather than inventing a look. There is no typography
 * plugin, so lists and links are styled explicitly by the helpers below.
 */
export function LegalDocument({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="mx-auto flex w-full max-w-[72ch] flex-col gap-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl leading-tight font-bold tracking-[-0.03em] text-foreground md:text-4xl">
          {title}
        </h1>
        <p className="text-sm text-muted-foreground">
          Last updated{" "}
          <time dateTime={LEGAL_LAST_UPDATED}>{LAST_UPDATED_LABEL}</time>
        </p>
      </header>
      {children}
    </article>
  );
}

/**
 * The section's title in kebab case, so `/privacy#cookies` is a stable link
 * and a test can check the sections by id. The root layout's scroll padding
 * keeps a linked heading clear of the sticky navbar.
 */
export function sectionId(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** One numbered part of a legal page: an `h2` with its own anchor. */
export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={sectionId(title)}
      className="flex flex-col gap-3 text-base leading-relaxed text-text-secondary"
    >
      <h2
        id={sectionId(title)}
        className="text-xl font-bold tracking-[-0.02em] text-foreground"
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A bulleted list in body text, styled by hand for want of a prose plugin. */
export function LegalList({ children }: { children: React.ReactNode }) {
  return (
    <ul className="flex list-disc flex-col gap-2 pl-5 marker:text-muted-foreground">
      {children}
    </ul>
  );
}

/** The class every link inside legal text wears, `next/link` ones included. */
export const LEGAL_LINK_CLASS =
  "rounded-sm text-text-link underline underline-offset-4 hover:text-foreground";

/** A link off BeStats (TMDB, UODO, a processor), opened in a new tab. */
export function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={LEGAL_LINK_CLASS}
    >
      {children}
    </a>
  );
}

/**
 * The contact address as a `mailto:` link. These two pages are the only place
 * it is published (spec 0017, AC-10).
 */
export function ContactEmail() {
  return (
    <a href={`mailto:${CONTACT_EMAIL}`} className={LEGAL_LINK_CLASS}>
      {CONTACT_EMAIL}
    </a>
  );
}
