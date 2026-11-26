import type { V1CatalogItem } from "@bestats/core/api/v1/browse";
import {
  CATALOG_SOURCES,
  gameHref,
  type LibraryType,
  titleHref,
} from "@bestats/core/catalog/media-type";
import { todayUtc } from "@bestats/core/tv/air-status";
import { Image } from "expo-image";
import type { Href } from "expo-router";
import type { ReactNode } from "react";
import { View } from "react-native";
import { FilmIcon } from "@/components/icons";

import { Text } from "@/components/text";
import { useCardState } from "@/lib/card-states";
import {
  type CardMarks,
  gameCardMarks,
  movieCardMarks,
  showCardMarks,
} from "@/lib/catalog-card-actions";
import { communityRatingText } from "@/lib/community-rating";
import { sizedImageUri } from "@/lib/images";
import { CARD_FONT_SCALE_CAP } from "@/theme/font-scale";
import { lengthToken, tokenColor } from "@/theme/token-vars";
import { CARD_MARK_SIZE, CardMark } from "./card-action-button";
import { CardLink, type MenuEntry } from "./card-link";
import {
  useGameCardMenu,
  useMovieCardMenu,
  useShowCardMenu,
} from "./card-menus";
import { GlassPlate, PlateSolid } from "./glass/plate";
import { Rim } from "./glass/rim";
import {
  CommunityRatingBadge,
  GlassPill,
  PersonalScoreBadge,
} from "./glass-pill";

/**
 * The href of a catalog card's own page, from core's builders, keyed by media
 * type plus ID since a TMDB movie and show can share a number (AGENTS.md
 * section 8, catalog identity).
 */
export function cardHref(type: LibraryType, id: number): Href {
  return (type === "game" ? gameHref(id) : titleHref(type, id)) as Href;
}

type Props = {
  item: V1CatalogItem;
  type: LibraryType;
  /** The card width in points; the poster keeps the 2:3 shape. */
  width: number;
  /** A short release date pill (Upcoming, Coming soon), or none. */
  dateLabel?: string | null;
  /**
   * Whether the user's state for this card has been read, from the screen's
   * `useCardStates` (prompts/mobile-look-card-actions.md, decision 5). Off,
   * the card is the plain catalog card with no menu (decision 6).
   */
  known?: boolean;
};

/**
 * The 2:3 poster frame every card shares: the artwork, or the film mark and
 * the name on a flat solid plate at the same footprint, then the gradient
 * rim over it, then `children` (badges and pills) on opaque plates, since
 * they sit over artwork (the plate rule, decision 4). The rim is an overlay,
 * as on the web, so the image never covers it.
 */
export function PosterFrame({
  width,
  imageUrl,
  recyclingKey,
  name,
  children,
}: {
  width: number;
  imageUrl: string | null;
  recyclingKey: string;
  name: string;
  children?: ReactNode;
}) {
  const radius = lengthToken("radius-lg");
  return (
    <View
      style={{ width, aspectRatio: 2 / 3, borderRadius: radius }}
      className="overflow-hidden"
    >
      {imageUrl ? (
        <Image
          source={{ uri: sizedImageUri(imageUrl, width) }}
          contentFit="cover"
          recyclingKey={recyclingKey}
          transition={150}
          style={{ width: "100%", height: "100%" }}
        />
      ) : (
        <PlateSolid>
          <GlassPlate
            sheen="none"
            rim="none"
            radius={radius}
            className="h-full w-full items-center justify-center gap-3 p-3"
          >
            <FilmIcon size={28} color={tokenColor("color-muted-foreground")} />
            <Text
              numberOfLines={3}
              className="text-center text-xs text-muted-foreground"
            >
              {name}
            </Text>
          </GlassPlate>
        </PlateSolid>
      )}
      <Rim radius={radius} />
      <PlateSolid>{children}</PlateSolid>
    </View>
  );
}

/**
 * The inset of every badge, pill, mark and button from a poster's edge, the
 * web's 10px card corners (components/AGENTS.md, Card corners). The library
 * cards share it, so both cards place their corners alike.
 */
export const CARD_INSET = 10;

/** The space between the bottom pill and the Watched mark beside it. */
const MARK_GAP = 6;

/**
 * The web's poster card, natively: the 2:3 poster in a rounded frame with
 * the gradient rim over the artwork, the community rating as an amber pill
 * at the top left and a date pill at the bottom, both on opaque plates since
 * they sit over artwork (the plate rule, decision 4), then the title and
 * year. A missing poster shows the film mark and the title on a flat solid
 * plate, as the web's placeholder does (AGENTS.md section 3).
 *
 * Signed in, once the screen has read the card's state (`known`), the card
 * shows the user's own marks and carries the type's actions
 * (prompts/mobile-look-card-actions.md): a native long press menu with the
 * title's preview on iOS, an alert on Android, and screen reader actions on
 * both. A tap always opens the title.
 */
export function PosterCard(props: Props) {
  if (!props.known) return <PosterCardView {...props} />;
  switch (props.type) {
    case "movie":
      return <MovieCard {...props} />;
    case "tv":
      return <ShowCard {...props} />;
    case "game":
      return <GameCard {...props} />;
  }
}

/**
 * Each typed card reads its state and menu hook unconditionally, then draws
 * the plain card until the state is known (decision 6).
 */
function MovieCard(props: Props) {
  const { item } = props;
  const today = todayUtc(new Date());
  const state = useCardState("movie", item.id);
  const menu = useMovieCardMenu(item.id, state, item.releaseDate, today);
  if (!state) return <PosterCardView {...props} />;
  return (
    <PosterCardView
      {...props}
      marks={movieCardMarks(state, item.releaseDate, today)}
      menu={menu}
    />
  );
}

function ShowCard(props: Props) {
  const { item } = props;
  const state = useCardState("tv", item.id);
  const menu = useShowCardMenu(item.id, item.title, state);
  if (!state) return <PosterCardView {...props} />;
  return <PosterCardView {...props} marks={showCardMarks(state)} menu={menu} />;
}

function GameCard(props: Props) {
  const { item } = props;
  const today = todayUtc(new Date());
  const state = useCardState("game", item.id);
  const menu = useGameCardMenu(item.id, state, item.releaseDate, today);
  if (!state) return <PosterCardView {...props} />;
  return (
    <PosterCardView
      {...props}
      marks={gameCardMarks(state, item.releaseDate, today)}
      menu={menu}
    />
  );
}

/** The card as drawn, with or without the user's marks and menu. */
function PosterCardView({
  item,
  type,
  width,
  dateLabel,
  marks,
  menu,
}: Props & { marks?: CardMarks; menu?: MenuEntry[] }) {
  const rating = communityRatingText(type, item.communityRating);
  // The user's own pill wins: a game's status, or a release date the row's
  // own date label would only repeat.
  const pill = marks?.pill?.text ?? dateLabel ?? null;
  // A game's status is the one pill here that is not a date.
  const datePill = marks?.pill ? marks.pill.date : true;
  const community = marks?.community ?? true;
  const label = [
    item.title,
    item.year,
    marks?.pill?.label ?? pill,
    community ? rating : null,
    ...(marks?.words ?? []),
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <CardLink
      href={cardHref(type, item.id)}
      title={item.title}
      label={label}
      width={width}
      menu={menu}
    >
      <PosterFrame
        width={width}
        imageUrl={item.posterUrl}
        recyclingKey={`${type}:${item.id}`}
        name={item.title}
      >
        {marks?.score != null ? (
          <View
            style={{ position: "absolute", top: CARD_INSET, left: CARD_INSET }}
          >
            <PersonalScoreBadge value={marks.score} />
          </View>
        ) : community && item.communityRating !== null ? (
          <View
            style={{ position: "absolute", top: CARD_INSET, left: CARD_INSET }}
          >
            <CommunityRatingBadge
              source={CATALOG_SOURCES[type]}
              value={item.communityRating}
            />
          </View>
        ) : null}
        {marks?.bookmark ? (
          <View
            style={{ position: "absolute", top: CARD_INSET, right: CARD_INSET }}
          >
            <CardMark look="planned" />
          </View>
        ) : null}
        {pill ? (
          <View
            style={{
              position: "absolute",
              bottom: CARD_INSET,
              left: CARD_INSET,
              right: marks?.watched
                ? CARD_INSET + CARD_MARK_SIZE + MARK_GAP
                : CARD_INSET,
            }}
          >
            <GlassPill fitDate={datePill}>{pill}</GlassPill>
          </View>
        ) : null}
        {marks?.watched ? (
          <View
            style={{
              position: "absolute",
              bottom: CARD_INSET,
              right: CARD_INSET,
            }}
          >
            <CardMark look="watched" />
          </View>
        ) : null}
      </PosterFrame>
      {/* Its own width too: inside `Link asChild` the Pressable's function
          style may not reach layout, and a long title then widens the card
          past its grid column (found on Search, slice 5). */}
      <View className="gap-0.5" style={{ width }}>
        <Text
          numberOfLines={2}
          maxFontSizeMultiplier={CARD_FONT_SCALE_CAP}
          className="text-sm font-semibold text-foreground"
        >
          {item.title}
        </Text>
        {item.year !== null ? (
          <Text
            maxFontSizeMultiplier={CARD_FONT_SCALE_CAP}
            className="text-xs text-text-secondary"
          >
            {item.year}
          </Text>
        ) : null}
      </View>
    </CardLink>
  );
}
