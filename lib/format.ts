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

/**
 * A personal score as the badge shows it: "Not rated" for none, an integer
 * with no decimal (`8`, never `8.0`), a calculated average to one decimal
 * (AGENTS.md section 9, spec 0007 AC-10).
 *
 * Shared by `PersonalScoreBadge` and the movie page score pill, so the two can
 * never format the same score differently.
 *
 * @param value The score, or null when there is none.
 */
export function formatPersonalScore(value: number | null): string {
  if (value === null) return "Not rated";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * The years a show aired, for the show hero (spec 0009, AC-4).
 *
 * Derived from TMDB's own facts without a clock, so the text never depends on
 * when or where the page renders. `Ended` and `Canceled` close the span;
 * anything else with a last air year has something aired and is still open
 * (`–present`); with no last air year nothing has aired and only the first
 * year shows. The statuses are compared exactly, TMDB's wording verbatim.
 *
 * @returns The span, or null when TMDB has no first air year.
 */
export function formatAirSpan({
  firstAirYear,
  lastAirYear,
  status,
}: {
  firstAirYear: number | null;
  lastAirYear: number | null;
  status: string;
}): string | null {
  if (firstAirYear === null) return null;
  if (lastAirYear === null) return String(firstAirYear);
  if (status === "Ended" || status === "Canceled") {
    return lastAirYear === firstAirYear
      ? String(firstAirYear)
      : `${firstAirYear}–${lastAirYear}`;
  }
  return `${firstAirYear}–present`;
}

/**
 * A season's episode count as a card and the season header state it
 * (spec 0009, AC-7). Zero is said in words, because TMDB listing no episodes
 * yet is not the same as a season of none.
 */
export function formatEpisodeCount(count: number): string {
  if (count === 0) return "No episodes listed yet";
  return `${count} ${count === 1 ? "episode" : "episodes"}`;
}

/**
 * A season's year and episode count, as a season card and the season header
 * show them (spec 0009, AC-7, AC-9). The year is the leading four characters
 * of TMDB's date, never a `Date` parse, for the reason `yearFromDate` gives in
 * the TMDB module; a season with no date leaves the year out.
 *
 * @returns The parts to join with the meta line's ` · ` separator.
 */
export function seasonMetaParts(
  airDate: string | null,
  episodeCount: number,
): string[] {
  const year = airDate && /^\d{4}/.test(airDate) ? airDate.slice(0, 4) : null;
  return [year, formatEpisodeCount(episodeCount)].filter(
    (part): part is string => part !== null,
  );
}

const TMDB_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const AIR_DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * A TMDB air date as `Mar 3, 2013` (spec 0009, AC-10).
 *
 * TMDB gives a calendar date with no time or zone. It is read and formatted in
 * UTC, so the day printed is the day TMDB wrote whatever timezone the server
 * runs in; a local parse would print the day before west of UTC. Nothing is
 * compared with today: whether it has aired belongs to features 12 and 14.
 *
 * @returns The formatted date, or null for a missing or malformed value.
 */
export function formatAirDate(date: string | null): string | null {
  const match = date === null ? null : TMDB_DATE.exec(date);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  // `Date.UTC` reads years 0 to 99 as 1900 to 1999; `setUTCFullYear` does not.
  const utc = new Date(0);
  utc.setUTCFullYear(year, month - 1, day);
  // A value like 2013-02-30 rolls over; that is not the date TMDB wrote.
  if (utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return null;
  return AIR_DATE_FORMAT.format(utc);
}
