import type { V1LibraryEntry } from "@bestats/core/api/v1/library";
import type { LibraryPageKey } from "@bestats/core/catalog/library-list";
import { Image } from "expo-image";
import { type Href, Link } from "expo-router";
import { Pressable, View } from "react-native";

import { Text } from "@/components/text";
import { sizedImageUri } from "@/lib/images";
import type { CardAction } from "@/lib/library-actions";
import { type CardBadge, libraryCardView } from "@/lib/library-card";

import { CARD_ACTION_SIZE, CardActionButton } from "./card-action-button";

/** The inset of the badge, the pill and the action from the poster's edge. */
const INSET = 6;

/** A card's quick action, wired by the library screen. */
export type CardActionSlot = {
  action: CardAction;
  disabled: boolean;
  onPress: () => void;
};

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
 *
 * `quick` adds the page's quick action (prompts/mobile-card-quick-actions.md):
 * a button over the poster, top right for a corner one and bottom right
 * otherwise, laid beside the link rather than inside it.
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
          <View
            style={{
              maxWidth:
                quick && !quick.action.corner
                  ? width - INSET * 3 - CARD_ACTION_SIZE
                  : width - INSET * 2,
            }}
            className="absolute bottom-1.5 left-1.5 rounded-full border border-border bg-glass-plate-panel px-2 py-0.5"
          >
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

  const card =
    view.kind === "missing" ? (
      <View
        accessible
        accessibilityLabel={label}
        style={{ width }}
        className="gap-1.5"
      >
        {body}
      </View>
    ) : (
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

  if (!quick) return card;

  const posterHeight = (width * 3) / 2;
  return (
    <View style={{ width }}>
      {card}
      <View
        style={{
          position: "absolute",
          right: INSET,
          top: quick.action.corner
            ? INSET
            : posterHeight - INSET - CARD_ACTION_SIZE,
        }}
      >
        <CardActionButton
          look={quick.action.look}
          label={quick.action.label}
          disabled={quick.disabled}
          onPress={quick.onPress}
        />
      </View>
    </View>
  );
}
