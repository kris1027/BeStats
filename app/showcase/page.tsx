import { CircleStopIcon, SearchIcon, TvIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type * as React from "react";
import {
  CarouselRowEmpty,
  CarouselRowError,
  CarouselRowSkeleton,
  ROW_ITEM_CLASS,
  ROW_POSTER_SIZES,
} from "@/components/catalog/carousel-row-states";
import { CarouselScroller } from "@/components/catalog/carousel-scroller";
import { ArtFallback } from "@/components/catalog/landing/art-fallback";
import {
  LandingHeroSkeleton,
  NowSkeleton,
  PopularSkeleton,
  TopRatedSkeleton,
  TrendingSkeleton,
  UpcomingSkeleton,
  WIDE_CARD_CLASS,
} from "@/components/catalog/landing/landing-skeletons";
import { WideCardView } from "@/components/catalog/landing/wide-card";
import {
  ListEmptyPanel,
  ListErrorPanel,
} from "@/components/catalog/list-panels";
import { GameFacts } from "@/components/game/game-facts";
import { GameOverview } from "@/components/game/game-overview";
import { ScreenshotGallery } from "@/components/game/screenshot-gallery";
import { GlassPill } from "@/components/glass-pill";
import { IconKey } from "@/components/layout/icon-key";
import { LibraryNavView } from "@/components/layout/library-nav";
import { MobileMenuSheet } from "@/components/layout/mobile-menu-sheet";
import { PageBackgroundLayers } from "@/components/layout/page-background";
import {
  ContactEmail,
  ExternalLink,
  LegalList,
  LegalSection,
} from "@/components/legal/legal-document";
import {
  DatedPill,
  DateTbaPill,
  ReleasePill,
} from "@/components/library/dated-pill";
import { PosterCard } from "@/components/poster-card";
import { PosterGrid } from "@/components/poster-grid";
import {
  CalculatedRatingBadge,
  IgdbRatingBadge,
  PersonalScoreBadge,
  TmdbRatingBadge,
} from "@/components/rating-badges";
import { QuickSearchRow } from "@/components/search/quick-search-row";
import { PosterCardSkeleton, Skeleton } from "@/components/skeleton";
import { StatePanel } from "@/components/state-panel";
import {
  NextEpisodeIcon,
  PlanIcon,
  PlannedIcon,
  WatchedIcon,
} from "@/components/tracking/tracking-icons";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { catalogList, listPath } from "@/lib/catalog/lists";
import { TMDB_HOME_URL } from "@/lib/legal/operator";

import { CardRoundButtonDemo } from "./card-round-button-demo";
import { GameCardDemo } from "./game-card-demo";
import { GameLibraryCardDemo } from "./game-library-card-demo";
import { GameSearchDemo } from "./game-search-demo";

export const metadata: Metadata = {
  title: "Design system",
  robots: { index: false, follow: false },
};

/**
 * Every token, primitive, badge and state on one page (spec 0004, AC-19).
 *
 * Development only. `notFound()` under `NODE_ENV === "production"` runs at
 * prerender time, so a production build turns this route into a static 404
 * rather than shipping it, while `next dev` and Vitest still render it. That is
 * cheaper and harder to get wrong than a route group excluded at build time.
 *
 * Its job is drift detection: if a primitive changes and this page still shows
 * the old thing, the difference is visible in one place instead of spread
 * across whichever feature happened to notice.
 */

const LIGHT_POSTER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#C8B89A"/></svg>',
  );

/**
 * Flat 16:9 stand ins for IGDB screenshots, so the showcase needs no network.
 * Shades of SVG's default fill, so no colour value lives outside globals.css.
 */
const SCREENSHOTS = [0.2, 0.4, 0.6, 0.8, 1].map(
  (opacity) =>
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="1080" opacity="${opacity}"/></svg>`,
    ),
);

/** Every Facts entry, with a quarter date and a TBA, for the showcase (AC-16). */
const GAME_FACTS: React.ComponentProps<typeof GameFacts> = {
  gameModes: [
    { id: 1, name: "Single player" },
    { id: 2, name: "Multiplayer" },
  ],
  playerPerspectives: [{ id: 2, name: "Third person" }],
  themes: [{ id: 1, name: "Action" }],
  franchises: [{ id: 452, name: "The Witcher" }],
  series: [{ id: 62, name: "The Witcher" }],
  gameEngines: [
    { id: 24, name: "REDengine" },
    { id: 25, name: "REDengine 3" },
  ],
  platformReleases: [
    {
      platformId: 6,
      platform: "PC (Microsoft Windows)",
      release: { precision: "day", date: "2015-05-19" },
    },
    {
      platformId: 508,
      platform: "Nintendo Switch 2",
      release: { precision: "quarter", year: 2027, quarter: 1 },
    },
    {
      platformId: 169,
      platform: "Xbox Series X|S",
      release: { precision: "month", date: "2027-06-01" },
    },
    {
      platformId: 900,
      platform: "PlayStation 6",
      release: { precision: "tba" },
    },
  ],
};

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 border-t border-border pt-8">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
        {note ? (
          <p className="max-w-[65ch] text-sm text-muted-foreground">{note}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** A carousel row as a landing renders it, around fixed demo content. */
/** A landing state demo under its own small heading. */
function ShowcaseLanding({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-xl font-semibold tracking-[-0.02em] text-foreground md:text-2xl">
        {title}
      </h3>
      {children}
    </div>
  );
}

function ShowcaseRow({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <CarouselScroller
        label={title}
        heading={
          <h3 className="text-xl font-semibold tracking-[-0.02em] text-foreground md:text-2xl">
            {title}
          </h3>
        }
        seeAll={
          <a
            href={listPath(catalogList("tv", "top-rated"))}
            className="hit-area rounded-sm text-sm text-muted-foreground hover:text-foreground"
          >
            See all
          </a>
        }
      >
        {children}
      </CarouselScroller>
    </div>
  );
}

function Swatch({ name, className }: { name: string; className: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className={`h-14 rounded-lg border border-border ${className}`} />
      <code className="text-xs text-muted-foreground">{name}</code>
    </div>
  );
}

export default function ShowcasePage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl font-extrabold tracking-[-0.03em] text-foreground">
          Design system
        </h1>
        <p className="max-w-[65ch] text-[15px] text-muted-foreground">
          Every token and primitive the rest of BeStats composes. Development
          only: this route is a 404 in production.
        </p>
      </header>

      <Section
        title="Plates"
        note="The opaque surfaces painted under glass. Flat colour, no gradient."
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Swatch name="--color-glass-plate" className="bg-glass-plate" />
          <Swatch
            name="--color-glass-plate-panel"
            className="bg-glass-plate-panel"
          />
          <Swatch
            name="--color-glass-plate-sheet"
            className="bg-glass-plate-sheet"
          />
          <Swatch
            name="--color-glass-plate-score"
            className="bg-glass-plate-score"
          />
        </div>
      </Section>

      <Section
        title="Meaning carrying colours"
        note="Three colours, three meanings. Nothing else may borrow them, including focus."
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Swatch name="TMDB rating" className="bg-rating-tmdb" />
          <Swatch name="Your score" className="bg-score-personal" />
          <Swatch name="Planned" className="bg-status-planned" />
        </div>
      </Section>

      <Section
        title="Glass surfaces"
        note="The rim follows the radius at every shape, which is what the two layer background technique buys over border-image."
      >
        <div className="flex flex-wrap items-center gap-4">
          <div className="glass glass-rim glass-plate glass-shadow flex h-10 items-center rounded-full px-5 text-sm">
            Pill
          </div>
          <div className="glass glass-rim glass-plate glass-shadow flex size-16 items-center justify-center rounded-lg text-sm">
            Card
          </div>
          <div className="glass glass-rim glass-plate-panel glass-shadow flex h-24 w-40 items-center justify-center rounded-panel text-sm">
            Panel
          </div>
          <div className="glass-selected glass-rim glass-plate glass-shadow flex h-10 items-center rounded-full px-5 text-sm">
            Selected
          </div>
          <div className="glass glass-rim glass-plate glass-shadow flex items-center gap-1 rounded-full p-[4.5px]">
            <span className="glass-selected-personal glass-rim flex h-7 items-center rounded-full px-4 text-xs font-semibold tracking-[0.07em] text-text-on-personal">
              SELECTED TAB
            </span>
            <span className="flex h-7 items-center px-4 text-xs font-semibold tracking-[0.07em] text-text-secondary">
              TAB
            </span>
          </div>
        </div>
      </Section>

      <Section
        title="The plate rule"
        note="Glass alone over a light poster leaves near white text at 1.59:1, which is unreadable. The plate underneath is doing the legibility work, not the gradient. Off posters the plates are frosted, see-through enough to show the background and blurred so it stays soft; over artwork plate-solid makes them opaque again. Each case is here so the rule is not theoretical."
      >
        <div className="flex flex-wrap gap-6">
          <div
            className="plate-solid relative flex h-40 w-40 items-center justify-center rounded-lg bg-cover"
            style={{ backgroundImage: `url("${LIGHT_POSTER}")` }}
          >
            <GlassPill>Solid on art</GlassPill>
          </div>
          <div
            className="relative flex h-40 w-40 items-center justify-center rounded-lg bg-cover"
            style={{ backgroundImage: `url("${LIGHT_POSTER}")` }}
          >
            {/* Deliberately frosted over artwork: legible only off posters. */}
            <GlassPill>Frosted on art</GlassPill>
          </div>
          <div
            className="relative flex h-40 w-40 items-center justify-center rounded-lg bg-cover"
            style={{ backgroundImage: `url("${LIGHT_POSTER}")` }}
          >
            {/* Deliberately plate-less: this is the broken case, shown on purpose. */}
            <span className="glass glass-rim glass-shadow inline-flex h-7 items-center rounded-full px-2.5 text-[13px] font-bold text-foreground">
              No plate
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {(
            [
              ["glass-plate", "Control 65%"],
              ["glass-plate-panel", "Panel 60%"],
              ["glass-plate-sheet", "Sheet 75%"],
              ["glass-plate-float", "Float 90%"],
            ] as const
          ).map(([plate, label]) => (
            <span
              key={plate}
              className={`glass glass-rim glass-shadow ${plate} inline-flex h-11 items-center rounded-full px-4 text-sm text-muted-foreground`}
            >
              {label}
            </span>
          ))}
          <span className="plate-solid glass glass-rim glass-plate glass-shadow inline-flex h-11 items-center rounded-full px-4 text-sm text-muted-foreground">
            Solid, the fallback look
          </span>
        </div>
      </Section>

      <Section title="Badges">
        <div className="flex flex-wrap items-center gap-3">
          <TmdbRatingBadge value={8.2} />
          <TmdbRatingBadge value={null} />
          <IgdbRatingBadge value={8.7} />
          <PersonalScoreBadge value={9} />
          <PersonalScoreBadge value={null} />
          <CalculatedRatingBadge value={7} label="Your season rating" />
          <CalculatedRatingBadge value={22 / 3} label="Your show rating" />
          <GlassPill icon={<TvIcon aria-hidden="true" />}>S1E1</GlassPill>
          <GlassPill icon={<PlannedIcon />}>Planned</GlassPill>
          <GlassPill icon={<PlanIcon />}>Plan</GlassPill>
          <GlassPill icon={<WatchedIcon filled />}>Watched</GlassPill>
          <GlassPill icon={<WatchedIcon filled={false} />}>
            Mark watched
          </GlassPill>
          <GlassPill icon={<CircleStopIcon aria-hidden="true" />}>
            Stop watching
          </GlassPill>
          <GlassPill icon={<NextEpisodeIcon />}>S2E4</GlassPill>
          <DatedPill
            slot="showcase-dated-pill"
            label="Releases December 25, 2026"
            text="Dec 25"
          />
          <DatedPill
            slot="showcase-dated-pill"
            label="Releases February 3, 2027"
            text="Feb 3, 2027"
          />
          <DateTbaPill label="Release date to be announced" />
        </div>
        <p className="max-w-[65ch] text-sm text-muted-foreground">
          A TMDB badge with no value renders nothing; a personal score with no
          value renders &ldquo;Not rated&rdquo;. Plan, Planned and the watched
          marks are the movie tracking marks from spec 0007, drawn from the
          original legend&rsquo;s paths and listed in the footer&rsquo;s icon
          key. Next episode is the Watchlist show card&rsquo;s pill, and the
          dated and Date TBA pills sit on Upcoming cards (spec 0020); below{" "}
          <code>sm</code> a date that carries its year drops the calendar glyph.
        </p>
      </Section>

      <Section
        title="Icon key"
        note="The footer's key to the card marks, on every route. A new mark adds its entry there rather than a per page legend (prompts/grid-tabs-footer-legend.md)."
      >
        <IconKey />
      </Section>

      <Section
        title="Library links"
        note="The navbar's library pill on each tab (prompts/library-page-names.md): the routes are shared, but each page is named for the tab, through libraryPageName. Shows read Up next, Upcoming and Watched; movies Watchlist, Coming soon and Watched; games Coming soon, Want to play, Playing and Finished (prompts/game-coming-soon.md)."
      >
        <div className="flex flex-col items-start gap-3">
          <LibraryNavView variant="bar" pathname="/watchlist" type="tv" />
          <LibraryNavView variant="bar" pathname="/upcoming" type="movie" />
          <LibraryNavView variant="bar" pathname="/coming-soon" type="game" />
        </div>
      </Section>

      <Section title="Buttons and controls">
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Glass, sm</Button>
          <Button size="touch">Glass, touch</Button>
          <Button size="bar">Glass, bar</Button>
          <Button size="icon-bar" aria-label="Icon bar">
            <SearchIcon className="size-5" aria-hidden="true" />
          </Button>
          <Button size="lg" variant="selected">
            Selected, lg
          </Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="link">Link</Button>
          <Button variant="destructive">Destructive</Button>
          <Button size="sm" disabled>
            Disabled
          </Button>
          <CardRoundButtonDemo />
          <ButtonLink href="/shows" size="sm">
            Button link
          </ButtonLink>
        </div>
        <ToggleGroup defaultValue={["all"]} aria-label="Example filter">
          <ToggleGroupItem value="all">ALL</ToggleGroupItem>
          <ToggleGroupItem value="watched">WATCHED</ToggleGroupItem>
          <ToggleGroupItem value="planned">PLANNED</ToggleGroupItem>
        </ToggleGroup>
        <div className="max-w-sm">
          <Input placeholder="Search shows" aria-label="Search shows" />
        </div>
      </Section>

      <Section
        title="Poster card and grid"
        note="A card with artwork and a card with none occupy identical space, so a grid with missing posters does not shift."
      >
        <PosterGrid>
          <li>
            <PosterCard
              title="A title with a poster"
              posterUrl={LIGHT_POSTER}
              href="/shows"
              badge={<TmdbRatingBadge value={7.4} />}
            />
          </li>
          <li>
            <PosterCard
              title="A title with no poster at all, whose name runs long"
              posterUrl={null}
              href="/shows"
              badge={<TmdbRatingBadge value={6.1} />}
            />
          </li>
          <li>
            <PosterCard
              title="With controls"
              posterUrl={LIGHT_POSTER}
              href="/shows"
              badge={<TmdbRatingBadge value={9} />}
              controls={
                <>
                  <GlassPill icon={<TvIcon aria-hidden="true" />}>
                    S2E3
                  </GlassPill>
                  <Button size="icon" aria-label="Add to watchlist">
                    <PlanIcon className="size-4" />
                  </Button>
                </>
              }
            />
          </li>
          <li>
            <PosterCardSkeleton />
          </li>
          <li>
            <PosterCard
              title="A second poster"
              posterUrl={LIGHT_POSTER}
              href="/shows"
              badge={<TmdbRatingBadge value={8.2} />}
            />
          </li>
          <li>
            <PosterCard
              title="A sixth card, filling the row"
              posterUrl={null}
              href="/shows"
              badge={<TmdbRatingBadge value={5.8} />}
            />
          </li>
        </PosterGrid>
      </Section>

      <Section
        title="Game card"
        note="A game on /games, the /games lists and /search (spec 0030): the release year under the name; a visitor gets no bottom row; a signed in user gets the Want to play bookmark (green when pressed, with the release date or Date TBA while a wanted game is not out), or a read only Playing or Finished chip on a game they started. Your score replaces the IGDB rating only on a scored Playing or Finished game. The bookmark here toggles locally."
      >
        <GameCardDemo poster={LIGHT_POSTER} />
      </Section>

      <Section
        title="Game library card"
        note="The games tabs of /coming-soon, /watchlist, /upcoming and /watched, named Coming soon, Want to play, Playing and Finished (spec 0027, spec 0030, prompts/game-coming-soon.md): Want to play and Coming soon show the IGDB community rating and the green bookmark that removes it, and Coming soon, which holds the Want to play games not out yet, their date or Date TBA; Playing and Finished show the status chip and the X, and your score when there is one, else the community rating, with the month under the name. A game IGDB hides keeps its card but has no link, and a game IGDB no longer has keeps only its removal."
      >
        <GameLibraryCardDemo poster={LIGHT_POSTER} />
      </Section>

      <Section
        title="Game page sections"
        note="Under the game hero (spec 0031): the Overview with IGDB's storyline under Story and the company lines, the same Overview with no storyline, the Screenshots row whose thumbnails open one dialog (Previous, Next, the arrow keys, focus back on the thumbnail), and Facts with a quarter date and IGDB's own TBA sorted last. Every part is left out when IGDB has nothing."
      >
        <div className="flex flex-col gap-10">
          <GameOverview
            summary="A story driven open world RPG set in a dark fantasy universe."
            storyline={
              "The witcher Geralt searches for Ciri.\n\nThe Wild Hunt is close behind."
            }
            developers={["CD Projekt RED"]}
            publishers={["CD Projekt", "WB Games"]}
          />
          <GameOverview
            summary="A summary with no storyline below it."
            storyline={null}
            developers={["A studio"]}
            publishers={[]}
          />
          <ScreenshotGallery
            name="A showcase game"
            screenshotUrls={SCREENSHOTS}
          />
          <GameFacts {...GAME_FACTS} />
        </div>
      </Section>

      <Section
        title="Carousel row"
        note="A title page row (Cast, More like this): the header and arrows are prerendered, the cards stream behind skeletons, and a failed or empty list keeps a card's height so nothing shifts. The arrows show from md and are disabled at each end. The landing sections reuse the error and empty lines."
      >
        <div className="flex flex-col gap-10">
          <ShowcaseRow title="With cards">
            <ul className="flex gap-3 md:gap-4">
              {Array.from({ length: 8 }, (_, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static demo cards with no identity.
                <li key={index} className={ROW_ITEM_CLASS}>
                  <PosterCard
                    title={`Row card ${index + 1}`}
                    posterUrl={index % 3 === 2 ? null : LIGHT_POSTER}
                    href="/shows"
                    badge={<TmdbRatingBadge value={7.4} />}
                    sizes={ROW_POSTER_SIZES}
                  />
                </li>
              ))}
            </ul>
          </ShowcaseRow>
          <ShowcaseRow title="Loading">
            <CarouselRowSkeleton />
          </ShowcaseRow>
          <ShowcaseRow title="Top rated">
            <CarouselRowError list={catalogList("tv", "top-rated")} />
          </ShowcaseRow>
          <ShowcaseRow title="Empty">
            <CarouselRowEmpty />
          </ShowcaseRow>
        </div>
      </Section>

      <Section
        title="Landing sections"
        note="The /movies and /shows landing (prompts/home-parallax-landing.md): each section's loading shape as it streams, a failed and an empty section, and the missing artwork tile of the hero and a wide card. A failed trending read shows no hero, only the Trending row's error. The motion lives in LandingParallax and never runs here."
      >
        <div className="flex flex-col gap-10">
          {/*
           * The hero pulls up behind the navbar by main's padding plus the
           * bar's height; the padding here gives that pull room in place.
           */}
          <div className="relative overflow-hidden pt-[calc(2rem+var(--navbar-height))] md:pt-[calc(3rem+var(--navbar-height))]">
            <LandingHeroSkeleton />
          </div>
          <div className="-mx-4 overflow-x-auto px-4">
            <TrendingSkeleton />
          </div>
          <PopularSkeleton />
          <NowSkeleton />
          <UpcomingSkeleton />
          <TopRatedSkeleton />
          <ShowcaseLanding title="A failed section">
            <CarouselRowError list={catalogList("movie", "trending")} />
          </ShowcaseLanding>
          <ShowcaseLanding title="An empty section">
            <CarouselRowEmpty />
          </ShowcaseLanding>
          <ShowcaseLanding title="Missing artwork">
            <div className="flex flex-wrap items-start gap-4">
              <div className="relative aspect-video w-full max-w-md overflow-hidden rounded-lg">
                <ArtFallback iconClassName="size-10" />
              </div>
              <div
                className={`relative overflow-hidden rounded-lg ${WIDE_CARD_CLASS}`}
              >
                <ArtFallback />
                <span
                  aria-hidden="true"
                  className="rim glass-rim pointer-events-none absolute inset-0 rounded-lg"
                />
              </div>
            </div>
          </ShowcaseLanding>
        </div>
      </Section>

      <Section
        title="Games landing and lists"
        note="/games and its list pages (spec 0028): a game card shows its cover, name and the IGDB community rating, with no personal badge or controls until G8; on Coming soon it prints the release day. A wide card shows the game's IGDB art, else its cover cropped to fill, else the missing artwork tile. A failed games section names IGDB, and a list page has its own retry and empty panels."
      >
        <div className="flex flex-col gap-10">
          <ShowcaseLanding title="Game cards">
            <div className="flex flex-wrap items-start gap-4">
              <div className="w-40 md:w-60">
                <PosterCard
                  title="A game with a cover"
                  posterUrl={LIGHT_POSTER}
                  href="/games/1942"
                  badge={<IgdbRatingBadge value={8.7} />}
                />
              </div>
              <div className="w-40 md:w-60">
                <PosterCard
                  title="On Coming soon"
                  posterUrl={LIGHT_POSTER}
                  href="/games/1942"
                  badge={<IgdbRatingBadge value={8.7} />}
                  controls={
                    <ReleasePill
                      release={{
                        shortDate: "Nov 6",
                        fullDate: "November 6, 2026",
                      }}
                    />
                  }
                />
              </div>
            </div>
          </ShowcaseLanding>
          <ShowcaseLanding title="Wide game cards">
            <div className="flex flex-wrap items-start gap-4">
              <WideCardView
                item={{
                  title: "With IGDB art",
                  href: "/games/1942",
                  backdropUrl: LIGHT_POSTER,
                  posterUrl: null,
                }}
                label="Nov 6"
                badge={<IgdbRatingBadge value={8.7} />}
              />
              <WideCardView
                item={{
                  title: "No art, cover cropped",
                  href: "/games/1942",
                  backdropUrl: null,
                  posterUrl: LIGHT_POSTER,
                }}
                label="Jan 8, 2027"
                badge={<IgdbRatingBadge value={null} />}
              />
              <WideCardView
                item={{
                  title: "No art and no cover",
                  href: "/games/1942",
                  backdropUrl: null,
                  posterUrl: null,
                }}
                label="Feb 3"
                badge={<IgdbRatingBadge value={7.2} />}
              />
            </div>
          </ShowcaseLanding>
          <ShowcaseLanding title="A failed games section">
            <CarouselRowError list={catalogList("game", "popular")} />
          </ShowcaseLanding>
          <ShowcaseLanding title="A games list page that failed">
            <ListErrorPanel
              list={catalogList("game", "top-rated")}
              href="/games/top-rated"
            />
          </ShowcaseLanding>
          <ShowcaseLanding title="An empty games list page">
            <ListEmptyPanel list={catalogList("game", "coming-soon")} />
          </ShowcaseLanding>
        </div>
      </Section>

      <Section
        title="Game search"
        note="/search?type=game (spec 0029): the platform picker open with a filter typed, a ticked platform the filter hides staying ticked, the No platforms match state, and the picker disabled when IGDB's platform list failed. Below, games quick search rows with a cover and without one, rated by IGDB's community rating."
      >
        <div className="flex flex-col gap-8">
          <GameSearchDemo />
          <div className="glass glass-rim glass-plate-float glass-shadow flex w-full max-w-[28rem] flex-col gap-1 rounded-panel p-2">
            {[
              {
                id: 1,
                title: "A game with a cover",
                year: 2017,
                posterUrl: LIGHT_POSTER,
                rating: 9.1,
                href: "/games/1",
              },
              {
                id: 2,
                title: "A game with no cover or year",
                year: null,
                posterUrl: null,
                rating: null,
                href: "/games/2",
              },
            ].map((result) => (
              <div
                key={result.id}
                className="flex items-center gap-4 px-3 py-2"
              >
                <QuickSearchRow result={result} type="game" />
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section
        title="Loading"
        note="Skeletons in the shape of what they replace. The pulse is cut entirely under prefers-reduced-motion."
      >
        <div className="flex flex-wrap items-end gap-4">
          <Skeleton shape="poster" className="w-28" />
          <Skeleton shape="pill" />
          <Skeleton shape="line" className="w-48" />
        </div>
      </Section>

      <Section
        title="States"
        note="The error and signed out panels cannot render without an action. That is a type error at the call site and a thrown error at render."
      >
        <div className="grid gap-6 lg:grid-cols-3">
          <StatePanel
            variant="empty"
            title="Nothing here yet"
            description="Your watchlist is empty. Titles you plan to watch show up here."
          />
          <StatePanel
            variant="error"
            title="Something went wrong"
            description="We could not reach TMDB just now. Your watch history is safe."
            action={<Button size="touch">Try again</Button>}
          />
          <StatePanel
            variant="signed-out"
            title="Sign in to track this"
            description="Your watchlist, history and ratings are private to your account."
            action={
              <ButtonLink href="/sign-in" size="touch" variant="selected">
                Sign in
              </ButtonLink>
            }
          />
        </div>
      </Section>

      <Section
        title="Overlays"
        note="Base UI supplies the focus trap, the focus return, Escape, the scroll lock and the inert background. Open one with the keyboard and tab through it."
      >
        <div className="flex flex-wrap items-center gap-3">
          <MobileMenuSheet>
            <LibraryNavView variant="sheet" pathname="/watchlist" type="tv" />
          </MobileMenuSheet>

          <Dialog>
            <DialogTrigger render={<Button size="touch" />}>
              Open dialog
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>A modal dialog</DialogTitle>
                <DialogDescription>
                  The same glass sheet, centred rather than dropped from the
                  top.
                </DialogDescription>
              </DialogHeader>
            </DialogContent>
          </Dialog>
        </div>
      </Section>

      <Section title="Card">
        <Card className="max-w-sm">
          <CardTitle>A glass card</CardTitle>
          <CardDescription>
            Plate, glass, rim, at the card radius. The stock shadcn hairline
            ring is gone.
          </CardDescription>
        </Card>
      </Section>

      <Section
        title="Page background"
        note="Behind every page, this one included: a warm red gradient fading to near black, three soft blobs, a faint pinstripe, a dark wash, a vignette and film grain. Every layer is in the prerendered HTML; one small client loop drifts the blobs over time, slides the layers with scroll and leans them toward a mouse, and stays still under reduced motion. The wash and the landing's glows and orbs are set so muted text keeps 4.5:1 over the brightest pixel the layers can stack to (prompts/warm-page-background.md)."
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Swatch name="--color-page-top" className="bg-page-top" />
          <Swatch name="--color-page-mid" className="bg-page-mid" />
          <Swatch name="--color-page-deep" className="bg-page-deep" />
          <Swatch name="--color-page-blob-red" className="bg-page-blob-red" />
          <Swatch
            name="--color-page-blob-amber"
            className="bg-page-blob-amber"
          />
          <Swatch name="--color-page-blob-deep" className="bg-page-blob-deep" />
          <Swatch name="--color-page-stripe" className="bg-page-stripe" />
          <Swatch name="--color-page-wash" className="bg-page-wash" />
          <Swatch name="--color-page-shade" className="bg-page-shade" />
          <Swatch name="--color-page-glow" className="bg-page-glow" />
          <Swatch name="--color-page-orb" className="bg-page-orb" />
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <div className="relative h-80 overflow-hidden rounded-panel border border-border">
            <PageBackgroundLayers />
          </div>
          <code className="text-xs text-muted-foreground">
            the layers at rest, as under reduced motion
          </code>
        </div>
      </Section>

      <Section
        title="Legal text and the footer"
        note="The pieces /privacy and /terms are built from (spec 0017). There is no typography plugin, so lists and links are styled by hand. The site footer itself renders below every page, including this one: flat, no glass, links at the 44px and 36px touch heights."
      >
        <div className="max-w-[72ch]">
          <LegalSection title="Sample section">
            <p>
              Body text in the secondary token, with an{" "}
              <ExternalLink href={TMDB_HOME_URL}>external link</ExternalLink>{" "}
              and the contact address, <ContactEmail />.
            </p>
            <LegalList>
              <li>A list item in body text.</li>
              <li>A second item, to show the gap.</li>
            </LegalList>
          </LegalSection>
        </div>
      </Section>
    </div>
  );
}
