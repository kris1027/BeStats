import type { V1Search } from "@bestats/core/api/v1/browse";
import { CATALOG_SOURCES } from "@bestats/core/catalog/media-type";
import {
  FILTER_DEBOUNCE_MS,
  MAX_QUERY_LENGTH,
} from "@bestats/core/search/constants";
import { mediaNoun } from "@bestats/core/search/count";
import {
  emptySearchParams,
  type SearchParams,
} from "@bestats/core/search/params";
import { useInfiniteQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { CatalogNotice } from "@/components/catalog-notice";
import { LoadingState, StatePanel } from "@/components/centered-state";
import { FiltersSheet } from "@/components/filters-sheet";
import { GlassButton } from "@/components/glass-button";
import { MediaSwitch } from "@/components/media-switch";
import { PosterGrid } from "@/components/poster-grid";
import { Text, TextInput } from "@/components/text";
import { ApiError } from "@/lib/api";
import { catalogKeys, fetchSearch } from "@/lib/catalog";
import { useMediaType } from "@/lib/media-type";
import { joinPageResults } from "@/lib/page-results";
import { searchView } from "@/lib/search-results";
import { tokenColor } from "@/theme/token-vars";

/** True for the 404 a page past the last one answers: the results' end. */
function isPastEnd(error: unknown): boolean {
  return error instanceof ApiError && error.code === "not_found";
}

/**
 * Search (prompts/mobile-app-shell-catalog.md, decision 7): the web's
 * `/search` with the same params, sent through core's `searchHref`, and the
 * same count copy and states (AGENTS.md section 10). Titles load as you
 * scroll; a filtered title search loads its next TMDB range on Load more,
 * since each range may keep none. The query and filters live in this
 * screen, which the tab's stack keeps mounted, so they survive opening a
 * title and coming back.
 */
export function SearchScreen() {
  const { mediaType } = useMediaType();
  const [text, setText] = useState("");
  const [params, setParams] = useState<SearchParams>(() =>
    emptySearchParams(mediaType),
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const currentYear = new Date().getUTCFullYear();

  // A new catalog keeps the title and drops filters, whose genre ids belong
  // to the old catalog.
  useEffect(() => {
    setParams((current) =>
      current.type === mediaType
        ? current
        : { ...emptySearchParams(mediaType), q: current.q },
    );
  }, [mediaType]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const q = text.trim() === "" ? null : text.trim();
      setParams((current) => (current.q === q ? current : { ...current, q }));
    }, FILTER_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const query = useInfiniteQuery({
    queryKey: catalogKeys.search(params),
    queryFn: ({ pageParam }) => fetchSearch(params, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last: V1Search) => last.nextPage ?? undefined,
  });

  const filterCount =
    params.genreIds.length +
    (params.year === null ? 0 : 1) +
    (params.rating === null ? 0 : 1);

  const header = (
    <View>
      <MediaSwitch />
      <View className="gap-3 px-4 pb-3">
        <TextInput
          accessibilityLabel={`Search ${mediaNoun(params.type)} by title`}
          placeholder={`Search ${mediaNoun(params.type)} by title`}
          placeholderTextColor={tokenColor("color-muted-foreground")}
          value={text}
          onChangeText={setText}
          maxLength={MAX_QUERY_LENGTH}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          className="min-h-11 rounded-2xl border border-input bg-glass-plate px-4 text-base text-foreground"
        />
        <View className="flex-row items-center gap-3">
          <GlassButton
            label={filterCount > 0 ? `Filters (${filterCount})` : "Filters"}
            onPress={() => setFiltersOpen(true)}
          />
          {filterCount > 0 || params.q !== null ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setText("");
                setParams(emptySearchParams(params.type));
              }}
              className="min-h-11 justify-center px-2"
            >
              <Text className="text-text-link">Clear filters</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );

  const sheet = (
    <FiltersSheet
      visible={filtersOpen}
      params={params}
      currentYear={currentYear}
      onClose={() => setFiltersOpen(false)}
      onChange={(next) => setParams((current) => ({ ...current, ...next }))}
    />
  );

  const source = CATALOG_SOURCES[params.type];

  // One tree for every state, so the title field keeps focus and the
  // keyboard stays up while a new search loads.
  let status: ReactNode = null;
  if (query.isPending) {
    status = <LoadingState label="Loading results" />;
  } else if (query.isLoadingError) {
    const invalid =
      query.error instanceof ApiError && query.error.code === "invalid_input";
    status = invalid ? (
      <StatePanel
        title="That filter isn't valid"
        description="One of these filters isn't one we can search with."
        action={{
          label: "Clear filters",
          onPress: () => setParams(emptySearchParams(params.type)),
        }}
      />
    ) : (
      <StatePanel
        tone="error"
        title={`Couldn't reach ${source}`}
        description={`${source} didn't respond. Try again in a moment.`}
        action={{ label: "Try again", onPress: () => query.refetch() }}
      />
    );
  } else if (query.isRefetchError) {
    // Stale results stay on screen, but never as if they were current
    // (AGENTS.md section 11, no false success).
    status = (
      <StatePanel
        tone="error"
        title={`Couldn't refresh from ${source}`}
        description="These results may be out of date."
        action={{ label: "Try again", onPress: () => query.refetch() }}
      />
    );
  }

  const pages = query.data?.pages ?? [];
  const ended =
    !query.hasNextPage ||
    (query.isFetchNextPageError && isPastEnd(query.error));
  const nextFailed = query.isFetchNextPageError && !isPastEnd(query.error);
  const view = pages.length > 0 ? searchView(params, pages, !ended) : null;
  const filteredSearch = pages[0]?.mode === "filtered_search";
  const items = joinPageResults(pages);

  const more = query.isFetchingNextPage ? (
    <ActivityIndicator className="py-6" accessibilityLabel="Loading more" />
  ) : nextFailed ? (
    <View accessibilityRole="alert" className="items-center gap-3 py-6">
      <Text className="text-text-secondary">
        {source} didn't respond. Try again in a moment.
      </Text>
      <GlassButton label="Try again" onPress={() => query.fetchNextPage()} />
    </View>
  ) : filteredSearch && !ended ? (
    <View className="items-center py-6">
      <GlassButton label="Load more" onPress={() => query.fetchNextPage()} />
    </View>
  ) : null;

  return (
    <View className="flex-1">
      <PosterGrid
        accessibilityLabel="Search results"
        items={view?.kind === "results" ? items : []}
        type={params.type}
        onEndReached={() => {
          if (
            view?.kind === "results" &&
            !filteredSearch &&
            !ended &&
            !nextFailed &&
            !query.isFetchingNextPage
          ) {
            query.fetchNextPage();
          }
        }}
        header={
          <View>
            {header}
            {view?.kind === "results" && view.countLine ? (
              <Text className="px-4 pb-3 text-sm text-muted-foreground">
                {view.countLine}
              </Text>
            ) : null}
          </View>
        }
        footer={
          <View>
            {status}
            {view?.kind === "no_matches" || view?.kind === "scan_empty" ? (
              <StatePanel title={view.title} description={view.description} />
            ) : null}
            {view === null || view.kind === "no_matches" ? null : more}
            <CatalogNotice type={params.type} />
          </View>
        }
      />
      {sheet}
    </View>
  );
}
