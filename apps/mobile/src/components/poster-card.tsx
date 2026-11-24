import type { V1CatalogItem } from "@bestats/core/api/v1/browse";
import {
  CATALOG_SOURCES,
  gameHref,
  type LibraryType,
  titleHref,
} from "@bestats/core/catalog/media-type";
import { CATALOG_CARD_ACTION_LABELS } from "@bestats/core/tracking/messages";
import { todayUtc } from "@bestats/core/tv/air-status";
import { Image } from "expo-image";
import { type Href, Link } from "expo-router";
import type { ReactNode } from "react";
import { Alert, Platform, Pressable, View } from "react-native";
import { FilmIcon } from "@/components/icons";

import { Text } from "@/components/text";
import { useCardState } from "@/lib/card-states";
import {
  type CardMarks,
  gameCardMarks,
  gameCardMenu,
  movieCardMarks,
  movieCardMenu,
  showCardMarks,
  showCardMenu,
} from "@/lib/catalog-card-actions";
import { sizedImageUri } from "@/lib/images";
import {
  useGameWrite,
  useMovieWrite,
  useShowTrackingWrite,
} from "@/lib/title-writes";
import { lengthToken, tokenColor } from "@/theme/token-vars";
import { CARD_MARK_SIZE, CardMark } from "./card-action-button";
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

/**
 * A community rating as one line that names its source, `TMDB 7.4` or
 * `IGDB 8.1`, so it can never be read as a personal score (AGENTS.md
 * section 9). Null when the catalog has no rating: absent is not zero.
 */
export function communityRatingText(
  type: LibraryType,
  value: number | null,
): string | null {
  return value === null ? null : `${CATALOG_SOURCES[type]} ${value.toFixed(1)}`;
}

/**
 * What a screen reader says for a community rating, "TMDB rating 7.4" or
 * "IGDB community rating 81.0", so it is never heard as the user's own score
 * (AGENTS.md section 9). Every title screen and episode row reads it here.
 */
export function communityRatingLabel(
  type: LibraryType,
  value: number | null,
): string | null {
  if (value === null) return null;
  const noun = type === "game" ? "community rating" : "rating";
  return `${CATALOG_SOURCES[type]} ${noun} ${value.toFixed(1)}`;
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

/** One menu entry, ready to run: the card's actions after wiring. */
type MenuEntry = {
  id: string;
  title: string;
  destructive: boolean;
  disabled: boolean;
  onPress: () => void;
};

/** The inset of every badge, pill and mark, the web's 10px card corners. */
const INSET = 10;

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

/** Runs the menu's writes against the card's own title key. */
function MovieCard(props: Props) {
  const { item } = props;
  const state = useCardState("movie", item.id, true);
  const write = useMovieWrite(item.id);
  if (!state) return <PosterCardView {...props} />;
  const menu = movieCardMenu(state, item.releaseDate, todayUtc(new Date()));
  return (
    <PosterCardView
      {...props}
      marks={movieCardMarks(state)}
      menu={menu.map((entry) => ({
        ...entry,
        onPress: () => write.mutate(entry.write),
      }))}
    />
  );
}

function ShowCard(props: Props) {
  const { item } = props;
  const state = useCardState("tv", item.id, true);
  const toggle = useShowTrackingWrite(item.id, item.title);
  if (!state) return <PosterCardView {...props} />;
  return (
    <PosterCardView
      {...props}
      marks={showCardMarks(state)}
      menu={showCardMenu(state).map((entry) => ({
        ...entry,
        onPress: () => toggle.mutate(entry.write),
      }))}
    />
  );
}

function GameCard(props: Props) {
  const { item } = props;
  const state = useCardState("game", item.id, true);
  const write = useGameWrite(item.id);
  if (!state) return <PosterCardView {...props} />;
  const menu = gameCardMenu(state, item.releaseDate, todayUtc(new Date()));
  return (
    <PosterCardView
      {...props}
      marks={gameCardMarks(state)}
      menu={menu.map((entry) => ({
        ...entry,
        onPress: () => write.mutate(entry.write),
      }))}
    />
  );
}

/**
 * Android has no native link menu, so a long press there asks with an
 * alert holding the same enabled actions and Cancel (decision 7). The menu
 * has at most two actions, within the three buttons Android's alert shows.
 */
function openAlertMenu(title: string, menu: MenuEntry[]) {
  Alert.alert(title, undefined, [
    ...menu
      .filter((entry) => !entry.disabled)
      .map((entry) => ({
        text: entry.title,
        style: entry.destructive
          ? ("destructive" as const)
          : ("default" as const),
        onPress: entry.onPress,
      })),
    { text: CATALOG_CARD_ACTION_LABELS.cancel, style: "cancel" as const },
  ]);
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
  const pill = marks?.pill ?? dateLabel ?? null;
  const label = [
    item.title,
    item.year,
    pill,
    rating,
    ...(marks?.words.filter((word) => word !== pill) ?? []),
  ]
    .filter(Boolean)
    .join(", ");
  const enabled = menu?.filter((entry) => !entry.disabled) ?? [];

  const trigger = (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityActions={enabled.map((entry) => ({
        name: entry.id,
        label: entry.title,
      }))}
      onAccessibilityAction={({ nativeEvent }) =>
        enabled.find((entry) => entry.id === nativeEvent.actionName)?.onPress()
      }
      onLongPress={
        Platform.OS === "android" && enabled.length > 0
          ? () => openAlertMenu(item.title, enabled)
          : undefined
      }
      style={({ pressed }) => ({ width, opacity: pressed ? 0.85 : 1 })}
      className="gap-2.5"
    >
      <PosterFrame
        width={width}
        imageUrl={item.posterUrl}
        recyclingKey={`${type}:${item.id}`}
        name={item.title}
      >
        {marks?.score != null ? (
          <View style={{ position: "absolute", top: INSET, left: INSET }}>
            <PersonalScoreBadge value={marks.score} />
          </View>
        ) : item.communityRating !== null ? (
          <View style={{ position: "absolute", top: INSET, left: INSET }}>
            <CommunityRatingBadge
              source={CATALOG_SOURCES[type]}
              value={item.communityRating}
            />
          </View>
        ) : null}
        {marks?.planned ? (
          <View style={{ position: "absolute", top: INSET, right: INSET }}>
            <CardMark look="planned" />
          </View>
        ) : null}
        {pill ? (
          <View
            style={{
              position: "absolute",
              bottom: INSET,
              left: INSET,
              right: marks?.watched ? INSET + CARD_MARK_SIZE + 6 : INSET,
            }}
          >
            <GlassPill>{pill}</GlassPill>
          </View>
        ) : null}
        {marks?.watched ? (
          <View style={{ position: "absolute", bottom: INSET, right: INSET }}>
            <CardMark look="watched" />
          </View>
        ) : null}
      </PosterFrame>
      <View className="gap-0.5">
        <Text
          numberOfLines={2}
          className="text-sm font-semibold text-foreground"
        >
          {item.title}
        </Text>
        {item.year !== null ? (
          <Text className="text-xs text-text-secondary">{item.year}</Text>
        ) : null}
      </View>
    </Pressable>
  );

  const href = cardHref(type, item.id);
  if (!menu) {
    return (
      <Link href={href} asChild>
        {trigger}
      </Link>
    );
  }
  return (
    <Link href={href} asChild>
      <Link.Trigger>{trigger}</Link.Trigger>
      <Link.Menu title={item.title}>
        {menu.map((entry) => (
          <Link.MenuAction
            key={entry.id}
            title={entry.title}
            destructive={entry.destructive}
            disabled={entry.disabled}
            onPress={entry.onPress}
          />
        ))}
      </Link.Menu>
      <Link.Preview />
    </Link>
  );
}
