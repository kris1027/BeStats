import type { LibraryType } from "@bestats/core/catalog/media-type";
import { SymbolView, type SymbolViewProps } from "expo-symbols";

/**
 * Each media type's system symbol, SF Symbols on iOS and Material Symbols on
 * Android, the same families the native bottom tabs draw, so the Shows,
 * Movies, Games switch reads as that bar's twin
 * (prompts/mobile-media-switch-glass.md, decision 4).
 */
const MEDIA_SYMBOLS = {
  tv: { ios: "play.tv.fill", android: "live_tv", web: "live_tv" },
  movie: { ios: "movieclapper.fill", android: "movie", web: "movie" },
  game: {
    ios: "gamecontroller.fill",
    android: "sports_esports",
    web: "sports_esports",
  },
} as const satisfies Record<LibraryType, SymbolViewProps["name"]>;

/**
 * The symbols' size in points, fixed like the tab bar's, never scaled; an
 * SF Symbol draws inside its box with margins, so this matches the tab
 * bar's glyphs by eye in the iOS 26 simulator.
 */
export const MEDIA_SYMBOL_SIZE = 30;

/**
 * A media type's symbol, decorative: the segment's label names it, so it is
 * hidden from screen readers (prompts/mobile-media-switch-glass.md,
 * decision 12). The one importer of `expo-symbols` (`ui-boundary.test.ts`).
 */
export function MediaSymbol({
  type,
  color,
}: {
  type: LibraryType;
  color: string;
}) {
  return (
    <SymbolView
      name={MEDIA_SYMBOLS[type]}
      size={MEDIA_SYMBOL_SIZE}
      tintColor={color}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: MEDIA_SYMBOL_SIZE, height: MEDIA_SYMBOL_SIZE }}
    />
  );
}
