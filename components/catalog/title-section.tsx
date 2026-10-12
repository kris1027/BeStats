import { RetryLink } from "@/components/retry-link";

/**
 * The h2 look every title page section shares: Overview, Seasons, Where to
 * watch, Cast, More like this and Facts (spec 0006, spec 0009, spec 0022).
 * One constant, so a new section cannot drift from the old ones.
 */
export const SECTION_HEADING_CLASS =
  "text-xl leading-tight font-bold text-foreground md:text-2xl";

/**
 * The one line a title page section shows when the extras read failed, with
 * a full page Retry (spec 0022, AC-18). It names no cause: a 404, a timeout
 * and a bad response all land here, and "didn't respond" would be untrue
 * for the first and the last.
 *
 * @param what What failed to load, as it reads after "Couldn't load".
 * @param href The title page, which the Retry reloads in full.
 */
export function SectionErrorLine({
  what,
  href,
}: {
  what: string;
  href: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <p className="text-[15px] text-muted-foreground">
        Couldn't load {what} from TMDB.
      </p>
      <RetryLink href={href} />
    </div>
  );
}
