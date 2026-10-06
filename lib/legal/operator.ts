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

/**
 * The person who runs BeStats and is its data controller, named by handle.
 * The pages always link it to `OPERATOR_GITHUB_URL`, the public profile that
 * carries the full name, so the handle is never shown on its own.
 */
export const OPERATOR_HANDLE = "kris1027";

/** The operator's GitHub profile, where every mention of the handle links. */
export const OPERATOR_GITHUB_URL = "https://github.com/kris1027";

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
export const LEGAL_LAST_UPDATED = "2026-10-06";

/**
 * Where the production Supabase project stores your data, read from
 * `supabase projects list` (spec 0018, AC-23). A region can't change after a
 * project is created, so this moves only with a new project, and the EU test
 * beside it fails if that project ever leaves the EU. The app's functions sit
 * in the matching Vercel region, pinned in `vercel.json`.
 */
export const SUPABASE_REGION = {
  code: "eu-central-1",
  name: "Frankfurt, Germany",
} as const;

/** Days within which an account deletion request is completed. */
export const DELETION_DAYS = 30;

/** How soon a GDPR rights request is answered (GDPR Art. 12(3)). */
export const RIGHTS_RESPONSE = "one month";

/** Days within which a complaint about the service is answered. */
export const COMPLAINT_RESPONSE_DAYS = 14;

/** A service provider that processes personal data on the operator's behalf. */
export type Processor = { name: string; purpose: string; url: string };

/**
 * Only the processors live today. Production sends no email (spec 0018), so
 * neither Google nor an email provider is listed; both join with the deferred
 * email delivery and Google sign in work, in the PR that turns them on.
 */
export const PROCESSORS: readonly Processor[] = [
  {
    name: "Supabase",
    purpose: "Stores your account and tracking data and handles sign in.",
    url: "https://supabase.com",
  },
  {
    name: "Vercel",
    purpose:
      "Hosts the website, delivers catalog images, and keeps request logs.",
    url: "https://vercel.com",
  },
];
