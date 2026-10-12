import Image from "next/image";
import type * as React from "react";

import { GlassPill } from "@/components/glass-pill";
import type { Region } from "@/lib/catalog/region";
import { formatAirDate, formatUsdCompact, languageName } from "@/lib/format";
import type { Company, Movie, TvShow } from "@/lib/tmdb";

import { SECTION_HEADING_CLASS } from "./title-section";

/**
 * The key crew under the overview (spec 0022, AC-15): "Directed by" and
 * "Written by" for a movie, "Created by" for a show. Each line only when it
 * has a name, and nothing at all when none does.
 */
function CrewLines({
  lines,
}: {
  lines: ReadonlyArray<{ label: string; names: string[] }>;
}) {
  const shown = lines.filter((line) => line.names.length > 0);
  if (shown.length === 0) return null;

  return (
    <dl className="flex flex-col gap-1 text-[15px]">
      {shown.map((line) => (
        <div key={line.label} className="flex flex-wrap gap-x-1.5">
          <dt className="text-muted-foreground">{line.label}</dt>
          <dd className="font-semibold text-foreground">
            {line.names.join(", ")}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** A movie's crew lines, from the crew `getMovie` already read. */
function MovieCrew({ movie }: { movie: Pick<Movie, "directors" | "writers"> }) {
  return (
    <CrewLines
      lines={[
        { label: "Directed by", names: movie.directors },
        { label: "Written by", names: movie.writers },
      ]}
    />
  );
}

/** A show's crew line, from `created_by` on `getTvShow`. */
function ShowCrew({ show }: { show: Pick<TvShow, "createdBy"> }) {
  return <CrewLines lines={[{ label: "Created by", names: show.createdBy }]} />;
}

/**
 * The hero's age rating chip for the visitor's country (spec 0022, AC-13).
 * The country is named for assistive technology and on hover, since a bare
 * "16" means little without it (AC-9). Rendered only when the country has a
 * rating; another country's is never borrowed.
 */
function AgeRatingChip({ rating, region }: { rating: string; region: Region }) {
  return (
    <GlassPill data-slot="age-rating" title={`Age rating in ${region.name}`}>
      <span className="sr-only">Age rating in {region.name}: </span>
      {rating}
    </GlassPill>
  );
}

type Fact = { label: string; value: React.ReactNode };

/**
 * The Facts panel at the end of a title page (spec 0022, AC-16): a list of
 * labelled values, each only when TMDB has one. Nothing is shown as Unknown
 * or 0; with no facts at all the panel is left out.
 */
function FactsPanel({ facts }: { facts: Array<Fact | null> }) {
  const shown = facts.filter((fact): fact is Fact => fact !== null);
  if (shown.length === 0) return null;

  return (
    <section aria-labelledby="facts-heading" className="flex flex-col gap-4">
      <h2 id="facts-heading" className={SECTION_HEADING_CLASS}>
        Facts
      </h2>
      <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((fact) => (
          <div key={fact.label} className="flex min-w-0 flex-col gap-1">
            <dt className="text-sm text-muted-foreground">{fact.label}</dt>
            <dd className="text-[15px] break-words text-foreground">
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** A fact with a text value, or null when there is no value. */
function textFact(label: string, value: string | null): Fact | null {
  return value === null || value === "" ? null : { label, value };
}

/** Company names joined, or null when TMDB lists none. */
function companiesFact(label: string, companies: Company[]): Fact | null {
  return companies.length === 0
    ? null
    : { label, value: companies.map((company) => company.name).join(", ") };
}

/** A movie's facts, all from `getMovie` (AC-16). */
function MovieFacts({ movie }: { movie: Movie }) {
  return (
    <FactsPanel
      facts={[
        textFact("Status", movie.status),
        movie.originalTitle !== movie.title
          ? textFact("Original title", movie.originalTitle)
          : null,
        textFact("Original language", languageName(movie.originalLanguage)),
        movie.budget === null
          ? null
          : { label: "Budget", value: formatUsdCompact(movie.budget) },
        movie.revenue === null
          ? null
          : { label: "Revenue", value: formatUsdCompact(movie.revenue) },
        companiesFact("Production companies", movie.productionCompanies),
      ]}
    />
  );
}

/** A show's facts, all from `getTvShow` (AC-16). */
function ShowFacts({ show }: { show: TvShow }) {
  return (
    <FactsPanel
      facts={[
        textFact("Status", show.status),
        textFact("Type", show.type),
        textFact("Original language", languageName(show.originalLanguage)),
        show.networks.length === 0
          ? null
          : {
              label: "Networks",
              value: <NetworkList networks={show.networks} />,
            },
        companiesFact("Production companies", show.productionCompanies),
        textFact("First aired", formatAirDate(show.firstAirDate)),
        textFact("Last aired", formatAirDate(show.lastAirDate)),
      ]}
    />
  );
}

/**
 * A show's networks: each `w154` logo on a mid grey tile, followed by the
 * name. TMDB's network logos come both white and dark, so no single tile
 * keeps every one readable, and the name is what always reads; the logo is
 * decoration beside it (`alt=""`). With no logo, the name alone.
 */
function NetworkList({ networks }: { networks: Company[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {networks.map((network) => (
        <li key={network.id} className="flex items-center gap-2">
          {network.logoUrl === null ? null : (
            <span className="inline-flex h-8 items-center rounded-md bg-muted-foreground px-2">
              <Image
                src={network.logoUrl}
                alt=""
                width={77}
                height={24}
                className="h-5 w-auto max-w-24 object-contain"
              />
            </span>
          )}
          {network.name}
        </li>
      ))}
    </ul>
  );
}

export { AgeRatingChip, MovieCrew, MovieFacts, ShowCrew, ShowFacts };
