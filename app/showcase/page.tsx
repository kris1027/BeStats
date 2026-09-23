import { CircleStopIcon, TvIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type * as React from "react";
import { GlassPill } from "@/components/glass-pill";
import { LibraryNav } from "@/components/layout/library-nav";
import { MobileMenuSheet } from "@/components/layout/mobile-menu-sheet";
import { PosterCard } from "@/components/poster-card";
import { PosterGrid } from "@/components/poster-grid";
import {
  PersonalScoreBadge,
  TmdbRatingBadge,
} from "@/components/rating-badges";
import { PosterCardSkeleton, Skeleton } from "@/components/skeleton";
import { StatePanel } from "@/components/state-panel";
import {
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
        </div>
      </Section>

      <Section
        title="The plate rule"
        note="Glass alone over a light poster leaves near white text at 1.59:1, which is unreadable. The plate underneath is doing the legibility work, not the gradient. Both cases are here so the rule is not theoretical."
      >
        <div className="flex flex-wrap gap-6">
          <div
            className="relative flex h-40 w-40 items-center justify-center rounded-lg bg-cover"
            style={{ backgroundImage: `url("${LIGHT_POSTER}")` }}
          >
            <GlassPill>Correct</GlassPill>
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
      </Section>

      <Section title="Badges">
        <div className="flex flex-wrap items-center gap-3">
          <TmdbRatingBadge value={8.2} />
          <TmdbRatingBadge value={null} />
          <PersonalScoreBadge value={9} />
          <PersonalScoreBadge value={null} />
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
        </div>
        <p className="max-w-[65ch] text-sm text-muted-foreground">
          A TMDB badge with no value renders nothing; a personal score with no
          value renders &ldquo;Not rated&rdquo;. Plan, Planned and the watched
          marks are the movie tracking marks from spec 0007, drawn from the
          legend&rsquo;s own paths. The remaining legend badges ship with the
          features that own their behaviour.
        </p>
      </Section>

      <Section title="Buttons and controls">
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Glass, sm</Button>
          <Button size="touch">Glass, touch</Button>
          <Button size="lg" variant="selected">
            Selected, lg
          </Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="link">Link</Button>
          <Button variant="destructive">Destructive</Button>
          <Button size="sm" disabled>
            Disabled
          </Button>
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
        </PosterGrid>
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
            <LibraryNav variant="sheet" />
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
    </div>
  );
}
