/**
 * Every operator fact the Privacy Policy and Terms of Service state, in one
 * place (spec 0017, AC-10).
 *
 * Pure on purpose, with no `server-only`, so tests import it directly. Neither
 * page may hardcode one of these values: a change of contact address or a new
 * processor is one edit here, and the pages follow.
 *
 * The pages describe only what the code does (spec 0017, Key invariants). A
 * change that adds a processor, an email provider or analytics updates
 * `PROCESSORS`, the policy text and `LEGAL_LAST_UPDATED` in the same PR.
 */

/** The person who runs BeStats and is its data controller. */
export const OPERATOR_NAME = "Krzysztof Obarzanek";

/** Where rights requests, deletion requests and complaints go. */
export const CONTACT_EMAIL = "kris1027.dev@gmail.com";

/** The operator's country, which sets the governing law and the authority. */
export const OPERATOR_COUNTRY = "Poland";

/** The Polish data protection authority, which follows from the country. */
export const SUPERVISORY_AUTHORITY = {
  name: "President of the Personal Data Protection Office (UODO)",
  address: "ul. Stawki 2, 00-193 Warsaw, Poland",
  url: "https://uodo.gov.pl",
} as const;

/** BeStats is not for anyone younger than this. */
export const MINIMUM_AGE = 16;

/**
 * The date both pages show as `Last updated`, as `YYYY-MM-DD`. Bump it by hand
 * whenever the text changes materially. Pages format it in UTC and never read
 * the clock (spec 0017, AC-7).
 */
export const LEGAL_LAST_UPDATED = "2026-10-03";

/** Days within which an account deletion request is completed. */
export const DELETION_DAYS = 30;

/** How soon a GDPR rights request is answered (GDPR Art. 12(3)). */
export const RIGHTS_RESPONSE = "one month";

/** Days within which a complaint about the service is answered. */
export const COMPLAINT_RESPONSE_DAYS = 14;

/** A service provider that processes personal data on the operator's behalf. */
export type Processor = { name: string; purpose: string; url: string };

/**
 * Only the processors live today. Google joins when feature 20 restores Google
 * sign in, and an email provider joins when one is chosen, each in its own PR.
 */
export const PROCESSORS: readonly Processor[] = [
  {
    name: "Supabase",
    purpose:
      "Stores your account and tracking data, handles sign in, and sends account emails such as confirmation and password recovery.",
    url: "https://supabase.com",
  },
  {
    name: "Vercel",
    purpose:
      "Hosts the website, delivers catalog images, and keeps request logs.",
    url: "https://vercel.com",
  },
];
