import type { V1CatalogItem } from "@bestats/core/api/v1/browse";
import {
  CATALOG_SOURCES,
  gameHref,
  type LibraryType,
  titleHref,
} from "@bestats/core/catalog/media-type";
import { Image } from "expo-image";
import { type Href, Link } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { FilmIcon } from "@/components/icons";

import { Text } from "@/components/text";
import { sizedImageUri } from "@/lib/images";
import { lengthToken, tokenColor } from "@/theme/token-vars";

import { GlassPlate, PlateSolid } from "./glass/plate";
import { Rim } from "./glass/rim";
import { CommunityRatingBadge, GlassPill } from "./glass-pill";

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
 * The web's poster card, natively: the 2:3 poster in a rounded frame with
 * the gradient rim over the artwork, the community rating as an amber pill
 * at the top left and a date pill at the bottom, both on opaque plates since
 * they sit over artwork (the plate rule, decision 4), then the title and
 * year. A missing poster shows the film mark and the title on a flat solid
 * plate, as the web's placeholder does (AGENTS.md section 3).
 */
export function PosterCard({ item, type, width, dateLabel }: Props) {
  const rating = communityRatingText(type, item.communityRating);
  const label = [item.title, item.year, dateLabel, rating]
    .filter(Boolean)
    .join(", ");
  return (
    <Link href={cardHref(type, item.id)} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={label}
        style={({ pressed }) => ({ width, opacity: pressed ? 0.85 : 1 })}
        className="gap-2.5"
      >
        <PosterFrame
          width={width}
          imageUrl={item.posterUrl}
          recyclingKey={`${type}:${item.id}`}
          name={item.title}
        >
          {item.communityRating !== null ? (
            <View className="absolute top-2.5 left-2.5">
              <CommunityRatingBadge
                source={CATALOG_SOURCES[type]}
                value={item.communityRating}
              />
            </View>
          ) : null}
          {dateLabel ? (
            <View className="absolute right-2.5 bottom-2.5 left-2.5">
              <GlassPill>{dateLabel}</GlassPill>
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
    </Link>
  );
}
