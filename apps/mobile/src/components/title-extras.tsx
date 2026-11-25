import type { V1CatalogItem } from "@bestats/core/api/v1/browse";
import type { V1Provider, V1TitleExtras } from "@bestats/core/api/v1/extras";
import {
  CATALOG_SOURCES,
  type LibraryType,
} from "@bestats/core/catalog/media-type";
import { youtubeWatchUrl } from "@bestats/core/catalog/trailer";
import {
  ALL_WATCH_OPTIONS_LABEL,
  notStreamingLine,
  WHERE_TO_WATCH_GROUPS,
  whereToWatchHeading,
} from "@bestats/core/catalog/where-to-watch";
import { JUSTWATCH_ATTRIBUTION } from "@bestats/core/legal/operator";
import { Image } from "expo-image";
import type { ReactNode } from "react";
import { FlatList, Pressable, View } from "react-native";

import { GlassButton } from "@/components/glass-button";
import { GlassPill } from "@/components/glass-pill";
import { ExternalLinkIcon, PlayIcon } from "@/components/icons";
import { PosterCard } from "@/components/poster-card";
import { PosterRowSkeleton, Skeleton } from "@/components/skeleton";
import { Text } from "@/components/text";
import { useCardStates } from "@/lib/card-states";
import { sizedImageUri } from "@/lib/images";
import { useOpenLink } from "@/lib/open-link";
import { lengthToken, tokenColor } from "@/theme/token-vars";

/** The web's provider logo size, in points (spec 0022, AC-12). */
const LOGO_SIZE = 48;
/** The Home row card width, so More like this matches a landing row. */
const ROW_CARD = 112;

/**
 * The state of one extras read, as a section needs it: the screens pass
 * their TanStack query straight in, so loading, failure and Try again stay
 * per section and never touch the title (prompts/mobile-look-title-extras.md,
 * decision 5).
 */
type ReadState<T> = {
  isPending: boolean;
  isError: boolean;
  data: T | undefined;
  refetch: () => unknown;
};

/**
 * The Trailer button (decision 2): it opens the YouTube watch page, which
 * the phone hands to the YouTube app or the browser, so nothing reaches
 * YouTube until it is pressed. Nothing renders with no trailer or a key
 * `youtubeWatchUrl` refuses, so the button never leads nowhere.
 */
export function TrailerButton({
  trailer,
  title,
}: {
  trailer: { key: string; name: string } | null | undefined;
  title: string;
}) {
  const openLink = useOpenLink();
  const url = trailer ? youtubeWatchUrl(trailer.key) : null;
  if (url === null) return null;
  return (
    <View className="flex-row">
      <GlassButton
        label="Trailer"
        accessibilityLabel={`Play the ${title} trailer on YouTube`}
        icon={<PlayIcon size={16} color={tokenColor("color-foreground")} />}
        onPress={() => openLink(url)}
      />
    </View>
  );
}

/** A section heading, the same look as Cast and Facts. */
function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <Text
      accessibilityRole="header"
      className="px-4 text-lg font-semibold text-foreground"
    >
      {children}
    </Text>
  );
}

/**
 * A failed extras read inside its own section (decision 5): one line naming
 * what and from where, as the web's section error line, and Try again, which
 * refetches only the extras.
 */
function SectionError({
  what,
  source,
  retry,
}: {
  what: string;
  source: string;
  retry: () => unknown;
}) {
  return (
    <View accessibilityRole="alert" className="items-start gap-3 px-4">
      <Text className="text-text-secondary">
        Couldn't load {what} from {source}.
      </Text>
      <GlassButton label="Try again" onPress={() => retry()} />
    </View>
  );
}

/**
 * Where to watch in the connection's country (spec 0022, AC-12; decisions 1
 * and 7): the heading names the country, each group shows only with a
 * provider, "All options on TMDB" opens TMDB's watch page there, and the
 * JustWatch credit TMDB's data asks for always shows once loaded. With no
 * providers it says so and never borrows another country's.
 */
export function WhereToWatch({ read }: { read: ReadState<V1TitleExtras> }) {
  const openLink = useOpenLink();
  if (read.isPending) {
    return (
      <View className="gap-3">
        <SectionHeading>{whereToWatchHeading(null)}</SectionHeading>
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Loading where to watch"
          className="flex-row gap-2.5 px-4"
        >
          {["a", "b", "c", "d"].map((key) => (
            <Skeleton
              key={key}
              shape="line"
              style={{
                width: LOGO_SIZE,
                height: LOGO_SIZE,
                borderRadius: lengthToken("radius-lg"),
              }}
            />
          ))}
        </View>
      </View>
    );
  }
  if (read.isError || read.data === undefined) {
    return (
      <View className="gap-3">
        <SectionHeading>{whereToWatchHeading(null)}</SectionHeading>
        <SectionError
          what="where to watch"
          source={CATALOG_SOURCES.movie}
          retry={read.refetch}
        />
      </View>
    );
  }

  const { region, watch } = read.data;
  const groups = WHERE_TO_WATCH_GROUPS.map((group) => ({
    ...group,
    providers: watch?.[group.key] ?? [],
  })).filter((group) => group.providers.length > 0);
  const link = groups.length > 0 ? (watch?.link ?? null) : null;

  return (
    <View className="gap-3">
      <SectionHeading>{whereToWatchHeading(region.name)}</SectionHeading>
      <View className="gap-4 px-4">
        {groups.length === 0 ? (
          <Text className="text-muted-foreground">
            {notStreamingLine(region.name)}
          </Text>
        ) : (
          groups.map((group) => (
            <View key={group.key} className="gap-2">
              <Text className="text-sm font-bold text-text-label">
                {group.label}
              </Text>
              <View className="flex-row flex-wrap gap-2.5">
                {group.providers.map((provider) => (
                  <ProviderLogo key={provider.id} provider={provider} />
                ))}
              </View>
            </View>
          ))
        )}
        <View className="gap-1">
          {link ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`${ALL_WATCH_OPTIONS_LABEL}, opens in the browser`}
              onPress={() => openLink(link)}
              hitSlop={8}
              className="min-h-11 flex-row items-center gap-1 self-start"
            >
              <Text className="text-sm text-text-link">
                {ALL_WATCH_OPTIONS_LABEL}
              </Text>
              <ExternalLinkIcon
                size={14}
                color={tokenColor("color-text-link")}
              />
            </Pressable>
          ) : null}
          <Text className="text-sm text-muted-foreground">
            {JUSTWATCH_ATTRIBUTION}
          </Text>
        </View>
      </View>
    </View>
  );
}

/**
 * A provider's square logo, named for VoiceOver, or its name in a glass pill
 * when TMDB has no logo (AGENTS.md section 3, the missing image state).
 */
function ProviderLogo({ provider }: { provider: V1Provider }) {
  if (provider.logoUrl === null) {
    return <GlassPill>{provider.name}</GlassPill>;
  }
  return (
    <Image
      source={{ uri: sizedImageUri(provider.logoUrl, LOGO_SIZE) }}
      accessible
      accessibilityLabel={provider.name}
      contentFit="cover"
      style={{
        width: LOGO_SIZE,
        height: LOGO_SIZE,
        borderRadius: lengthToken("radius-lg"),
      }}
    />
  );
}

/**
 * More like this (spec 0022, AC-14; spec 0031, AC-8 for a game; decision 6):
 * up to 12 recommendations or similar games as Home row cards, with no See
 * all. Its own skeleton while loading and its own error line; with none,
 * the section is left out. Signed in, its cards carry the user's marks and
 * long press actions, as Home's do (prompts/mobile-look-card-actions.md).
 */
export function MoreLikeThis({
  type,
  read,
}: {
  type: LibraryType;
  read: ReadState<readonly V1CatalogItem[]>;
}) {
  const known = useCardStates(type, read.data?.map((item) => item.id) ?? []);
  if (!read.isPending && !read.isError && (read.data?.length ?? 0) === 0) {
    return null;
  }
  return (
    <View className="gap-3">
      <SectionHeading>More like this</SectionHeading>
      {read.isPending ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Loading more like this"
        >
          <PosterRowSkeleton width={ROW_CARD} />
        </View>
      ) : read.isError || read.data === undefined ? (
        <SectionError
          what={type === "game" ? "similar games" : "recommendations"}
          source={CATALOG_SOURCES[type]}
          retry={read.refetch}
        />
      ) : (
        <FlatList
          horizontal
          data={read.data}
          keyExtractor={(item) => String(item.id)}
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-3 px-4"
          renderItem={({ item }) => (
            <PosterCard
              item={item}
              type={type}
              width={ROW_CARD}
              known={known(item.id)}
            />
          )}
        />
      )}
    </View>
  );
}

/**
 * More like this fed by a movie's or show's extras read, in its slot of the
 * screen's order (decision 6), with the padding the sections around it use.
 * Left out entirely once the read shows no recommendations.
 */
export function MoreLikeThisSlot({
  type,
  read,
}: {
  type: "movie" | "tv";
  read: ReadState<V1TitleExtras>;
}) {
  if (read.data !== undefined && read.data.recommendations.length === 0) {
    return null;
  }
  return (
    <View className="pt-6">
      <MoreLikeThis
        type={type}
        read={{
          isPending: read.isPending,
          isError: read.isError,
          data: read.data?.recommendations,
          refetch: read.refetch,
        }}
      />
    </View>
  );
}

/** The hero's age pill from the extras read: absent until it loads, then
 * only when the connection's country has a rating (decision 8). */
export function ageRatingOf(
  extras: V1TitleExtras | undefined,
): { rating: string; regionName: string } | null {
  if (!extras?.ageRating) return null;
  return { rating: extras.ageRating, regionName: extras.region.name };
}
