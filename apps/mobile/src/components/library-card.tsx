import type { V1LibraryEntry } from "@bestats/core/api/v1/library";
import type { LibraryPageKey } from "@bestats/core/catalog/library-list";
import type { EpisodePlace } from "@bestats/core/tv/library-page";
import { useQuery } from "@tanstack/react-query";
import type { Href } from "expo-router";
import type { ReactNode } from "react";
import { View } from "react-native";

import { NextEpisodeIcon } from "@/components/icons";
import { Text } from "@/components/text";
import { catalogKeys, fetchSeason, findEpisode } from "@/lib/catalog";
import type { CardAction } from "@/lib/library-actions";
import { type CardBadge, libraryCardView } from "@/lib/library-card";
import { CARD_FONT_SCALE_CAP } from "@/theme/font-scale";

import { CARD_ACTION_SIZE, CardActionButton } from "./card-action-button";
import { CardLink } from "./card-link";
import {
  useGameCardMenu,
  useMovieCardMenu,
  useShowCardMenu,
} from "./card-menus";
import { PlateSolid } from "./glass/plate";
import { GlassPill, RatingStar } from "./glass-pill";
import { CARD_INSET, PosterFrame } from "./poster-card";

/** A card's quick action, wired by the library screen. */
export type CardActionSlot = {
  action: CardAction;
  disabled: boolean;
  onPress: () => void;
};

/**
 * The badge over the poster's top left corner as the web's pill: the user's
 * own score on the cyan score plate, a community rating in amber, never the
 * same tone (AGENTS.md section 9).
 */
function Badge({ badge }: { badge: CardBadge }) {
  const personal = badge.tone === "personal";
  return (
    <View style={{ position: "absolute", top: CARD_INSET, left: CARD_INSET }}>
      <GlassPill
        tone={personal ? "score" : "neutral"}
        icon={<RatingStar tone={personal ? "personal" : "community"} />}
      >
        {badge.text}
      </GlassPill>
    </View>
  );
}

/** A grey line under a card's name, capped as the poster's width asks. */
function CardLine({
  numberOfLines,
  children,
}: {
  numberOfLines?: number;
  children: string;
}) {
  return (
    <Text
      numberOfLines={numberOfLines}
      maxFontSizeMultiplier={CARD_FONT_SCALE_CAP}
      className="text-xs text-text-secondary"
    >
      {children}
    </Text>
  );
}

/** What `CardLink` draws for a library card, besides its href and menu. */
type LinkProps = {
  title: string;
  label: string;
  width: number;
  children: ReactNode;
};

type EntryOf<T extends V1LibraryEntry["type"]> = Extract<
  V1LibraryEntry,
  { type: T }
>;

/**
 * The library card's link with the catalog card's menu for its type
 * (prompts/mobile-look-library.md, decisions 1 and 3), built from the state
 * the library page already returned (`entry.user`), so the menu costs no
 * read. Its writes are the title screen's, whose invalidation of every
 * library page lets the server move the card (AGENTS.md section 9).
 */
function MenuLink({
  entry,
  today,
  ...link
}: LinkProps & { entry: V1LibraryEntry; today: string }) {
  switch (entry.type) {
    case "movie":
      return <MovieMenuLink entry={entry} today={today} {...link} />;
    case "tv":
      return <ShowMenuLink entry={entry} {...link} />;
    case "game":
      return <GameMenuLink entry={entry} today={today} {...link} />;
  }
}

/** The release date of a card the catalog answered, else none. */
function releaseDateOf(card: EntryOf<"movie" | "game">["card"]) {
  return card?.kind === "title" ? card.releaseDate : null;
}

function MovieMenuLink({
  entry,
  today,
  ...link
}: LinkProps & { entry: EntryOf<"movie">; today: string }) {
  const menu = useMovieCardMenu(
    entry.id,
    entry.user,
    releaseDateOf(entry.card),
    today,
  );
  return <CardLink href={entry.path as Href} menu={menu} {...link} />;
}

function ShowMenuLink({
  entry,
  ...link
}: LinkProps & { entry: EntryOf<"tv"> }) {
  const menu = useShowCardMenu(entry.id, link.title, entry.user);
  return <CardLink href={entry.path as Href} menu={menu} {...link} />;
}

function GameMenuLink({
  entry,
  today,
  ...link
}: LinkProps & { entry: EntryOf<"game">; today: string }) {
  const menu = useGameCardMenu(
    entry.id,
    entry.user,
    releaseDateOf(entry.card),
    today,
  );
  return <CardLink href={entry.path as Href} menu={menu} {...link} />;
}

/**
 * One title on a library page (prompts/mobile-library-tabs.md, decision 4):
 * the poster, or a tile with the name at the same footprint, the badge and
 * pill its page carries, and the name. It opens the title screen, where
 * every tracking control lives (5b). A title the catalog no longer has
 * cannot open; one whose catalog read failed still opens, so the user can
 * retry there and their history is never hidden (AGENTS.md section 12).
 *
 * `quick` adds the page's quick action (prompts/mobile-card-quick-actions.md):
 * a button over the poster, top right for a corner one and bottom right
 * otherwise, laid beside the link rather than inside it.
 *
 * A long press peeks at the title on iOS and offers the type's menu
 * (prompts/mobile-look-library.md, decisions 1 and 5): a card the catalog
 * answered gets both, a failed one only the preview, since its release date
 * is unknown and the gate could not be shown honestly, and a missing one
 * neither, since it cannot open.
 */
export function LibraryCard({
  entry,
  page,
  today,
  width,
  quick,
}: {
  entry: V1LibraryEntry;
  page: LibraryPageKey;
  today: string;
  width: number;
  quick?: CardActionSlot;
}) {
  const view = libraryCardView(entry, page, today);
  const isTitle = view.kind === "title";
  const episodeName = useNextEpisodeName(
    entry.id,
    isTitle ? view.next : undefined,
  );
  const label = isTitle
    ? [view.name, view.pill?.label, episodeName, view.badge?.label, view.meta]
        .filter(Boolean)
        .join(", ")
    : view.name;

  const body = (
    <>
      <PosterFrame
        width={width}
        imageUrl={isTitle ? view.imageUrl : null}
        recyclingKey={`${entry.type}:${entry.id}`}
        name={view.name}
      >
        {isTitle && view.badge ? <Badge badge={view.badge} /> : null}
        {isTitle && view.pill ? (
          <View
            style={{
              position: "absolute",
              bottom: CARD_INSET,
              left: CARD_INSET,
              maxWidth:
                quick && !quick.action.corner
                  ? width - CARD_INSET * 3 - CARD_ACTION_SIZE
                  : width - CARD_INSET * 2,
            }}
          >
            <GlassPill
              icon={view.pill.nextEpisode ? <NextEpisodeIcon /> : null}
              fitDate={view.pill.isDate}
            >
              {view.pill.text}
            </GlassPill>
          </View>
        ) : null}
      </PosterFrame>
      {isTitle ? (
        // Its own width, as on `PosterCard`: inside `Link asChild` the
        // Pressable's function style may not reach layout, and a long title
        // would widen the card past its column (prompts/mobile-look-search.md).
        <View className="gap-0.5" style={{ width }}>
          <Text
            numberOfLines={2}
            maxFontSizeMultiplier={CARD_FONT_SCALE_CAP}
            className="text-sm font-semibold text-foreground"
          >
            {view.name}
          </Text>
          {episodeName ? (
            <CardLine numberOfLines={2}>{episodeName}</CardLine>
          ) : null}
          {view.episodeLine ? <CardLine>{view.episodeLine}</CardLine> : null}
          {view.meta ? <CardLine>{view.meta}</CardLine> : null}
        </View>
      ) : null}
    </>
  );

  const card =
    view.kind === "missing" ? (
      <View
        accessible
        accessibilityLabel={label}
        style={{ width }}
        className="gap-2.5"
      >
        {body}
      </View>
    ) : view.kind === "title" ? (
      <MenuLink
        entry={entry}
        title={view.name}
        label={label}
        today={today}
        width={width}
      >
        {body}
      </MenuLink>
    ) : (
      <CardLink
        href={entry.path as Href}
        title={view.name}
        label={label}
        width={width}
      >
        {body}
      </CardLink>
    );

  if (!quick) return card;

  const posterHeight = (width * 3) / 2;
  return (
    <View style={{ width }}>
      {card}
      <View
        style={{
          position: "absolute",
          right: CARD_INSET,
          top: quick.action.corner
            ? CARD_INSET
            : posterHeight - CARD_INSET - CARD_ACTION_SIZE,
        }}
      >
        <PlateSolid>
          <CardActionButton
            look={quick.action.look}
            label={quick.action.label}
            disabled={quick.disabled}
            onPress={quick.onPress}
          />
        </PlateSolid>
      </View>
    </View>
  );
}

/**
 * An Up next card's episode name, read from the public season the card's
 * Mark watched action reads too (`catalogKeys.season`), so the two share one
 * cached request (prompts/mobile-look-verify-extras.md, decision 3). Null
 * while it loads, when TMDB has no name and after a failed read: the pill
 * and the action already speak for those, as on the web's `NextEpisodeName`.
 */
function useNextEpisodeName(
  showId: number,
  next: EpisodePlace | undefined,
): string | null {
  const season = useQuery({
    queryKey: catalogKeys.season(showId, next?.season ?? 0),
    queryFn: () => fetchSeason(showId, next?.season ?? 0),
    enabled: next !== undefined,
  });
  if (!next || !season.data) return null;
  return findEpisode(season.data, next)?.name ?? null;
}
