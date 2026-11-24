import type { V1LibraryEntry } from "@bestats/core/api/v1/library";
import type { LibraryPageKey } from "@bestats/core/catalog/library-list";
import type { Href } from "expo-router";
import type { ReactNode } from "react";
import { View } from "react-native";

import { Text } from "@/components/text";
import {
  gameCardMenu,
  movieCardMenu,
  showCardMenu,
} from "@/lib/catalog-card-actions";
import type { CardAction } from "@/lib/library-actions";
import { type CardBadge, libraryCardView } from "@/lib/library-card";
import {
  useGameWrite,
  useMovieWrite,
  useShowTrackingWrite,
} from "@/lib/title-writes";
import { CARD_FONT_SCALE_CAP } from "@/theme/font-scale";

import { CARD_ACTION_SIZE, CardActionButton } from "./card-action-button";
import { CardLink, wire } from "./card-link";
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

type LinkProps = {
  entry: V1LibraryEntry;
  name: string;
  label: string;
  today: string;
  width: number;
  children: ReactNode;
};

/**
 * The library card's link with the catalog card's menu for its type
 * (prompts/mobile-look-library.md, decisions 1 and 3), built from the state
 * the library page already returned (`entry.user`), so the menu costs no
 * read. Its writes are the title screen's, whose invalidation of every
 * library page lets the server move the card (AGENTS.md section 9).
 */
function MenuLink(props: LinkProps) {
  switch (props.entry.type) {
    case "movie":
      return <MovieMenuLink {...props} entry={props.entry} />;
    case "tv":
      return <ShowMenuLink {...props} entry={props.entry} />;
    case "game":
      return <GameMenuLink {...props} entry={props.entry} />;
  }
}

type EntryOf<T extends V1LibraryEntry["type"]> = Extract<
  V1LibraryEntry,
  { type: T }
>;

/** The release date of a card the catalog answered, else none. */
function releaseDateOf(
  card: { kind: string; releaseDate?: string | null } | null,
) {
  return card?.kind === "title" ? (card.releaseDate ?? null) : null;
}

function MovieMenuLink({
  entry,
  name,
  today,
  ...rest
}: LinkProps & { entry: EntryOf<"movie"> }) {
  const write = useMovieWrite(entry.id);
  const menu = movieCardMenu(entry.user, releaseDateOf(entry.card), today);
  return (
    <CardLink
      href={entry.path as Href}
      title={name}
      menu={wire(menu, write.mutate)}
      {...rest}
    />
  );
}

function ShowMenuLink({
  entry,
  name,
  today: _today,
  ...rest
}: LinkProps & { entry: EntryOf<"tv"> }) {
  const toggle = useShowTrackingWrite(entry.id, name);
  return (
    <CardLink
      href={entry.path as Href}
      title={name}
      menu={wire(showCardMenu(entry.user), toggle.mutate)}
      {...rest}
    />
  );
}

function GameMenuLink({
  entry,
  name,
  today,
  ...rest
}: LinkProps & { entry: EntryOf<"game"> }) {
  const write = useGameWrite(entry.id);
  const menu = gameCardMenu(entry.user, releaseDateOf(entry.card), today);
  return (
    <CardLink
      href={entry.path as Href}
      title={name}
      menu={wire(menu, write.mutate)}
      {...rest}
    />
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
          {view.meta ? (
            <Text
              maxFontSizeMultiplier={CARD_FONT_SCALE_CAP}
              className="text-xs text-text-secondary"
            >
              {view.meta}
            </Text>
          ) : null}
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
        name={view.name}
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
