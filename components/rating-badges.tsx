import { StarIcon } from "lucide-react";

import { GlassPill } from "@/components/glass-pill";
import { formatCalculatedRating, formatPersonalScore } from "@/lib/format";

/**
 * Community and personal ratings must never be confused for one another
 * (AGENTS.md section 9), so they ship as two named components rather than one
 * with a colour prop. The colour, the plate, the rim and the label all differ,
 * and the star is the only thing they share.
 *
 * Both take the raw value and do their own rounding. Calculated ratings show
 * one decimal place; an integer personal score shows none, because padding a
 * user's explicit `8` to `8.0` implies a precision they did not give.
 */

/**
 * The TMDB community rating, in amber. Renders nothing when TMDB has no
 * rating: an absent score is not a zero, and inventing one would break
 * AGENTS.md section 3.
 */
function TmdbRatingBadge({ value }: { value: number | null }) {
  if (value === null) return null;

  return (
    <GlassPill
      icon={
        <StarIcon
          className="fill-rating-tmdb text-rating-tmdb"
          aria-hidden="true"
        />
      }
    >
      <span className="sr-only">TMDB rating </span>
      {value.toFixed(1)}
    </GlassPill>
  );
}

/**
 * The user's own score, in cyan on the score plate with the cyan rim.
 *
 * Unlike the TMDB badge this one still renders when the value is null, as
 * "Not rated". A missing personal score is a state the user can act on, so
 * hiding it would hide the affordance; a missing community score is just
 * absent data.
 */
function PersonalScoreBadge({ value }: { value: number | null }) {
  return (
    <GlassPill
      tone="score"
      icon={
        <StarIcon
          className="fill-score-personal text-score-personal"
          aria-hidden="true"
        />
      }
    >
      <span className="sr-only">Your score </span>
      {formatPersonalScore(value)}
    </GlassPill>
  );
}

/**
 * A calculated season or show rating, in the same cyan as the user's own
 * score because it is still theirs, but always to one decimal (`AGENTS.md`
 * section 9, spec 0012).
 * A separate component from `PersonalScoreBadge` so an average and an
 * explicit score can never share a formatter by accident.
 *
 * `label` is a screen reader prefix for places with no visible label, the
 * season cards. The header and heading omit it: their visible "Your season
 * rating" already names the value, and a hidden copy would be read twice.
 */
function CalculatedRatingBadge({
  value,
  label,
}: {
  value: number | null;
  label?: string;
}) {
  return (
    <GlassPill
      tone="score"
      icon={
        <StarIcon
          className="fill-score-personal text-score-personal"
          aria-hidden="true"
        />
      }
    >
      {label ? <span className="sr-only">{label} </span> : null}
      {formatCalculatedRating(value)}
    </GlassPill>
  );
}

export { CalculatedRatingBadge, PersonalScoreBadge, TmdbRatingBadge };
