import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { RetryLink } from "@/components/retry-link";
import { EpisodeList } from "@/components/show/episode-list";
import { SeasonHeader } from "@/components/show/season-header";
import { SeasonNav } from "@/components/show/season-nav";
import { SeasonSkeleton } from "@/components/show/season-skeleton";
import { StatePanel } from "@/components/state-panel";
import { SeasonTrackingSlot } from "@/components/tracking/season-tracking-slot";
import { SeasonTrackingStore } from "@/components/tracking/season-tracking-store";
import { ButtonLink } from "@/components/ui/button";
import { parseSeasonNumber, parseTmdbId } from "@/lib/catalog/ids";
import { adjacentSeasons, orderSeasons } from "@/lib/catalog/seasons";
import { truncateAtWord } from "@/lib/format";
import { episodeIdsKey } from "@/lib/tracking/episode-state";

import { loadSeason } from "./load-season";

/** Longest meta description the page emits (spec 0009, AC-16). */
const DESCRIPTION_LIMIT = 160;

type SeasonParams = PageProps<"/shows/[id]/season/[number]">["params"];

/** Both segments, or null when either is malformed (spec 0009, AC-13). */
async function parseParams(
  params: SeasonParams,
): Promise<{ id: number; seasonNumber: number } | null> {
  const raw = await params;
  const id = parseTmdbId(raw.id);
  const seasonNumber = parseSeasonNumber(raw.number);
  return id === null || seasonNumber === null ? null : { id, seasonNumber };
}

/**
 * The tab title and description, from the same `loadSeason` the body uses
 * (spec 0009, AC-16). Both not found branches set `noindex` themselves: the
 * status is already 200 when the body decides (AC-14).
 */
export async function generateMetadata({
  params,
}: PageProps<"/shows/[id]/season/[number]">): Promise<Metadata> {
  const parsed = await parseParams(params);
  if (parsed === null) {
    return { title: "Season not found", robots: { index: false } };
  }

  const result = await loadSeason(parsed.id, parsed.seasonNumber);
  switch (result.kind) {
    case "show_not_found":
      return { title: "Show not found", robots: { index: false } };
    case "season_not_found":
      return { title: "Season not found", robots: { index: false } };
    case "failed":
      return { title: "Season" };
    case "found": {
      const { season, show } = result;
      return {
        title: `${season.name} · ${show.name}`,
        description:
          season.overview === null
            ? undefined
            : truncateAtWord(season.overview, DESCRIPTION_LIMIT),
      };
    }
  }
}

/**
 * One season of a show, every episode on one page (spec 0009, AC-9 to
 * AC-12).
 *
 * A static shell like the show page (AC-17): only the Suspense boundary and
 * its skeleton; the season streams inside. Nothing here reads a session
 * (AC-18): the tracking places in the header and each row read it inside
 * their own Suspense boundaries, all sharing one read (spec 0011, AC-18,
 * AC-20).
 */
export default function SeasonPage({
  params,
}: PageProps<"/shows/[id]/season/[number]">) {
  return (
    <Suspense fallback={<SeasonSkeleton />}>
      <SeasonDetail params={params} />
    </Suspense>
  );
}

async function SeasonDetail({ params }: { params: SeasonParams }) {
  // `proxy.ts` already answered a malformed segment with a real 404; this is
  // the same rule again for any request that did not pass through it.
  const parsed = await parseParams(params);
  if (parsed === null) notFound();
  const { id, seasonNumber } = parsed;

  const result = await loadSeason(id, seasonNumber);

  // `not-found.tsx` receives no params, so only the show branch can use it;
  // the season branch needs the show's id to link back, and renders inline.
  if (result.kind === "show_not_found") notFound();

  if (result.kind === "season_not_found") {
    return (
      <div className="flex flex-1 flex-col justify-center py-12">
        <StatePanel
          variant="empty"
          title="We couldn't find that season"
          description={`TMDB lists no such season for ${result.show.name}.`}
          action={
            <ButtonLink size="touch" href={`/shows/${id}`}>
              Back to the show
            </ButtonLink>
          }
        />
      </div>
    );
  }

  if (result.kind === "failed") {
    return (
      <div className="flex flex-1 flex-col justify-center py-12">
        <StatePanel
          variant="error"
          title="Couldn't reach TMDB"
          description="TMDB didn't respond. Try again in a moment."
          action={<RetryLink href={`/shows/${id}/season/${seasonNumber}`} />}
        />
      </div>
    );
  }

  const { show, season } = result;
  const { previous, next } = adjacentSeasons(
    orderSeasons(show.seasons),
    seasonNumber,
  );
  // One key for the whole season, built once, so the header and every row
  // share one tracking read (spec 0011, AC-18).
  const idsKey = episodeIdsKey(season.episodes.map((episode) => episode.id));
  const episodes = season.episodes.map(({ id, episodeNumber, airDate }) => ({
    id,
    episodeNumber,
    airDate,
  }));

  return (
    <SeasonTrackingStore
      showId={id}
      seasonNumber={seasonNumber}
      returnPath={`/shows/${id}/season/${seasonNumber}`}
    >
      <article className="flex flex-col gap-8 md:gap-10">
        <SeasonHeader
          showId={id}
          showName={show.name}
          seasonName={season.name}
          posterUrl={season.posterUrl ?? show.posterUrl}
          airDate={season.airDate}
          episodeCount={season.episodes.length}
          overview={season.overview}
          tracking={
            <Suspense fallback={null}>
              <SeasonTrackingSlot
                showId={id}
                seasonNumber={seasonNumber}
                seasonName={season.name}
                idsKey={idsKey}
                episodes={episodes}
              />
            </Suspense>
          }
        />

        {season.episodes.length === 0 ? (
          <StatePanel
            variant="empty"
            title="No episodes yet"
            description="TMDB lists no episodes for this season yet."
            action={
              <ButtonLink size="touch" href={`/shows/${id}`}>
                Back to the show
              </ButtonLink>
            }
          />
        ) : (
          <EpisodeList
            seasonName={season.name}
            episodes={season.episodes}
            tracking={{ showId: id, idsKey }}
          />
        )}

        <SeasonNav showId={id} previous={previous} next={next} />
      </article>
    </SeasonTrackingStore>
  );
}
