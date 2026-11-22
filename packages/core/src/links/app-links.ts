/**
 * The production web origin's host, where Universal Links and Android App
 * Links verify (spec 0033, Proposed stack "Deep links"). It is the Supabase
 * `site_url` of the cloud project and the host of the mobile API.
 */
export const APP_LINK_HOST = "bestats-app.vercel.app";

/** The store bundle and package ID, permanent after the first upload. */
export const APP_BUNDLE_ID = "com.kris1027.bestats";

/**
 * Where a password reset asked from the app lands (spec 0033, child 0036).
 * The web keeps `/auth/callback` for itself, so a reset asked on the web never
 * opens the app, and one asked on the phone never lands in a browser session.
 */
export const APP_RESET_PATH = "/reset-password/app";

/**
 * The title prefixes a shared link may open in the app (spec 0033, AC-16).
 * Library routes and every other path stay on the web in v1.
 */
export const APP_LINK_TITLE_PREFIXES = ["/movies/", "/shows/", "/games/"];

/**
 * Whether a path belongs in the app: a title path or the reset path, and
 * nothing else (spec 0033, AC-16). Both the app's incoming link rewrite and
 * the two verification files read this one list, so the OS and the router can
 * never disagree about which links the app owns (packages/core/AGENTS.md, a
 * rule lives in one package).
 */
export function isAppLinkPath(path: string): boolean {
  if (path === APP_RESET_PATH) return true;
  return APP_LINK_TITLE_PREFIXES.some(
    (prefix) => path.startsWith(prefix) && path.length > prefix.length,
  );
}

const APPLE_TEAM_ID = /^[A-Z0-9]{10}$/;
const SHA256_FINGERPRINT = /^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/;

/**
 * The `apple-app-site-association` document (spec 0033, child 0036).
 *
 * Built from the Team ID rather than committed by hand, because that ID only
 * exists once the Apple Developer Program membership does, and a file with a
 * made up ID verifies nothing (AGENTS.md section 14). `pnpm app-links` writes
 * it into the web's `public/.well-known/` (prompts/mobile-deep-links.md).
 *
 * @param teamId The 10 character Apple Team ID.
 */
export function appleAppSiteAssociation(teamId: string) {
  if (!APPLE_TEAM_ID.test(teamId)) {
    throw new Error("An Apple Team ID is 10 uppercase letters or digits");
  }
  return {
    applinks: {
      details: [
        {
          appIDs: [`${teamId}.${APP_BUNDLE_ID}`],
          components: [
            ...APP_LINK_TITLE_PREFIXES.map((prefix) => ({
              "/": `${prefix}*`,
            })),
            { "/": APP_RESET_PATH },
          ],
        },
      ],
    },
  };
}

/**
 * The Android `assetlinks.json` document (spec 0033, child 0036), for the
 * SHA-256 fingerprints of the app signing key (Play's, plus the upload key's
 * while testing builds outside Play). Same reasoning as
 * `appleAppSiteAssociation`: built from real IDs, never committed blank
 * (AGENTS.md section 14).
 *
 * @param fingerprints Colon separated uppercase hex, as `eas credentials`
 * and the Play Console print them.
 */
export function assetLinks(fingerprints: readonly string[]) {
  if (fingerprints.length === 0) {
    throw new Error("assetlinks.json needs at least one fingerprint");
  }
  for (const fingerprint of fingerprints) {
    if (!SHA256_FINGERPRINT.test(fingerprint)) {
      throw new Error(`Not a SHA-256 fingerprint: ${fingerprint}`);
    }
  }
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: APP_BUNDLE_ID,
        sha256_cert_fingerprints: [...fingerprints],
      },
    },
  ];
}

/**
 * The `redirectTo` of a reset asked from the app: the site origin plus the
 * fixed app path (spec 0033, child 0036, "Password reset and deep links").
 *
 * The origin comes from the app's validated config, never from input, and the
 * path is fixed, so no caller can point a reset elsewhere; Supabase's
 * redirect allow list is the second check (AGENTS.md section 11).
 *
 * @param siteOrigin The web project's URL; only its origin is used.
 * @returns The absolute URL, or null when the value is not http(s).
 */
export function appResetRedirectUrl(siteOrigin: string): string | null {
  let url: URL;
  try {
    url = new URL(siteOrigin);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  return `${url.origin}${APP_RESET_PATH}`;
}
