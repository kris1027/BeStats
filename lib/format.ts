/**
 * Display formatting for catalog values.
 *
 * Every helper takes a value the TMDB module already normalized, so "missing"
 * has arrived as null and been handled by the caller. None of them invents a
 * value: each one only changes how a real value reads (AGENTS.md section 14).
 * Pure and dependency free, so both Server Components and tests can use them.
 */

/**
 * A runtime as `2h 19m`, `45m` under an hour, or `2h` on the hour
 * (spec 0006, AC-3).
 *
 * @param minutes A positive whole number of minutes.
 */
export function formatRuntime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

const VOTE_FORMAT = new Intl.NumberFormat("en-US");

/**
 * A TMDB vote count as `12,345 votes`, or `1 vote` (spec 0006, AC-7).
 *
 * The locale is pinned to `en-US` rather than left to the runtime, so the
 * server rendered text never differs by where the server happens to run.
 */
export function formatVoteCount(count: number): string {
  return `${VOTE_FORMAT.format(count)} ${count === 1 ? "vote" : "votes"}`;
}

/**
 * The English name of an ISO 639-1 language code, for example `French` for
 * `fr` (spec 0006, AC-5).
 *
 * Falls back to the raw code when the runtime's ICU data does not know it,
 * because a code the reader can look up is better than a made up name.
 */
export function languageName(code: string): string {
  try {
    const name = new Intl.DisplayNames(["en"], { type: "language" }).of(code);
    return name && name !== code ? name : code;
  } catch {
    return code;
  }
}

/** Whitespace and punctuation left dangling where a sentence was cut. */
const TRAILING_CUT = /[\s.,;:!?\-–—]+$/;

/**
 * Shortens text to at most `max` characters, ellipsis included, cutting at a
 * word boundary (spec 0006, AC-12, the meta description).
 *
 * Text that already fits is returned unchanged. Otherwise the cut is at the
 * last whitespace inside the first `max - 1` characters, with trailing
 * punctuation trimmed, then `…`. A single unbroken run of characters is cut
 * hard at `max - 1`, which is the only way to honour the limit.
 */
export function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max - 1);
  const lastSpace = head.search(/\s\S*$/);
  const cut = lastSpace > 0 ? head.slice(0, lastSpace) : head;
  return `${cut.replace(TRAILING_CUT, "") || cut}…`;
}
