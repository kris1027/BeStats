import { CATALOG_CARD_ACTION_LABELS } from "@bestats/core/tracking/messages";
import { type Href, Link } from "expo-router";
import type { ReactNode } from "react";
import { Alert, Platform, Pressable } from "react-native";

import type { CardMenuItem } from "@/lib/catalog-card-actions";
import { HEADER_BACKGROUND } from "@/theme/stack-options";

/** One menu entry, ready to run: a card's menu item with its write bound. */
export type MenuEntry = Omit<CardMenuItem<unknown>, "write"> & {
  onPress: () => void;
};

/**
 * Binds each menu item's write to the card's mutation, so `CardLink` never
 * knows which write a type uses (apps/mobile/AGENTS.md, Catalog card
 * actions; prompts/mobile-look-card-actions.md).
 */
export function wire<TWrite>(
  menu: CardMenuItem<TWrite>[],
  run: (write: TWrite) => void,
): MenuEntry[] {
  return menu.map(({ write, ...entry }) => ({
    ...entry,
    onPress: () => run(write),
  }));
}

/**
 * Android has no native link menu, so a long press there asks with an
 * alert holding the same enabled actions and Cancel
 * (prompts/mobile-look-card-actions.md, decision 7). A card menu has at most
 * two actions, within the three buttons Android's alert shows.
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

/**
 * The link every poster card is (prompts/mobile-look-library.md, decision
 * 4): a tap opens the title, a long press peeks at it on iOS and, with a
 * `menu`, offers the card's actions as the native menu, an alert on Android
 * and screen reader actions on both. The catalog and library cards share it
 * so their menus never drift apart (apps/mobile/AGENTS.md, Catalog card
 * actions). `children` is the card as drawn, one accessible element named by
 * `label`, reachable by keyboard and screen reader (AGENTS.md section 3).
 */
export function CardLink({
  href,
  title,
  label,
  width,
  menu,
  children,
}: {
  href: Href;
  /** The title's name, the menu's and the alert's heading. */
  title: string;
  label: string;
  width: number;
  menu?: MenuEntry[];
  children: ReactNode;
}) {
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
          ? () => openAlertMenu(title, enabled)
          : undefined
      }
      style={({ pressed }) => ({ width, opacity: pressed ? 0.85 : 1 })}
      className="gap-2.5"
    >
      {children}
    </Pressable>
  );

  // Every card peeks at its title on a long press (iOS only); the menu
  // joins it once the card's state is known (decisions 6 and 7).
  return (
    <Link href={href} asChild>
      <Link.Trigger>{trigger}</Link.Trigger>
      {menu ? (
        <Link.Menu title={title}>
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
      ) : null}
      {/* Screens are transparent over the stack's page background, which
          a preview does not get, so it takes the page's colour as the header
          shows it. */}
      <Link.Preview style={{ backgroundColor: HEADER_BACKGROUND }} />
    </Link>
  );
}
