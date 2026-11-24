import type { V1LibraryEntry } from "@bestats/core/api/v1/library";
import type { LibraryPageKey } from "@bestats/core/catalog/library-list";
import { type Href, Link } from "expo-router";
import { Pressable, View } from "react-native";

import { Text } from "@/components/text";
import type { CardAction } from "@/lib/library-actions";
import { type CardBadge, libraryCardView } from "@/lib/library-card";

import { CARD_ACTION_SIZE, CardActionButton } from "./card-action-button";
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
      <PosterFrame
        width={width}
        imageUrl={title ? view.imageUrl : null}
        recyclingKey={`${entry.type}:${entry.id}`}
        name={view.name}
      >
        {title && view.badge ? <Badge badge={view.badge} /> : null}
        {title && view.pill ? (
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
            <GlassPill>{view.pill.text}</GlassPill>
          </View>
        ) : null}
      </PosterFrame>
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
        className="gap-2.5"
      >
        {body}
      </View>
    ) : (
      <Link href={entry.path as Href} asChild>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={label}
          style={{ width }}
          className="gap-2.5"
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
