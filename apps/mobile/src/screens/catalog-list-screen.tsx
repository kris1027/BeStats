import type { V1List } from "@bestats/core/api/v1/browse";
import type { CatalogList } from "@bestats/core/catalog/lists";
import { CATALOG_SOURCES } from "@bestats/core/catalog/media-type";
import { todayUtc } from "@bestats/core/tv/air-status";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { CatalogNotice } from "@/components/catalog-notice";
import { LoadingState, StatePanel } from "@/components/centered-state";
import { cardDateLabel } from "@/components/dated-card";
import { GlassButton } from "@/components/glass-button";
import { PosterGrid } from "@/components/poster-grid";
import { Text } from "@/components/text";
import { ApiError } from "@/lib/api";
import { catalogKeys, fetchList } from "@/lib/catalog";
import { joinPageResults } from "@/lib/page-results";

/** True for the 404 a page past the last one answers: the list's end. */
function isPastEnd(error: unknown): boolean {
  return error instanceof ApiError && error.code === "not_found";
}

/**
 * A catalog list's page (`/shows/popular`, `/games/coming-soon`), the web's
 * list page with infinite scroll in place of numbered pages
 * (prompts/mobile-app-shell-catalog.md, decision 6). A 404 past the end ends
 * the list quietly; any other failure after the first page shows Try again
 * under what already loaded, so nothing loaded is lost.
 */
export function CatalogListScreen({ list }: { list: CatalogList }) {
  const query = useInfiniteQuery({
    queryKey: catalogKeys.list(list.mediaType, list.slug),
    queryFn: ({ pageParam }) => fetchList(list.mediaType, list.slug, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last: V1List) => last.nextPage ?? undefined,
  });
  const today = todayUtc(new Date());
  const source = CATALOG_SOURCES[list.mediaType];

  const title = <Stack.Screen options={{ title: list.heading }} />;

  if (query.isPending) {
    return (
      <>
        {title}
        <LoadingState label={`Loading ${list.heading}`} />
      </>
    );
  }
  // Only a failed first page replaces the screen; a later page's failure
  // keeps what loaded (TanStack also sets `isError` then).
  if (query.isLoadingError || !query.data) {
    return (
      <View className="flex-1">
        {title}
        <StatePanel
          tone="error"
          title={`Couldn't reach ${source}`}
          description={`${source} didn't respond. Try again in a moment.`}
          action={{ label: "Try again", onPress: () => query.refetch() }}
        />
      </View>
    );
  }

  const items = joinPageResults(query.data.pages);
  const ended =
    !query.hasNextPage ||
    (query.isFetchNextPageError && isPastEnd(query.error));
  const nextFailed = query.isFetchNextPageError && !isPastEnd(query.error);

  return (
    <View className="flex-1">
      {title}
      <PosterGrid
        accessibilityLabel={list.heading}
        items={items}
        type={list.mediaType}
        dateLabel={(item) => cardDateLabel(list, item, today)}
        onEndReached={() => {
          if (!ended && !nextFailed && !query.isFetchingNextPage) {
            query.fetchNextPage();
          }
        }}
        header={
          <Text className="px-4 pt-2 pb-1 text-text-secondary">
            {list.note}
          </Text>
        }
        footer={
          <View>
            {items.length === 0 ? (
              <StatePanel title="Nothing here right now." />
            ) : query.isFetchingNextPage ? (
              <ActivityIndicator
                className="py-6"
                accessibilityLabel="Loading more"
              />
            ) : nextFailed ? (
              <View
                accessibilityRole="alert"
                className="items-center gap-3 py-6"
              >
                <Text className="text-text-secondary">
                  {source} didn't respond. Try again in a moment.
                </Text>
                <GlassButton
                  label="Try again"
                  onPress={() => query.fetchNextPage()}
                />
              </View>
            ) : null}
            <CatalogNotice type={list.mediaType} />
          </View>
        }
      />
    </View>
  );
}
