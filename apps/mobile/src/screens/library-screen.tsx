import type { V1LibraryEntry } from "@bestats/core/api/v1/library";
import {
  LIBRARY_CLASSIFY_LIMIT,
  type LibraryPageKey,
  type LibraryPath,
  libraryPageAt,
  libraryPageName,
  libraryPages,
  libraryPath,
} from "@bestats/core/catalog/library-list";
import {
  type LibraryType,
  parseLibraryTypeParam,
} from "@bestats/core/catalog/media-type";
import {
  LIBRARY_LIST_FAILED,
  LIBRARY_LIST_FAILED_TITLE,
  LIBRARY_NOTES,
  libraryCopy,
} from "@bestats/core/tracking/messages";
import { todayUtc } from "@bestats/core/tv/air-status";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { LoadingState, StatePanel } from "@/components/centered-state";
import { GlassButton } from "@/components/glass-button";
import { LibraryCard } from "@/components/library-card";
import { MediaSwitchView } from "@/components/media-switch";
import { useLibraryPage } from "@/lib/library";
import { useMediaType } from "@/lib/media-type";
import { useSession } from "@/lib/session";
import { tokenColor } from "@/theme/token-vars";

const COLUMNS = 3;
const GUTTER = 16;
const GAP = 12;

/**
 * The type and page the params name, or the defaults: Shows, and a type's
 * Watchlist slot (Up next, Watchlist, Want to play) for a route the type has
 * no page at, as core's `libraryPath` falls back (prompts/mobile-library-tabs.md,
 * decision 2). The page always comes from core's `libraryPageAt`, never from
 * a key read off the params (spec 0033, AC-10).
 */
export function resolveLibraryParams(params: {
  type?: string | string[];
  path?: string | string[];
}): { type: LibraryType; path: LibraryPath; page: LibraryPageKey } {
  const type = parseLibraryTypeParam(params.type) ?? "tv";
  const asked = typeof params.path === "string" ? params.path : null;
  const page =
    (asked === null ? null : libraryPageAt(asked as LibraryPath, type)) ??
    "watchlist";
  return { type, path: libraryPath(page, type), page };
}

/** The row of page pills: core's pages for the type, by core's names. */
function PagePills({
  type,
  page,
  onSelect,
}: {
  type: LibraryType;
  page: LibraryPageKey;
  onSelect: (next: LibraryPageKey) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
      contentContainerStyle={{ gap: 8, paddingHorizontal: GUTTER }}
    >
      {libraryPages(type).map((key) => {
        const selected = key === page;
        return (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onSelect(key)}
            className={`min-h-11 justify-center rounded-full border px-4 ${
              selected
                ? "border-primary bg-primary"
                : "border-border bg-glass-plate"
            }`}
          >
            <Text
              className={`text-sm font-semibold ${
                selected ? "text-primary-foreground" : "text-foreground"
              }`}
            >
              {libraryPageName(key, type)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/**
 * The Library tab (prompts/mobile-library-tabs.md, decisions 2, 3 and 7):
 * the Shows, Movies, Games switch, the type's page pills from core, the
 * web's notes, and the page's cards with infinite scroll, read from
 * `/api/v1/me/library`. Placement is the server's (AGENTS.md section 9); the
 * screen only draws it. Signed out it offers Sign in and sends no private
 * request (AGENTS.md section 11).
 */
export function LibraryScreen() {
  const router = useRouter();
  const { session, loading } = useSession();
  const params = useLocalSearchParams<{ type?: string; path?: string }>();
  const { type, path, page } = resolveLibraryParams(params);
  const query = useLibraryPage(type, path, Boolean(session));
  const { setMediaType } = useMediaType();
  const { width } = useWindowDimensions();
  const cardWidth = Math.floor(
    (width - GUTTER * 2 - GAP * (COLUMNS - 1)) / COLUMNS,
  );
  const today = todayUtc(new Date());

  if (loading) return <LoadingState label="Loading" />;
  if (!session) {
    return (
      <View className="flex-1 bg-background">
        <StatePanel
          title="Sign in to see your library"
          description="Your watchlist, progress and history are private to your account."
          action={{ label: "Sign in", onPress: () => router.push("/sign-in") }}
        />
      </View>
    );
  }

  const name = libraryPageName(page, type);
  const first = query.data?.pages[0];
  const entries: V1LibraryEntry[] =
    query.data?.pages.flatMap((loaded) => loaded.entries) ?? [];
  const nextFailed = query.isFetchNextPageError;
  const copy = libraryCopy(page, type);

  const header = (
    <View className="gap-3 pb-2">
      <MediaSwitchView
        value={type}
        // The same page on the other tab, Playing to Upcoming, as the web's
        // tabs switch (components/AGENTS.md, Selection comes from the URL).
        onChange={(next) =>
          router.setParams({ type: next, path: libraryPath(page, next) })
        }
      />
      <PagePills
        type={type}
        page={page}
        onSelect={(key) => router.setParams({ path: libraryPath(key, type) })}
      />
      {first?.capped ? (
        <Text className="px-4 text-sm text-text-secondary">
          {LIBRARY_NOTES.checked(LIBRARY_CLASSIFY_LIMIT, type)}
        </Text>
      ) : null}
      {first && first.failedCount > 0 ? (
        <View
          accessibilityRole="alert"
          className="flex-row flex-wrap items-center gap-3 px-4"
        >
          <Text className="text-sm text-text-secondary">
            {LIBRARY_NOTES.failed(first.failedCount, type)}
          </Text>
          <GlassButton label="Retry" onPress={() => query.refetch()} />
        </View>
      ) : null}
    </View>
  );

  const empty = query.isPending ? (
    <ActivityIndicator
      className="py-12"
      accessibilityLabel={`Loading ${name}`}
    />
  ) : query.isLoadingError || !first ? (
    <StatePanel
      tone="error"
      title={LIBRARY_LIST_FAILED_TITLE}
      description={LIBRARY_LIST_FAILED}
      action={{ label: "Retry", onPress: () => query.refetch() }}
    />
  ) : (
    <StatePanel
      title={copy.empty.title}
      description={copy.empty.description}
      action={{
        label: copy.browse,
        onPress: () => {
          setMediaType(type);
          router.navigate("/");
        },
      }}
    />
  );

  return (
    <FlatList
      accessibilityLabel={name}
      className="flex-1 bg-background"
      contentInsetAdjustmentBehavior="automatic"
      data={entries}
      numColumns={COLUMNS}
      keyExtractor={(entry) => `${entry.type}:${entry.id}`}
      columnWrapperStyle={{ gap: GAP, paddingHorizontal: GUTTER }}
      contentContainerStyle={{ gap: 20, paddingBottom: 24 }}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ListFooterComponent={
        query.isFetchingNextPage ? (
          <ActivityIndicator
            className="py-6"
            accessibilityLabel="Loading more"
          />
        ) : nextFailed ? (
          <View accessibilityRole="alert" className="items-center gap-3 py-6">
            <Text className="text-text-secondary">{LIBRARY_LIST_FAILED}</Text>
            <GlassButton label="Retry" onPress={() => query.fetchNextPage()} />
          </View>
        ) : undefined
      }
      onEndReached={() => {
        if (query.hasNextPage && !nextFailed && !query.isFetchingNextPage) {
          query.fetchNextPage();
        }
      }}
      onEndReachedThreshold={0.6}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching && !query.isFetchingNextPage}
          onRefresh={() => {
            query.refetch();
          }}
          tintColor={tokenColor("color-foreground")}
        />
      }
      renderItem={({ item }) => (
        <View>
          <LibraryCard
            entry={item}
            page={page}
            today={today}
            width={cardWidth}
          />
        </View>
      )}
    />
  );
}
