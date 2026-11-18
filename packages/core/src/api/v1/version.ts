import { z } from "zod";

/**
 * The app version contract between the mobile app and `/api/v1` (spec 0033,
 * child 0035, Versioning).
 *
 * The app sends its user facing version (`major.minor.patch`) on every request;
 * the server refuses anything below `MIN_APP_VERSION` with 426, so an old
 * build can be told to update instead of meeting a changed contract. Raising
 * the minimum is a core change plus a web deploy, shipped only after the store
 * build that meets it is live on both stores.
 */

/** The oldest app version the API still serves. */
export const MIN_APP_VERSION = "1.0.0";

/** The API generation; a breaking change creates `/api/v2`. */
export const API_VERSION = 1;

/** The request header that carries the app version. */
export const APP_VERSION_HEADER = "X-BeStats-App-Version";

/** `major.minor.patch`, digits only, no leading zeros beyond a lone 0. */
export const semverSchema = z
  .string()
  .regex(/^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/);

/**
 * Compares two versions that passed `semverSchema`, part by part as numbers,
 * so `1.10.0` sorts after `1.9.0` (a string compare would not). Pure, so the
 * web check and the app agree on the order (AGENTS.md section 5).
 *
 * @returns A negative number when `a` is older, 0 when equal, positive when newer.
 */
export function compareSemver(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/**
 * What the version header means for a request: missing or malformed is a bad
 * request, older than the minimum needs an update, anything else is served.
 * The API validates every input before it runs (AGENTS.md section 11), and
 * the app reaches the web only through `/api/v1` (section 5).
 *
 * @param header The raw header value, or null when absent.
 */
export function checkAppVersion(
  header: string | null,
): "ok" | "invalid" | "upgrade_required" {
  const parsed = semverSchema.safeParse(header);
  if (!parsed.success) return "invalid";
  return compareSemver(parsed.data, MIN_APP_VERSION) < 0
    ? "upgrade_required"
    : "ok";
}
