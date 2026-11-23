import { CATALOG_SOURCES } from "@bestats/core/catalog/media-type";
import { SEARCH_CATALOGS } from "@bestats/core/search/catalogs";
import {
  GAME_MIN_RATING_COUNT,
  MIN_VOTE_COUNT,
  RATING_STEPS,
  type RatingStep,
} from "@bestats/core/search/constants";
import { minYear, type SearchParams } from "@bestats/core/search/params";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  View,
} from "react-native";

import { Text } from "@/components/text";
import { catalogKeys, fetchGenres } from "@/lib/catalog";

import { GlassPlate } from "./glass/plate";
import { GlassButton } from "./glass-button";
import { PageBackground } from "./page-background";

type Filters = Pick<SearchParams, "genreIds" | "year" | "rating">;

type Props = {
  visible: boolean;
  params: SearchParams;
  /** The current UTC year, so the year range moves on New Year's Day. */
  currentYear: number;
  onChange: (next: Filters) => void;
  onClose: () => void;
};

/**
 * The web filter bar's Genres, Year and minimum rating as a sheet
 * (AGENTS.md section 10; prompts/mobile-app-shell-catalog.md, decision 7). The choices come from
 * core and `/api/v1/genres`; a games search has no Platforms filter in this
 * slice (decision 2). A failed genre list leaves its picker unavailable and
 * the rest working, as the web does (spec 0029, AC-11).
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
  const cap = SEARCH_CATALOGS[params.type].maxFilterIds;
  const years: number[] = [];
  for (let year = currentYear + 1; year >= minYear(params.type); year--) {
    years.push(year);
  }

  const current: Filters = {
    genreIds: params.genreIds,
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
          <Text
            accessibilityRole="header"
            className="text-xl font-bold text-foreground"
          >
            Filters
          </Text>
          <GlassButton variant="primary" label="Done" onPress={onClose} />
        </View>
        <ScrollView contentContainerClassName="gap-6 px-4 py-5">
          <Group title="Genres">
            {genres.isPending ? (
              <ActivityIndicator accessibilityLabel="Loading genres" />
            ) : genres.isError ? (
              <Text className="text-sm text-muted-foreground">
                Genres unavailable
              </Text>
            ) : (
              <View className="flex-row flex-wrap gap-2">
                {genres.data.genres.map((genre) => {
                  const selected = current.genreIds.includes(genre.id);
                  const full =
                    cap !== null && !selected && current.genreIds.length >= cap;
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
              current.year === null &&
              current.rating === null
            }
            onPress={() => onChange({ genreIds: [], year: null, rating: null })}
          />
        </ScrollView>
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
        radius={999}
        className="min-h-11 justify-center px-4"
      >
        <Text className="text-sm font-semibold text-foreground">{label}</Text>
      </GlassPlate>
    </Pressable>
  );
}
