import type { V1LibraryEntry } from "@bestats/core/api/v1/library";
import type { LibraryPageKey } from "@bestats/core/catalog/library-list";
import { Image } from "expo-image";
import { type Href, Link } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { sizedImageUri } from "@/lib/images";
import { type CardBadge, libraryCardView } from "@/lib/library-card";

/** The badge over the poster's top left corner, in its meaning's colour. */
function Badge({ badge }: { badge: CardBadge }) {
  const personal = badge.tone === "personal";
  return (
    <View
      className={`absolute top-1.5 left-1.5 rounded-full border px-2 py-0.5 ${
        personal
          ? "border-score-personal bg-glass-plate-score"
          : "border-border bg-glass-plate-panel"
      }`}
    >
      <Text
        className={`text-xs font-semibold ${
          personal ? "text-score-personal" : "text-rating-tmdb"
        }`}
      >
        {personal ? `★ ${badge.text}` : badge.text}
      </Text>
    </View>
  );
}

/**
 * One title on a library page (prompts/mobile-library-tabs.md, decision 4):
 * the poster, or a tile with the name at the same footprint, the badge and
 * pill its page carries, and the name. It opens the title screen, where
 * every tracking control lives (5b). A title the catalog no longer has
 * cannot open; one whose catalog read failed still opens, so the user can
 * retry there and their history is never hidden (AGENTS.md section 12).
 */
export function LibraryCard({
  entry,
  page,
  today,
  width,
}: {
  entry: V1LibraryEntry;
  page: LibraryPageKey;
  today: string;
  width: number;
}) {
  const view = libraryCardView(entry, page, today);
  const title = view.kind === "title";
  const label = title
    ? [view.name, view.pill?.label, view.badge?.label, view.meta]
        .filter(Boolean)
        .join(", ")
    : view.name;

  const body = (
    <>
      <View style={{ width, aspectRatio: 2 / 3 }}>
        {title && view.imageUrl ? (
          <Image
            source={{ uri: sizedImageUri(view.imageUrl, width) }}
            contentFit="cover"
            recyclingKey={`${entry.type}:${entry.id}`}
            transition={150}
            style={{ width: "100%", height: "100%", borderRadius: 12 }}
          />
        ) : (
          <View className="h-full w-full items-center justify-center rounded-xl border border-border bg-glass-plate">
            <Text
              numberOfLines={4}
              className="px-2 text-center text-xs text-muted-foreground"
            >
              {view.name}
            </Text>
          </View>
        )}
        {title && view.badge ? <Badge badge={view.badge} /> : null}
        {title && view.pill ? (
          <View className="absolute bottom-1.5 left-1.5 max-w-full rounded-full border border-border bg-glass-plate-panel px-2 py-0.5">
            <Text
              numberOfLines={1}
              className="text-xs font-semibold text-foreground"
            >
              {view.pill.text}
            </Text>
          </View>
        ) : null}
      </View>
      {title ? (
        <Text
          numberOfLines={2}
          className="text-sm font-semibold text-foreground"
        >
          {view.name}
        </Text>
      ) : null}
      {title && view.meta ? (
        <Text className="text-xs text-text-secondary">{view.meta}</Text>
      ) : null}
    </>
  );

  if (view.kind === "missing") {
    return (
      <View
        accessible
        accessibilityLabel={label}
        style={{ width }}
        className="gap-1.5"
      >
        {body}
      </View>
    );
  }

  return (
    <Link href={entry.path as Href} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={label}
        style={{ width }}
        className="gap-1.5"
      >
        {body}
      </Pressable>
    </Link>
  );
}
