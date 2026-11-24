import {
  PICKER_COPY,
  pickerCapHint,
  pickerUnavailable,
} from "@bestats/core/search/messages";
import type { CatalogRef } from "@bestats/core/search/params";
import { filterByName, isPickerFull } from "@bestats/core/search/picker";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, View } from "react-native";

import { CheckIcon } from "@/components/icons";
import { Text, TextInput } from "@/components/text";
import { tokenColor } from "@/theme/token-vars";

import { INPUT_CLASS } from "./form-field";

type Props = {
  /** IGDB's platforms, `undefined` while they load, `null` when they failed. */
  platforms: readonly CatalogRef[] | null | undefined;
  selected: readonly number[];
  /** The most platforms one search takes (`SEARCH_CATALOGS.game`). */
  max: number;
  onToggle: (id: number) => void;
};

/**
 * The platforms view of the filters sheet on a games search
 * (prompts/mobile-look-search.md, decision 3): the web's `PlatformList`
 * (spec 0029, AC-10, AC-11) as a phone list. About 220 platforms, so a
 * filter box narrows them by name; a ticked platform the filter hides stays
 * ticked; once `max` are ticked the others are disabled and `Up to N` says
 * why. The rows are plain on the sheet, with no plate each, since only the
 * outermost surface is glass (apps/mobile/AGENTS.md, Styling).
 */
export function PlatformPicker({ platforms, selected, max, onToggle }: Props) {
  const [filter, setFilter] = useState("");

  if (platforms === undefined) {
    return (
      <ActivityIndicator
        className="py-6"
        accessibilityLabel="Loading platforms"
      />
    );
  }
  if (platforms === null) {
    return (
      <Text className="px-4 py-5 text-sm text-muted-foreground">
        {pickerUnavailable("Platforms")}
      </Text>
    );
  }

  const shown = filterByName(platforms, filter);
  const full = isPickerFull(selected, max);

  return (
    <FlatList
      data={shown}
      keyExtractor={(platform) => String(platform.id)}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerClassName="px-4 pb-8"
      ListHeaderComponent={
        <View className="gap-3 pb-3 pt-5">
          <Text className="text-xs font-semibold tracking-widest text-muted-foreground">
            {PICKER_COPY.platformsLegend}
          </Text>
          <TextInput
            accessibilityLabel={PICKER_COPY.filterPlatforms}
            placeholder={PICKER_COPY.filterPlatforms}
            placeholderTextColor={tokenColor("color-muted-foreground")}
            value={filter}
            onChangeText={setFilter}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            className={INPUT_CLASS}
          />
          {full ? (
            <Text className="text-xs text-muted-foreground">
              {pickerCapHint(max)}
            </Text>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <Text className="py-3 text-sm text-muted-foreground">
          {PICKER_COPY.noPlatformsMatch}
        </Text>
      }
      renderItem={({ item }) => (
        <PlatformRow
          platform={item}
          checked={selected.includes(item.id)}
          disabled={full && !selected.includes(item.id)}
          onToggle={onToggle}
        />
      )}
    />
  );
}

function PlatformRow({
  platform,
  checked,
  disabled,
  onToggle,
}: {
  platform: CatalogRef;
  checked: boolean;
  disabled: boolean;
  onToggle: (id: number) => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={platform.name}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onToggle(platform.id)}
      className="min-h-11 flex-row items-center gap-3 py-2"
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className={`size-6 items-center justify-center rounded-md border-[1.5px] ${
          checked
            ? "border-foreground bg-glass-plate"
            : "border-muted-foreground"
        }`}
      >
        {checked ? (
          <CheckIcon size={16} color={tokenColor("color-foreground")} />
        ) : null}
      </View>
      <Text className="flex-1 text-base text-foreground">{platform.name}</Text>
    </Pressable>
  );
}
