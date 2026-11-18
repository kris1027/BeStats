import { CalculatedRatingBadge } from "@/components/rating-badges";

/**
 * A calculated rating with its visible label and what it rests on (spec 0012,
 * AC-5, AC-7): "Your season rating 7.4 from 5 rated episodes".
 *
 * Shared by the season header and the show page heading so both read the
 * same way. Not interactive, so it adds no tab stop (AC-16). The badge takes
 * no hidden label here, because the visible one already names it.
 *
 * @param basis The muted note after the pill, or null to leave it out.
 */
function CalculatedRatingLine({
  label,
  value,
  basis,
}: {
  label: string;
  value: number | null;
  basis: string | null;
}) {
  return (
    <p
      data-slot="calculated-rating"
      className="inline-flex flex-wrap items-center gap-2 text-sm text-text-secondary"
    >
      <span>{label}</span>
      <CalculatedRatingBadge value={value} />
      {basis ? <span>{basis}</span> : null}
    </p>
  );
}

/** "1 rated episode", "5 rated seasons". */
function ratedCount(count: number, noun: "episode" | "season"): string {
  return `${count} rated ${noun}${count === 1 ? "" : "s"}`;
}

export { CalculatedRatingLine, ratedCount };
