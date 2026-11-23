import { Image } from "expo-image";
import { useWindowDimensions, View } from "react-native";

import { Text } from "@/components/text";
import { DETAIL_POSTER_WIDTH, sizedImageUri } from "@/lib/images";

type Props = {
  title: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  /** The meta line parts (dates, genres); empty parts are left out. */
  meta: (string | null)[];
  /** The community rating named by its catalog (`TMDB 7.4`), or null. */
  rating: string | null;
  /** What a screen reader says for the rating (`TMDB rating 7.4`). */
  ratingLabel: string | null;
};

/**
 * The top of a title screen, as the movie screen draws it: the backdrop, the
 * poster (or the title on the glass plate when there is none), the title,
 * one meta line and the community rating, labelled with its catalog so it is
 * never read as a personal score (AGENTS.md sections 3 and 9).
 */
export function DetailHeader({
  title,
  posterUrl,
  backdropUrl,
  meta,
  rating,
  ratingLabel,
}: Props) {
  const { width } = useWindowDimensions();
  const line = meta.filter(Boolean).join(" · ");

  return (
    <View>
      {backdropUrl ? (
        <Image
          source={{ uri: sizedImageUri(backdropUrl, width) }}
          accessibilityIgnoresInvertColors
          contentFit="cover"
          style={{ width: "100%", aspectRatio: 16 / 9 }}
        />
      ) : null}
      <View className="flex-row gap-4 px-4 pt-5">
        {posterUrl ? (
          <Image
            source={{ uri: sizedImageUri(posterUrl, DETAIL_POSTER_WIDTH) }}
            accessibilityLabel={`${title} poster`}
            contentFit="cover"
            style={{
              width: DETAIL_POSTER_WIDTH,
              aspectRatio: 2 / 3,
              borderRadius: 12,
            }}
          />
        ) : (
          <View
            accessibilityLabel="No poster"
            className="w-[110px] items-center justify-center rounded-xl border border-border bg-card"
            style={{ aspectRatio: 2 / 3 }}
          >
            <Text className="px-2 text-center text-xs text-muted-foreground">
              {title}
            </Text>
          </View>
        )}
        <View className="flex-1 gap-2">
          <Text
            accessibilityRole="header"
            className="text-2xl font-bold text-foreground"
          >
            {title}
          </Text>
          {line ? <Text className="text-text-secondary">{line}</Text> : null}
          {rating ? (
            <Text
              accessibilityLabel={ratingLabel ?? rating}
              className="font-semibold text-rating-tmdb"
            >
              {rating}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/**
 * A titled block of body text. It renders nothing when there is no text
 * rather than an empty heading, since only real metadata shows (AGENTS.md
 * section 3).
 */
export function DetailSection({
  heading,
  text,
}: {
  heading: string;
  text: string | null;
}) {
  if (!text) return null;
  return (
    <View className="gap-2">
      <Text
        accessibilityRole="header"
        className="text-lg font-semibold text-foreground"
      >
        {heading}
      </Text>
      <Text className="text-base leading-6 text-text-secondary">{text}</Text>
    </View>
  );
}
