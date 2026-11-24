import type { V1CatalogItem } from "@bestats/core/api/v1/browse";
import { type CatalogList, listPath } from "@bestats/core/catalog/lists";
import { todayUtc } from "@bestats/core/tv/air-status";
import { useQuery } from "@tanstack/react-query";
import { type Href, Link } from "expo-router";
import { FlatList, Pressable, View } from "react-native";
import { Text } from "@/components/text";
import { useCardStates } from "@/lib/card-states";
import { catalogKeys, fetchList } from "@/lib/catalog";

import { cardDateLabel } from "./dated-card";
import { GlassButton } from "./glass-button";
import { cardHref, communityRatingText, PosterCard } from "./poster-card";
import { PosterRowSkeleton } from "./skeleton";

/** Card widths in points: Trending is the large row, as on the web. */
const LARGE_CARD = 150;
const CARD = 112;

type Props = {
  list: CatalogList;
  /** How many titles of page 1 to show, from core's `LANDING_COUNTS`. */
  count: number;
  variant: "large" | "row" | "ranked";
  /** The small label above the heading (the sidebar's "In cinemas"). */
  label?: string;
  /** The line under the heading, given the number of titles shown. */
  blurb?: (shown: number) => string | null;
};

/**
 * One section of a catalog landing (prompts/mobile-app-shell-catalog.md,
 * decision 4): its list's page 1 from `/api/v1/lists`, cut to the web's
 * count. Each section reads on its own query, so a failed list shows
 * "Couldn't load …" with Try again in that section only and the rest of the
 * landing stays, as the web's row states do.
 */
export function LandingSection({ list, count, variant, label, blurb }: Props) {
  const query = useQuery({
    queryKey: [...catalogKeys.list(list.mediaType, list.slug), 1],
    queryFn: () => fetchList(list.mediaType, list.slug, 1),
  });
  const items = query.data?.results.slice(0, count) ?? [];
  // The ranked list draws rows, not cards, so it reads no card state.
  const known = useCardStates(
    list.mediaType,
    variant === "ranked" ? [] : items.map((item) => item.id),
  );
  const line = query.isSuccess && blurb ? blurb(items.length) : null;

  return (
    <View className="gap-3 pt-6">
      <View className="flex-row items-end justify-between gap-3 px-4">
        <View className="flex-1 gap-0.5">
          {label ? (
            <Text className="text-xs font-semibold tracking-wide text-text-label uppercase">
              {label}
            </Text>
          ) : null}
          <Text
            accessibilityRole="header"
            className="text-xl font-bold text-foreground"
          >
            {list.rowTitle}
          </Text>
          {line ? (
            <Text className="text-sm text-text-secondary">{line}</Text>
          ) : null}
        </View>
        <Link href={listPath(list) as Href} asChild>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`See all: ${list.heading}`}
            hitSlop={8}
            className="min-h-11 justify-center px-1"
          >
            <Text className="font-semibold text-text-link">See all</Text>
          </Pressable>
        </Link>
      </View>

      {query.isPending ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={`Loading ${list.rowTitle}`}
        >
          <PosterRowSkeleton width={variant === "large" ? LARGE_CARD : CARD} />
        </View>
      ) : query.isError ? (
        <View accessibilityRole="alert" className="items-start gap-3 px-4">
          <Text className="text-text-secondary">
            Couldn't load {list.rowTitle}
          </Text>
          <GlassButton label="Try again" onPress={() => query.refetch()} />
        </View>
      ) : items.length === 0 ? (
        <Text className="px-4 text-sm text-muted-foreground">
          Nothing here right now.
        </Text>
      ) : variant === "ranked" ? (
        <RankedList list={list} items={items} />
      ) : (
        <FlatList
          horizontal
          data={items}
          keyExtractor={(item) => String(item.id)}
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-3 px-4"
          renderItem={({ item }) => (
            <PosterCard
              item={item}
              type={list.mediaType}
              width={variant === "large" ? LARGE_CARD : CARD}
              dateLabel={cardDateLabel(list, item, todayUtc(new Date()))}
              known={known(item.id)}
            />
          )}
        />
      )}
    </View>
  );
}

/** Top rated: the web's numbered list, one row per title. */
function RankedList({
  list,
  items,
}: {
  list: CatalogList;
  items: V1CatalogItem[];
}) {
  return (
    <View className="px-4">
      {items.map((item, index) => {
        const rating = communityRatingText(
          list.mediaType,
          item.communityRating,
        );
        return (
          <Link key={item.id} href={cardHref(list.mediaType, item.id)} asChild>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={[
                `${index + 1}. ${item.title}`,
                item.year,
                rating,
              ]
                .filter(Boolean)
                .join(", ")}
              className="min-h-11 flex-row items-center gap-4 border-b border-border py-3"
            >
              <Text className="w-8 text-right text-2xl font-bold text-text-label">
                {index + 1}
              </Text>
              <View className="flex-1">
                <Text
                  numberOfLines={1}
                  className="text-base font-semibold text-foreground"
                >
                  {item.title}
                </Text>
                {item.year !== null ? (
                  <Text className="text-sm text-text-secondary">
                    {item.year}
                  </Text>
                ) : null}
              </View>
              {rating ? (
                <Text className="text-sm font-semibold text-rating-tmdb">
                  {rating}
                </Text>
              ) : null}
            </Pressable>
          </Link>
        );
      })}
    </View>
  );
}
