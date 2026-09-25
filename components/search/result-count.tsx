import { formatPartialCount, formatResultCount } from "@/lib/search/count";
import type { SearchType } from "@/lib/search/params";

/**
 * The line above the results, in the one form that is true for the mode
 * (spec 0010, AC-11, AC-12, AC-14): a heading for browse, TMDB's exact or
 * capped total for discover and plain search, and a labelled partial range
 * for filtered search, which never knows its filtered total.
 */
type ResultCountProps =
  | { kind: "browse"; type: SearchType }
  | {
      kind: "exact";
      type: SearchType;
      total: number;
      endpoint: "search" | "discover";
    }
  | {
      kind: "partial";
      matches: number;
      fromIndex: number;
      toIndex: number;
      totalResults: number;
      query: string;
    };

function ResultCount(props: ResultCountProps) {
  let text: string;
  if (props.kind === "browse") {
    text = `Popular ${props.type === "movie" ? "movies" : "shows"} on TMDB`;
  } else if (props.kind === "exact") {
    text = formatResultCount(props.total, props.type, props.endpoint);
  } else {
    text = formatPartialCount(props);
  }

  return (
    <p
      data-slot="result-count"
      className="text-sm text-muted-foreground tabular-nums md:text-base"
    >
      {text}
    </p>
  );
}

export { ResultCount };
