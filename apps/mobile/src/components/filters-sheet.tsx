import { CATALOG_SOURCES } from "@bestats/core/catalog/media-type";
import { SEARCH_CATALOGS } from "@bestats/core/search/catalogs";
import {
  GAME_MIN_RATING_COUNT,
  MIN_VOTE_COUNT,
  RATING_STEPS,
  type RatingStep,
} from "@bestats/core/search/constants";
import { pickerUnavailable } from "@bestats/core/search/messages";
import { minYear, type SearchParams } from "@bestats/core/search/params";
import { isPickerFull } from "@bestats/core/search/picker";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  View,
} from "react-native";

import { ChevronLeftIcon } from "@/components/icons";
import { Text } from "@/components/text";
import { catalogKeys, fetchGenres, fetchPlatforms } from "@/lib/catalog";
import { PILL_RADIUS } from "@/theme/pill";
import { tokenColor } from "@/theme/token-vars";

import { ChevronRow } from "./chevron-row";
import { GlassPlate } from "./glass/plate";
import { GlassButton } from "./glass-button";
import { PageBackground } from "./page-background";
import { PlatformPicker } from "./platform-picker";

type Filters = Pick<
  SearchParams,
  "genreIds" | "platformIds" | "year" | "rating"
>;

/**
 * No filter beyond the title query: what the sheet's Clear filters sets.
 * Counts and clearing include platforms (AGENTS.md section 10;
 * prompts/mobile-look-search.md, decision 6).
 */
const NO_FILTERS: Filters = {
  genreIds: [],
  platformIds: [],
  year: null,
  rating: null,
};

type Props = {
  visible: boolean;
  params: SearchParams;
  /** The current UTC year, so the year range moves on New Year's Day. */
  currentYear: number;
  onChange: (next: Filters) => void;
  onClose: () => void;
};

/**
 * The web filter bar's Genres, Platforms (games only), Year and minimum
 * rating as a sheet (AGENTS.md section 10; prompts/mobile-app-shell-catalog.md,
 * decision 7). The choices come from core, `/api/v1/genres` and
 * `/api/v1/platforms`. Platforms opens a second view inside the same sheet,
 * since the sheet is a `Modal` outside the tab's stack
 * (prompts/mobile-look-search.md, decision 3). A failed genre or platform
 * list leaves its picker unavailable and the rest working, as the web does
 * (spec 0029, AC-11).
 */
export function FiltersSheet({
  visible,
  params,
  currentYear,
  onChange,
  onClose,
}: Props) {
  const source = CATALOG_SOURCES[params.type];
  const genres = useQuery({
    queryKey: catalogKeys.genres(params.type),
    queryFn: () => fetchGenres(params.type),
    enabled: visible,
    staleTime: 24 * 60 * 60 * 1000,
  });
  const games = params.type === "game";
  const platforms = useQuery({
    queryKey: catalogKeys.platforms(),
    queryFn: fetchPlatforms,
    enabled: visible && games,
    staleTime: 24 * 60 * 60 * 1000,
  });
  const [view, setView] = useState<"filters" | "platforms">("filters");
  // A sheet opens on its filters, whatever view it was closed on.
  useEffect(() => {
    if (!visible) setView("filters");
  }, [visible]);
  const cap = SEARCH_CATALOGS[params.type].maxFilterIds;
  const years: number[] = [];
  for (let year = currentYear + 1; year >= minYear(params.type); year--) {
    years.push(year);
  }

  const current: Filters = {
    genreIds: params.genreIds,
    platformIds: params.platformIds,
    year: params.year,
    rating: params.rating,
  };

  function toggleGenre(id: number) {
    const has = current.genreIds.includes(id);
    const next = has
      ? current.genreIds.filter((value) => value !== id)
      : [...current.genreIds, id].sort((a, b) => a - b);
    onChange({ ...current, genreIds: next });
  }

  function togglePlatform(id: number) {
    const has = current.platformIds.includes(id);
    const next = has
      ? current.platformIds.filter((value) => value !== id)
      : [...current.platformIds, id].sort((a, b) => a - b);
    onChange({ ...current, platformIds: next });
  }

  const platformMax = SEARCH_CATALOGS.game.maxFilterIds ?? Infinity;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      allowSwipeDismissal
      onRequestClose={onClose}
    >
      <View className="flex-1">
        <PageBackground />
        <View className="flex-row items-center justify-between px-4 pt-4">
          <View className="flex-row items-center gap-1">
            {view === "platforms" ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back to filters"
                onPress={() => setView("filters")}
                hitSlop={8}
                className="size-11 items-center justify-center"
              >
                <ChevronLeftIcon
                  size={24}
                  color={tokenColor("color-foreground")}
                />
              </Pressable>
            ) : null}
            <Text
              accessibilityRole="header"
              className="text-xl font-bold text-foreground"
            >
              {view === "platforms" ? "Platforms" : "Filters"}
            </Text>
          </View>
          <GlassButton variant="primary" label="Done" onPress={onClose} />
        </View>
        {view === "platforms" ? (
          <PlatformPicker
            platforms={platforms.isError ? null : platforms.data?.platforms}
            selected={current.platformIds}
            max={platformMax}
            onToggle={togglePlatform}
          />
        ) : (
          <ScrollView contentContainerClassName="gap-6 px-4 py-5">
            <Group title="Genres">
              {genres.isPending ? (
                <ActivityIndicator accessibilityLabel="Loading genres" />
              ) : genres.isError ? (
                <Text className="text-sm text-muted-foreground">
                  {pickerUnavailable("Genres")}
                </Text>
              ) : (
                <View className="flex-row flex-wrap gap-2">
                  {genres.data.genres.map((genre) => {
                    const selected = current.genreIds.includes(genre.id);
                    const full =
                      !selected && isPickerFull(current.genreIds, cap);
                    return (
                      <Chip
                        key={genre.id}
                        label={genre.name}
                        selected={selected}
                        disabled={full}
                        onPress={() => toggleGenre(genre.id)}
                      />
                    );
                  })}
                </View>
              )}
            </Group>

            {games ? (
              <Group title="Platforms">
                {platforms.isError ? (
                  <Text className="text-sm text-muted-foreground">
                    {pickerUnavailable("Platforms")}
                  </Text>
                ) : (
                  <ChevronRow
                    label={
                      current.platformIds.length > 0
                        ? `Platforms (${current.platformIds.length})`
                        : "Any platform"
                    }
                    hint="Opens the list of platforms"
                    onPress={() => setView("platforms")}
                  />
                )}
              </Group>
            ) : null}

            <Group title="Year">
              <FlatList
                horizontal
                data={[null, ...years]}
                keyExtractor={(year) => String(year)}
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="gap-2"
                renderItem={({ item: year }) => (
                  <Chip
                    label={year === null ? "Any year" : String(year)}
                    selected={current.year === year}
                    single
                    onPress={() => onChange({ ...current, year })}
                  />
                )}
              />
            </Group>

            <Group title="Rating">
              <View className="flex-row flex-wrap gap-2">
                {([null, ...RATING_STEPS] as (RatingStep | null)[]).map(
                  (rating) => (
                    <Chip
                      key={String(rating)}
                      label={
                        rating === null ? `Any ${source} rating` : `${rating}+`
                      }
                      accessibilityLabel={
                        rating === null
                          ? `Any ${source} rating`
                          : `${source} rating ${rating} or more`
                      }
                      selected={current.rating === rating}
                      single
                      onPress={() => onChange({ ...current, rating })}
                    />
                  ),
                )}
              </View>
              {current.rating !== null ? (
                <Text className="text-xs text-muted-foreground">
                  {params.type === "game"
                    ? `Only games with at least ${GAME_MIN_RATING_COUNT} IGDB ratings`
                    : `Only titles with at least ${MIN_VOTE_COUNT} TMDB votes`}
                </Text>
              ) : null}
            </Group>

            <GlassButton
              label="Clear filters"
              disabled={
                current.genreIds.length === 0 &&
                current.platformIds.length === 0 &&
                current.year === null &&
                current.rating === null
              }
              onPress={() => onChange(NO_FILTERS)}
            />
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-3">
      <Text
        accessibilityRole="header"
        className="font-semibold text-text-label"
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function Chip({
  label,
  selected,
  disabled,
  onPress,
  accessibilityLabel,
  single = false,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  /** One choice of several (year, rating): read as a radio, not a checkbox. */
  single?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole={single ? "radio" : "checkbox"}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      <GlassPlate
        sheen={selected ? "selected" : "glass"}
        radius={PILL_RADIUS}
        className="min-h-11 justify-center px-4"
      >
        <Text className="text-sm font-semibold text-foreground">{label}</Text>
      </GlassPlate>
    </Pressable>
  );
}
