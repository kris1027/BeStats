import type { V1CatalogItem } from "@bestats/core/api/v1/browse";
import {
  CATALOG_SOURCES,
  gameHref,
  type LibraryType,
  titleHref,
} from "@bestats/core/catalog/media-type";
import { Image } from "expo-image";
import { type Href, Link } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { sizedImageUri } from "@/lib/images";

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
 * The web's poster card, natively: poster, title, year and the community
 * rating named by its catalog. A missing poster shows the title on the glass
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
        style={{ width }}
        className="gap-1.5"
      >
        <View style={{ width, aspectRatio: 2 / 3 }}>
          {item.posterUrl ? (
            <Image
              source={{ uri: sizedImageUri(item.posterUrl, width) }}
              contentFit="cover"
              recyclingKey={`${type}:${item.id}`}
              transition={150}
              style={{ width: "100%", height: "100%", borderRadius: 12 }}
            />
          ) : (
            <View className="h-full w-full items-center justify-center rounded-xl border border-border bg-glass-plate">
              <Text
                numberOfLines={4}
                className="px-2 text-center text-xs text-muted-foreground"
              >
                {item.title}
              </Text>
            </View>
          )}
          {dateLabel ? (
            <View className="absolute top-1.5 left-1.5 rounded-full border border-border bg-glass-plate-panel px-2 py-0.5">
              <Text className="text-xs font-semibold text-foreground">
                {dateLabel}
              </Text>
            </View>
          ) : null}
        </View>
        <Text
          numberOfLines={2}
          className="text-sm font-semibold text-foreground"
        >
          {item.title}
        </Text>
        <View className="flex-row flex-wrap gap-x-2">
          {item.year !== null ? (
            <Text className="text-xs text-text-secondary">{item.year}</Text>
          ) : null}
          {rating ? (
            <Text className="text-xs font-semibold text-rating-tmdb">
              {rating}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Link>
  );
}
