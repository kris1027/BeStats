import type { V1CatalogItem } from "@bestats/core/api/v1/browse";
import type { LibraryType } from "@bestats/core/catalog/media-type";
import type { ReactElement } from "react";
import { FlatList, useWindowDimensions, View } from "react-native";
import { useCardStates } from "@/lib/card-states";

import { GRID, gridCardWidth } from "./grid-layout";
import { PosterCard } from "./poster-card";

type Props = {
  items: V1CatalogItem[];
  type: LibraryType;
  header?: ReactElement;
  footer?: ReactElement;
  onEndReached?: () => void;
  dateLabel?: (item: V1CatalogItem) => string | null;
  accessibilityLabel: string;
  /** Room above the first row for a pinned bar (`usePinnedBar`). */
  paddingTop?: number;
};

/**
 * The web's poster grid at phone width: three columns of `PosterCard`s in a
 * virtualized list, so a long list or search scrolls without rendering every
 * page at once (AGENTS.md section 3, phone width; section 10, pagination).
 * Signed in, it reads the cards' own state one page at a time
 * (prompts/mobile-look-card-actions.md, decision 5).
 */
export function PosterGrid({
  items,
  type,
  header,
  footer,
  onEndReached,
  dateLabel,
  accessibilityLabel,
  paddingTop = 0,
}: Props) {
  const { width } = useWindowDimensions();
  const cardWidth = gridCardWidth(width);
  const known = useCardStates(
    type,
    items.map((item) => item.id),
  );

  return (
    <FlatList
      accessibilityLabel={accessibilityLabel}
      className="flex-1"
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="on-drag"
      data={items}
      numColumns={GRID.columns}
      keyExtractor={(item) => String(item.id)}
      columnWrapperStyle={{ gap: GRID.gap, paddingHorizontal: GRID.gutter }}
      contentContainerStyle={{ gap: 20, paddingBottom: 24, paddingTop }}
      ListHeaderComponent={header}
      ListFooterComponent={footer}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.6}
      renderItem={({ item }) => (
        <View>
          <PosterCard
            item={item}
            type={type}
            width={cardWidth}
            dateLabel={dateLabel?.(item)}
            known={known(item.id)}
          />
        </View>
      )}
    />
  );
}
