import { CATALOG_SOURCES } from "@/lib/catalog/media-type";
import {
  type CountEndpoint,
  formatPartialCount,
  formatResultCount,
  mediaNoun,
} from "@/lib/search/count";
import type { SearchType } from "@/lib/search/params";

/**
 * The line above the results, in the one form that is true for the mode
 * (spec 0010, AC-11, AC-12, AC-14): a heading for browse naming its source,
 * TMDB's exact or capped total or IGDB's exact one for discover and plain
 * search, and a labelled partial range for filtered search, which never knows
 * its filtered total (spec 0029, AC-4, AC-8).
 */
type ResultCountProps =
  | { kind: "browse"; type: SearchType }
  | {
      kind: "exact";
      type: SearchType;
      total: number;
      endpoint: CountEndpoint;
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
    text = `Popular ${mediaNoun(props.type)} on ${CATALOG_SOURCES[props.type]}`;
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
