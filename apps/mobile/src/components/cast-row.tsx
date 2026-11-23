import type { V1Movie } from "@bestats/core/api/v1/movie";
import { Image } from "expo-image";
import { FlatList, View } from "react-native";

import { Text } from "@/components/text";
import { sizedImageUri } from "@/lib/images";

const PHOTO_WIDTH = 96;

/**
 * What the show screen says when TMDB's cast read failed but the show
 * loaded: the web's "Cast unavailable" panel copy (spec 0009, AC-8), as a
 * line under the heading, since the rest of the screen still stands.
 */
export const CAST_UNAVAILABLE =
  "TMDB's cast listing for this show couldn't be read.";

/**
 * The web's cast row natively (prompts/mobile-title-tracking.md, decision 5):
 * a horizontal list of photos with name and character, the initials plate
 * when TMDB has no photo, and the web's empty line when it lists no cast, so
 * nothing is invented (AGENTS.md section 3). A null cast is a failed cast
 * read (the show's, feature 29 slice 2) and shows `CAST_UNAVAILABLE`.
 */
export function CastRow({
  cast,
  emptyMessage,
}: {
  cast: V1Movie["cast"] | null;
  emptyMessage: string;
}) {
  return (
    <View className="gap-3">
      <Text
        accessibilityRole="header"
        className="px-4 text-lg font-semibold text-foreground"
      >
        Cast
      </Text>
      {cast === null || cast.length === 0 ? (
        <Text className="px-4 text-muted-foreground">
          {cast === null ? CAST_UNAVAILABLE : emptyMessage}
        </Text>
      ) : (
        <FlatList
          horizontal
          data={cast}
          keyExtractor={(member) => member.creditId}
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-3 px-4"
          renderItem={({ item }) => (
            <View
              accessible
              accessibilityLabel={
                item.character ? `${item.name} as ${item.character}` : item.name
              }
              style={{ width: PHOTO_WIDTH }}
              className="gap-1"
            >
              {item.profileUrl ? (
                <Image
                  source={{ uri: sizedImageUri(item.profileUrl, PHOTO_WIDTH) }}
                  contentFit="cover"
                  style={{
                    width: PHOTO_WIDTH,
                    aspectRatio: 2 / 3,
                    borderRadius: 12,
                  }}
                />
              ) : (
                <View
                  className="items-center justify-center rounded-xl border border-border bg-card"
                  style={{ width: PHOTO_WIDTH, aspectRatio: 2 / 3 }}
                >
                  <Text className="text-lg font-semibold text-muted-foreground">
                    {initials(item.name)}
                  </Text>
                </View>
              )}
              <Text
                numberOfLines={2}
                className="text-sm font-semibold text-foreground"
              >
                {item.name}
              </Text>
              {item.character ? (
                <Text numberOfLines={2} className="text-xs text-text-secondary">
                  {item.character}
                </Text>
              ) : null}
            </View>
          )}
        />
      )}
    </View>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
