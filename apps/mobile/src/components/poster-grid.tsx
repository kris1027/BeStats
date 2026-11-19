import type { V1CatalogItem } from "@bestats/core/api/v1/browse";
import type { LibraryType } from "@bestats/core/catalog/media-type";
import type { ReactElement } from "react";
import { FlatList, useWindowDimensions, View } from "react-native";

import { PosterCard } from "./poster-card";

const COLUMNS = 3;
const GUTTER = 16;
const GAP = 12;

type Props = {
  items: V1CatalogItem[];
  type: LibraryType;
  header?: ReactElement;
  footer?: ReactElement;
  onEndReached?: () => void;
  dateLabel?: (item: V1CatalogItem) => string | null;
  accessibilityLabel: string;
};

/**
 * The web's poster grid at phone width: three columns of `PosterCard`s in a
 * virtualized list, so a long list or search scrolls without rendering every
 * page at once.
 */
export function PosterGrid({
  items,
  type,
  header,
  footer,
  onEndReached,
  dateLabel,
  accessibilityLabel,
}: Props) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.floor(
    (width - GUTTER * 2 - GAP * (COLUMNS - 1)) / COLUMNS,
  );

  return (
    <FlatList
      accessibilityLabel={accessibilityLabel}
      className="flex-1 bg-background"
      contentInsetAdjustmentBehavior="automatic"
      data={items}
      numColumns={COLUMNS}
      keyExtractor={(item) => String(item.id)}
      columnWrapperStyle={{ gap: GAP, paddingHorizontal: GUTTER }}
      contentContainerStyle={{ gap: 20, paddingBottom: 24 }}
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
          />
        </View>
      )}
    />
  );
}
