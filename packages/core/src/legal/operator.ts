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

/**
 * The words before the handle in the credit line, on the web's footer and the
 * app's About (prompts/mobile-look-account.md, decision 9). The handle that
 * follows always links to `OPERATOR_GITHUB_URL`.
 */
export const CREDIT_LINE_PREFIX = "© BeStats · Crafted with love by";

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
export const LEGAL_LAST_UPDATED = "2026-11-25";

/**
 * Where the production Supabase project stores your data, read from
 * `supabase projects list` (spec 0018, AC-23). A region can't change after a
 * project is created, so this moves only with a new project, and the EU test
 * beside it fails if that project ever leaves the EU. The app's functions sit
 * in the matching Vercel region, pinned in `vercel.json`, except when the
 * Netlify backup host serves the app: Netlify's Free plan can't choose a
 * region, so its functions run in Ohio, which Netlify's transfer line in
 * `PROCESSORS` says (prompts/netlify-mirror.md, decisions 9 and 10).
 */
export const SUPABASE_REGION = {
  code: "eu-central-1",
  name: "Frankfurt, Germany",
} as const;

/**
 * The credit TMDB's watch provider data asks for, shown under every Where to
 * watch section (spec 0022, AC-12). One home, like `TMDB_ATTRIBUTION`, so the
 * wording cannot drift between the movie and show pages.
 */
export const JUSTWATCH_ATTRIBUTION = "Availability data from JustWatch";

/**
 * TMDB's own site, where the footer logo, the privacy policy and TMDB's
 * processor entry link. One home, like `JUSTWATCH_ATTRIBUTION`, so the link
 * cannot drift between the places that name TMDB. It lives here rather than in
 * `lib/tmdb` because that entry point is server only and the footer test and
 * the legal pages render in jsdom.
 */
export const TMDB_HOME_URL = "https://www.themoviedb.org";

/**
 * IGDB's own site, linked where `/privacy` says game covers load from IGDB's
 * image service (spec 0025) and from the footer's IGDB credit (spec 0032,
 * AC-8). One home, like `TMDB_HOME_URL`. IGDB is not a processor: the server
 * sends it no user data, only the browser loads covers.
 */
export const IGDB_HOME_URL = "https://www.igdb.com";

/**
 * The legal pages' paths on the deployment. The phone app's About links to
 * them on the same origin as `/api/v1`, since the website and the API ship as
 * one deployment, and the "Website off, API on" firewall rule keeps both pages
 * reachable (prompts/mobile-about-legal-links.md; docs/deploy.md section 5).
 */
export const PRIVACY_PATH = "/privacy";

/** See `PRIVACY_PATH`. */
export const TERMS_PATH = "/terms";

/**
 * The legal pages' link labels, shared by the web footer and the app's About
 * so the two cannot name the pages apart (apps/mobile/AGENTS.md: copy comes
 * from core).
 */
export const PRIVACY_LABEL = "Privacy Policy";

/** See `PRIVACY_LABEL`. */
export const TERMS_LABEL = "Terms of Service";

/**
 * The credit IGDB's terms ask for, shown in the footer on every route and on
 * `/terms` (spec 0032, AC-8, AC-9). IGDB's FAQ asks for "fair attribution,
 * i.e. attribution that is visible to your users and located in a static
 * location", and the Twitch Developer Services Agreement (last modified
 * 2023-11-01) for "a clear path to the source", which the footer link is.
 * Both read on 2026-10-26 (spec 0032, rationale, *IGDB terms check*). It
 * lives here, not in `lib/igdb`, because that entry point is server only and
 * its export surface is locked.
 */
export const IGDB_ATTRIBUTION = "Game data and images from IGDB.com";

/** Days within which an account deletion request is completed. */
export const DELETION_DAYS = 30;

/** How soon a GDPR rights request is answered (GDPR Art. 12(3)). */
export const RIGHTS_RESPONSE = "one month";

/** Days within which a complaint about the service is answered. */
export const COMPLAINT_RESPONSE_DAYS = 14;

/**
 * A service provider that processes personal data on the operator's behalf.
 * `transfer`, when set, is what "Transfers outside the EEA" says about it, so
 * the company's country lives beside its other facts and not in page text.
 */
export type Processor = {
  name: string;
  purpose: string;
  url: string;
  transfer?: string;
};

/**
 * The host that serves the same build when Vercel can't (prompts/netlify-
 * mirror.md, decisions 1 and 10). Its name and where its functions run are
 * legal facts: Netlify's transfer line and `/privacy`'s "Transfers outside the
 * EEA" both read them here, so the two never drift (root AGENTS.md, Commands
 * and repo facts). Netlify's Free plan can't choose a region, hence Ohio.
 */
export const BACKUP_HOST = {
  name: "Netlify",
  functionLocation: "Ohio, United States",
} as const;

/**
 * Only the processors live today. Production sends no email (spec 0018), so
 * neither Google nor an email provider is listed; both join with the deferred
 * email delivery and Google sign in work, in the PR that turns them on.
 * YouTube joined with the title page trailers (spec 0022, AC-19): its player
 * loads only after you press Trailer. TMDB joined when images moved off
 * Vercel's optimizer onto TMDB's own CDN (prompts/tmdb-image-loader.md).
 * Expo joined with EAS Update in the phone app (spec 0033, AC-15): every store
 * build asks Expo's update service for a newer bundle when it starts. Its
 * transfer line claims no contract clauses, since none was checked
 * (prompts/mobile-release-prep.md, decision 5). Netlify joined as the backup
 * host beside Vercel (prompts/netlify-mirror.md); its transfer line claims no
 * contract clauses until the operator has completed Netlify's DPA.
 */
export const PROCESSORS: readonly Processor[] = [
  {
    name: "Supabase",
    purpose: "Stores your account and tracking data and handles sign in.",
    url: "https://supabase.com",
    transfer:
      "Supabase is a United States company. Where its staff access your data for support and operations, that access is covered by the EU Standard Contractual Clauses.",
  },
  {
    name: "Vercel",
    purpose: "Hosts the website and the app's API, and keeps request logs.",
    url: "https://vercel.com",
    transfer:
      "Vercel is a United States company. Where its staff access your data for support and operations, that access is covered by the EU Standard Contractual Clauses.",
  },
  {
    name: BACKUP_HOST.name,
    purpose:
      "Hosts the website and the app's API when it serves the app in place of Vercel, and keeps request logs.",
    url: "https://www.netlify.com",
    transfer: `${BACKUP_HOST.name} is a United States company. When it serves the app, the app's server functions run on its servers in ${BACKUP_HOST.functionLocation}, so the requests you make there, with the account and tracking data they carry, are processed in the United States.`,
  },
  {
    name: "TMDB",
    purpose:
      "Delivers posters, photos and other catalog images straight to your browser, which shares your IP address with it.",
    url: TMDB_HOME_URL,
    transfer:
      "TMDB is a United States company. The images your browser loads from it come from its content delivery network, which may serve them from outside the EEA.",
  },
  {
    name: "YouTube",
    purpose:
      "Plays a title's trailer, only after you press Trailer on its page.",
    url: "https://www.youtube.com",
  },
  {
    name: "Expo",
    purpose:
      "Delivers updates to the BeStats app, which checks for them when it starts and shares your IP address, device details and a random install ID with it.",
    url: "https://expo.dev",
    transfer:
      "Expo is a United States company. The update checks the app makes reach its update service, which may serve them from outside the EEA.",
  },
];
