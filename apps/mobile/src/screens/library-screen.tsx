import type { V1LibraryEntry } from "@bestats/core/api/v1/library";
import {
  LIBRARY_CLASSIFY_LIMIT,
  type LibraryPageKey,
  type LibraryPath,
  libraryPageAt,
  libraryPageName,
  libraryPages,
  libraryPath,
  parseLibraryPathParam,
} from "@bestats/core/catalog/library-list";
import {
  type LibraryType,
  parseLibraryTypeParam,
} from "@bestats/core/catalog/media-type";
import {
  LIBRARY_LIST_FAILED,
  LIBRARY_LIST_FAILED_TITLE,
  LIBRARY_NOTES,
  LIBRARY_SIGNED_OUT,
  libraryCopy,
} from "@bestats/core/tracking/messages";
import { todayUtc } from "@bestats/core/tv/air-status";
import { useLocalSearchParams, useRouter } from "expo-router";
import { type ReactNode, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import { LoadingState, StatePanel } from "@/components/centered-state";
import { GlassPlate } from "@/components/glass/plate";
import { GlassButton } from "@/components/glass-button";
import { GRID, gridCardWidth } from "@/components/grid-layout";
import { LibraryCard } from "@/components/library-card";
import { MediaSwitchView } from "@/components/media-switch";
import { PosterCardSkeleton } from "@/components/skeleton";
import { Text } from "@/components/text";
import { useLibraryPage } from "@/lib/library";
import { cardActionFor, useLibraryCardActions } from "@/lib/library-actions";
import { useMediaType } from "@/lib/media-type";
import { useSession } from "@/lib/session";
import { PILL_FONT_SCALE_CAP, PILL_RADIUS } from "@/theme/pill";
import { tokenColor } from "@/theme/token-vars";

const { columns: COLUMNS, gutter: GUTTER, gap: GAP } = GRID;
/** The skeleton's cards, one id per column, so each keeps a stable key. */
const SKELETON_COLUMNS = Array.from({ length: COLUMNS }, (_, i) => i);

/**
 * The type and page the params name, or the defaults: Shows, and the type's
 * first page (Up next, Watchlist, Coming soon on games) for a route the type
 * has no page at (prompts/mobile-library-tabs.md, decision 2). The page
 * always comes from core's `libraryPageAt`, never from a key read off the
 * params (spec 0033, AC-10).
 */
export function resolveLibraryParams(params: {
  type?: string | string[];
  path?: string | string[];
}): { type: LibraryType; path: LibraryPath; page: LibraryPageKey } {
  const type = parseLibraryTypeParam(params.type) ?? "tv";
  const asked = parseLibraryPathParam(params.path);
  const page =
    (asked === null ? null : libraryPageAt(asked, type)) ??
    libraryPages(type)[0];
  return { type, path: libraryPath(page, type), page };
}

/**
 * Two rows of pulsing poster cards under the pills while the first page
 * loads (prompts/mobile-library-tabs.md, decision 7;
 * prompts/mobile-look-library.md, decision 9), at the grid's own size so
 * nothing shifts when the cards arrive. The skeletons are hidden from screen
 * readers; this view announces the wait once by its label.
 */
function LibrarySkeleton({ width, label }: { width: number; label: string }) {
  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityRole="progressbar"
      className="gap-5"
    >
      {[0, 1].map((row) => (
        <View
          key={row}
          style={{ gap: GAP, paddingHorizontal: GUTTER }}
          className="flex-row"
        >
          {SKELETON_COLUMNS.map((column) => (
            <PosterCardSkeleton key={column} width={width} />
          ))}
        </View>
      ))}
    </View>
  );
}

/**
 * A state drawn before the list exists (the session load, signed out) inside
 * a scroll view, so the large title's translucent bar never covers it and
 * UIKit insets it as it does the list (prompts/mobile-look-library.md,
 * decision 8).
 */
function ScrollState({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ flexGrow: 1 }}
    >
      {children}
    </ScrollView>
  );
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
          >
            {/* The web's selected glass, never a solid white fill
                (prompts/mobile-web-parity-foundation.md, decision 12). */}
            <GlassPlate
              sheen={selected ? "selected" : "glass"}
              radius={PILL_RADIUS}
              className="min-h-11 justify-center px-4"
            >
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={PILL_FONT_SCALE_CAP}
                className="text-sm font-semibold text-foreground"
              >
                {libraryPageName(key, type)}
              </Text>
            </GlassPlate>
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
  const actions = useLibraryCardActions(type, path, page);
  const { setMediaType } = useMediaType();
  const { width } = useWindowDimensions();
  const cardWidth = gridCardWidth(width);
  const today = todayUtc(new Date());
  // The spinner shows only for a pull the user started. Tied to
  // `isRefetching`, every write's background reload switched it on, and
  // under the large title's translucent bar iOS then left the list pushed
  // down by the spinner's height (prompts/mobile-look-library.md, build
  // deviations).
  const [pulling, setPulling] = useState(false);

  if (loading) {
    return (
      <ScrollState>
        <LoadingState label="Loading" />
      </ScrollState>
    );
  }
  if (!session) {
    return (
      <ScrollState>
        <StatePanel
          title={LIBRARY_SIGNED_OUT.title}
          description={LIBRARY_SIGNED_OUT.description}
          action={{ label: "Sign in", onPress: () => router.push("/sign-in") }}
        />
      </ScrollState>
    );
  }

  const name = libraryPageName(page, type);
  // A failed first read and a failed refresh both fail the list: the old
  // cards never stand in for a page that could not be loaded, and an empty
  // page never reads as empty (AGENTS.md section 11, no false success). A
  // failed next page keeps its own footer, since TanStack keeps
  // `isRefetchError` false for it.
  const listFailed = query.isLoadingError || query.isRefetchError;
  const first = listFailed ? undefined : query.data?.pages[0];
  const entries: V1LibraryEntry[] = listFailed
    ? []
    : (query.data?.pages.flatMap((loaded) => loaded.entries) ?? []);
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
    <LibrarySkeleton width={cardWidth} label={`Loading ${name}`} />
  ) : listFailed || !first ? (
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
      className="flex-1"
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
          refreshing={pulling}
          onRefresh={() => {
            setPulling(true);
            query.refetch().finally(() => setPulling(false));
          }}
          tintColor={tokenColor("color-foreground")}
        />
      }
      renderItem={({ item }) => {
        // The web card's quick action for this page, if it has one
        // (prompts/mobile-card-quick-actions.md, decision 1).
        const action = cardActionFor(item, page);
        return (
          <View>
            <LibraryCard
              entry={item}
              page={page}
              today={today}
              width={cardWidth}
              quick={
                action
                  ? {
                      action,
                      disabled: actions.isPending(item),
                      onPress: () => actions.run(item, action),
                    }
                  : undefined
              }
            />
          </View>
        );
      }}
    />
  );
}
