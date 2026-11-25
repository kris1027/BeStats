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
import { useNavigation } from "expo-router";
import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import type { SearchBarCommands } from "react-native-screens";
import { CatalogNotice } from "@/components/catalog-notice";
import { LoadingState, StatePanel } from "@/components/centered-state";
import { FiltersSheet } from "@/components/filters-sheet";
import { GlassButton } from "@/components/glass-button";
import { MediaSwitch } from "@/components/media-switch";
import { PosterGrid } from "@/components/poster-grid";
import { Text } from "@/components/text";
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
 * same count copy and states (AGENTS.md section 10). The title field is the
 * platform's own search bar under the large title (prompts/mobile-look-search.md,
 * decision 1), so it lives in the header options, not the grid. Titles load as you
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
  const searchBar = useRef<SearchBarCommands>(null);
  const navigation = useNavigation();
  const currentYear = new Date().getUTCFullYear();

  // A new catalog keeps the title and drops filters, whose genre ids belong
  // to the old catalog. Adjusted during render, not in an effect: an effect
  // commits one frame of the old type's grid, placeholder and caption first,
  // and its cards stay tappable until the second pass lands.
  if (params.type !== mediaType) {
    setParams({ ...emptySearchParams(mediaType), q: params.q });
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      const q = text.trim() === "" ? null : text.trim();
      setParams((current) => (current.q === q ? current : { ...current, q }));
    }, FILTER_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const placeholder = `Search ${mediaNoun(params.type)} by title`;
  useLayoutEffect(() => {
    navigation.setOptions({
      headerSearchBarOptions: {
        ref: searchBar,
        placeholder,
        placement: "stacked",
        hideWhenScrolling: false,
        hideNavigationBar: false,
        obscureBackground: false,
        autoCapitalize: "none",
        textColor: tokenColor("color-foreground"),
        hintTextColor: tokenColor("color-muted-foreground"),
        tintColor: tokenColor("color-foreground"),
        onChangeText: (event: { nativeEvent: { text: string } }) => {
          const value = event.nativeEvent.text;
          // The native bar has no maxLength, so the cap the web's field
          // keeps is applied here (AGENTS.md section 11, validate input).
          if (value.length > MAX_QUERY_LENGTH) {
            const capped = value.slice(0, MAX_QUERY_LENGTH);
            searchBar.current?.setText(capped);
            setText(capped);
          } else {
            setText(value);
          }
        },
        onCancelButtonPress: () => setText(""),
      },
    });
  }, [navigation, placeholder]);

  function clearAll() {
    searchBar.current?.clearText();
    setText("");
    setParams(emptySearchParams(params.type));
  }

  const query = useInfiniteQuery({
    queryKey: catalogKeys.search(params),
    queryFn: ({ pageParam }) => fetchSearch(params, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last: V1Search) => last.nextPage ?? undefined,
  });

  const filterCount =
    params.genreIds.length +
    params.platformIds.length +
    (params.year === null ? 0 : 1) +
    (params.rating === null ? 0 : 1);

  const header = (
    <View>
      <MediaSwitch />
      <View className="gap-3 px-4 pb-3">
        <View className="flex-row items-center gap-3">
          <GlassButton
            label={filterCount > 0 ? `Filters (${filterCount})` : "Filters"}
            onPress={() => setFiltersOpen(true)}
          />
          {filterCount > 0 || params.q !== null ? (
            <Pressable
              accessibilityRole="button"
              onPress={clearAll}
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

  // One tree for every state, so the grid keeps its scroll position while a
  // new search loads.
  let status: ReactNode = null;
  if (query.isPending) {
    status = <LoadingState layout="grid" label="Loading results" />;
  } else if (query.isLoadingError) {
    const invalid =
      query.error instanceof ApiError && query.error.code === "invalid_input";
    status = invalid ? (
      <StatePanel
        title="That filter isn't valid"
        description="One of these filters isn't one we can search with."
        action={{
          label: "Clear filters",
          // Keeps the title the header bar still shows.
          onPress: () =>
            setParams({ ...emptySearchParams(params.type), q: params.q }),
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
