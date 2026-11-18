/** A country the title page names and picks its region data for (spec 0022, AC-9). */
export type Region = {
  /** ISO 3166-1 alpha-2, upper case. */
  code: string;
  /** The English country name, from `Intl.DisplayNames`. */
  name: string;
};

/**
 * The fallback when the request names no usable country: local development,
 * a preview with no header, or a code nobody can name.
 */
export const DEFAULT_REGION: Region = { code: "US", name: "United States" };

/**
 * Vercel's codes for an unknown country and for Tor traffic, plus Unicode's
 * unknown region, which `Intl.DisplayNames` names "Unknown Region".
 */
const UNKNOWN_CODES: ReadonlySet<string> = new Set(["XX", "T1", "ZZ"]);

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

/**
 * The visitor's region from Vercel's `x-vercel-ip-country` header value
 * (spec 0022, AC-9): two capital letters that `Intl.DisplayNames` can name,
 * and not `XX` or `T1`, otherwise `US`.
 *
 * Pure and free of `server-only`, like the rest of `lib/catalog/`, so it is
 * tested alone. The header read itself lives in `lib/region.ts`.
 *
 * @param header The raw header value, or null when there is none.
 */
export function parseRegion(header: string | null | undefined): Region {
  if (!header || !/^[A-Z]{2}$/.test(header) || UNKNOWN_CODES.has(header)) {
    return DEFAULT_REGION;
  }
  let name: string | undefined;
  try {
    name = regionNames.of(header);
  } catch {
    return DEFAULT_REGION;
  }
  // An unnameable code comes back unchanged rather than as a name.
  if (!name || name === header) return DEFAULT_REGION;
  return { code: header, name };
}
