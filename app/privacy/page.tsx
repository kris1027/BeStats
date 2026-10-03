import type { Metadata } from "next";
import Link from "next/link";

import {
  ContactEmail,
  ExternalLink,
  LEGAL_LINK_CLASS,
  LegalDocument,
  LegalList,
  LegalSection,
} from "@/components/legal/legal-document";
import {
  DELETION_DAYS,
  MINIMUM_AGE,
  OPERATOR_COUNTRY,
  OPERATOR_NAME,
  PROCESSORS,
  RIGHTS_RESPONSE,
  SUPERVISORY_AUTHORITY,
} from "@/lib/legal/operator";
import { catalogMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = catalogMetadata({
  title: "Privacy Policy",
  description:
    "How BeStats collects, uses and protects your data, and the rights you have over it.",
  path: "/privacy",
  image: null,
  ogType: "website",
});

/**
 * `/privacy` (spec 0017, AC-6 to AC-8, AC-10 to AC-12).
 *
 * Fully static: it reads no request state and never the clock, so it is
 * prerendered whole. Every operator fact comes from `lib/legal/operator.ts`.
 * The text states only what the app does today, from the spec's Privacy
 * Policy facts table; a change that adds a processor or a new kind of personal
 * data updates this page and `PROCESSORS` in the same PR.
 */
export default function PrivacyPage() {
  return (
    <LegalDocument title="Privacy Policy">
      <LegalSection title="Who runs BeStats">
        <p>
          BeStats is a free, non commercial personal project run by{" "}
          {OPERATOR_NAME} in {OPERATOR_COUNTRY}. {OPERATOR_NAME} is the data
          controller for the personal data described here, which this policy
          calls &ldquo;we&rdquo;. You can reach us at <ContactEmail />.
        </p>
      </LegalSection>

      <LegalSection title="What we collect">
        <LegalList>
          <li>
            <strong className="text-foreground">Account data:</strong> your
            email address, and your password, which Supabase Auth stores only as
            a hash.
          </li>
          <li>
            <strong className="text-foreground">Tracking data:</strong> your
            watchlist entries, the movies and episodes you mark watched with the
            dates you watched them, your 1 to 10 ratings, and the status you
            give each TV show.
          </li>
          <li>
            <strong className="text-foreground">Technical data:</strong> your IP
            address, your browser&rsquo;s user agent and the request logs our
            hosting and sign in providers keep. The sign in events BeStats logs
            itself carry no email address, password or token.
          </li>
        </LegalList>
        <p>
          Nothing else. We collect no payment data, no contacts, and no location
          beyond what an IP address implies.
        </p>
      </LegalSection>

      <LegalSection title="Why we use it">
        <LegalList>
          <li>
            To provide your account and keep your tracking data. The legal basis
            is performing the contract you accept when you sign up (GDPR Art.
            6(1)(b)).
          </li>
          <li>
            To send the emails your account needs, such as address confirmation
            and password recovery, on the same basis.
          </li>
          <li>
            To keep the service secure and stop abuse, for example through rate
            limits and logs. The legal basis is our legitimate interest in a
            safe service (GDPR Art. 6(1)(f)).
          </li>
        </LegalList>
        <p>
          We send no marketing emails, show no ads, run no analytics, do no
          profiling and make no automated decisions about you. We never sell
          your data.
        </p>
      </LegalSection>

      <LegalSection title="Cookies">
        <p>
          BeStats sets only strictly necessary cookies: the Supabase session
          cookies that keep you signed in. They are set when you sign in, are{" "}
          <code className="text-foreground">HttpOnly</code> so page scripts
          cannot read them, and are removed when you sign out.
        </p>
        <p>
          There are no analytics, advertising or third party tracking cookies,
          so there is no consent banner. Fonts are served from BeStats itself,
          not loaded from another site.
        </p>
      </LegalSection>

      <LegalSection title="Who processes your data">
        <p>These providers process personal data on our behalf:</p>
        <LegalList>
          {PROCESSORS.map((processor) => (
            <li key={processor.name}>
              <ExternalLink href={processor.url}>{processor.name}</ExternalLink>
              : {processor.purpose}
            </li>
          ))}
        </LegalList>
        <p>
          Catalog details come from{" "}
          <ExternalLink href="https://www.themoviedb.org">TMDB</ExternalLink>,
          which receives no personal data from you: our server makes the catalog
          requests, and our host delivers the images.
        </p>
      </LegalSection>

      <LegalSection title="Transfers outside the EEA">
        <p>
          Supabase and Vercel are based in the United States. Where your data
          leaves the European Economic Area, it is protected by the safeguards
          those providers offer, such as the EU Standard Contractual Clauses.
        </p>
      </LegalSection>

      <LegalSection title="How long we keep it">
        <p>
          Your account and tracking data stay until you ask us to delete your
          account. We then delete them within {DELETION_DAYS} days. Logs kept by
          our providers follow those providers&rsquo; own retention periods.
        </p>
      </LegalSection>

      <LegalSection title="Your rights">
        <p>Under the GDPR you have the right to:</p>
        <LegalList>
          <li>access the personal data we hold about you;</li>
          <li>have inaccurate data corrected (rectification);</li>
          <li>have your data erased;</li>
          <li>restrict how we process it;</li>
          <li>
            data portability, which means a copy of your tracking data on
            request;
          </li>
          <li>object to processing based on our legitimate interests.</li>
        </LegalList>
        <p>
          Email <ContactEmail /> to use any of these rights. We answer within{" "}
          {RIGHTS_RESPONSE}. Account deletion works by email request today.
        </p>
      </LegalSection>

      <LegalSection title="Complaints">
        <p>
          You can complain to the{" "}
          <ExternalLink href={SUPERVISORY_AUTHORITY.url}>
            {SUPERVISORY_AUTHORITY.name}
          </ExternalLink>
          , {SUPERVISORY_AUTHORITY.address}, or to the data protection authority
          where you live.
        </p>
      </LegalSection>

      <LegalSection title="Children">
        <p>
          BeStats is not for anyone under {MINIMUM_AGE}. If we learn that an
          account belongs to someone younger, we delete it.
        </p>
      </LegalSection>

      <LegalSection title="Security">
        <p>
          Row Level Security in the database limits each account to its own
          data, session cookies are{" "}
          <code className="text-foreground">HttpOnly</code>, and Supabase stores
          passwords only as hashes. No system is perfectly secure, but we work
          to keep yours safe.
        </p>
      </LegalSection>

      <LegalSection title="Changes to this policy">
        <p>
          We post any material change on this page with a new Last updated date.
          The{" "}
          <Link href="/terms" className={LEGAL_LINK_CLASS}>
            Terms of Service
          </Link>{" "}
          set out the rules for using BeStats.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          {OPERATOR_NAME}, <ContactEmail />
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
