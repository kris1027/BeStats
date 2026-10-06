import type { Metadata } from "next";
import Link from "next/link";

import {
  ContactEmail,
  LEGAL_LINK_CLASS,
  LegalDocument,
  LegalList,
  LegalSection,
  OperatorLink,
} from "@/components/legal/legal-document";
import {
  COMPLAINT_RESPONSE_DAYS,
  DELETION_DAYS,
  MINIMUM_AGE,
  OPERATOR_COUNTRY,
} from "@/lib/legal/operator";
import { catalogMetadata } from "@/lib/seo/metadata";
import { TMDB_ATTRIBUTION } from "@/lib/tmdb";

export const metadata: Metadata = catalogMetadata({
  title: "Terms of Service",
  description:
    "The rules for using BeStats, a free movie and TV tracking website.",
  path: "/terms",
  image: null,
  ogType: "website",
});

/**
 * `/terms` (spec 0017, AC-6, AC-7, AC-9 to AC-12).
 *
 * Fully static, like `/privacy`. Operator facts come from
 * `lib/legal/operator.ts` and the TMDB notice from `TMDB_ATTRIBUTION`, so
 * neither is restated here. The text follows the spec's Terms of Service facts
 * table and promises nothing the app does not do.
 */
export default function TermsPage() {
  return (
    <LegalDocument title="Terms of Service">
      <LegalSection title="About BeStats">
        <p>
          BeStats is a free website for tracking the movies and TV shows you
          watch, run by <OperatorLink /> as a non commercial personal project.
          It is not a streaming service and hosts no video.
        </p>
        <p>
          By creating an account you accept these terms. The agreement starts
          when you sign up.
        </p>
      </LegalSection>

      <LegalSection title="Your account">
        <LegalList>
          <li>You must be at least {MINIMUM_AGE} years old.</li>
          <li>Sign up with an email address you control.</li>
          <li>Keep your password private.</li>
          <li>One account is for one person.</li>
        </LegalList>
        <p>
          How we handle your data is explained in the{" "}
          <Link href="/privacy" className={LEGAL_LINK_CLASS}>
            Privacy Policy
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection title="Technical requirements">
        <p>
          You need a current web browser with JavaScript and cookies enabled, an
          internet connection, and an email address for an account.
        </p>
      </LegalSection>

      <LegalSection title="Acceptable use">
        <p>When you use BeStats, please don&rsquo;t:</p>
        <LegalList>
          <li>use it for anything unlawful;</li>
          <li>try to reach other people&rsquo;s data;</li>
          <li>attack, overload or probe the service;</li>
          <li>scrape it automatically or access it in bulk.</li>
        </LegalList>
        <p>
          Your ratings and lists are private. BeStats publishes nothing you
          enter.
        </p>
      </LegalSection>

      <LegalSection title="Catalog data and TMDB">
        <p>
          Titles, images and details come from TMDB. We can&rsquo;t guarantee
          that they are accurate or complete.
        </p>
        <p>{TMDB_ATTRIBUTION}</p>
        <p>
          TMDB community ratings belong to TMDB. Your own ratings are yours.
        </p>
      </LegalSection>

      <LegalSection title="Availability and changes to the service">
        <p>
          BeStats is provided free and as is. Features may change or stop, and
          we give notice on the site where reasonably possible.
        </p>
      </LegalSection>

      <LegalSection title="Ending your account">
        <p>
          You can stop using BeStats at any time and ask for your account to be
          deleted by emailing <ContactEmail />. We handle deletion within{" "}
          {DELETION_DAYS} days. We may suspend an account that breaks these
          terms.
        </p>
      </LegalSection>

      <LegalSection title="Liability">
        <p>
          Our liability is limited as far as the law allows. Nothing in these
          terms limits liability that cannot be limited by law, including for
          intentional harm, or takes away your rights as a consumer.
        </p>
      </LegalSection>

      <LegalSection title="Complaints">
        <p>
          Email <ContactEmail /> describing the issue. We answer within{" "}
          {COMPLAINT_RESPONSE_DAYS} days.
        </p>
      </LegalSection>

      <LegalSection title="Governing law">
        <p>
          These terms are governed by the law of {OPERATOR_COUNTRY}. If you are
          a consumer, you keep the protection of the mandatory laws of the
          country where you live. Disputes go to the courts the law assigns.
        </p>
      </LegalSection>

      <LegalSection title="Changes to these terms">
        <p>
          We post any material change here with a new Last updated date.
          Continuing to use BeStats after that means you accept the changed
          terms.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          <OperatorLink />, <ContactEmail />
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
