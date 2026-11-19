import type { LibraryType } from "@bestats/core/catalog/media-type";
import { Pressable, Text, View } from "react-native";

import { useMediaType } from "@/lib/media-type";

/** The web's media tabs, in their order and with their names. */
const OPTIONS: readonly { type: LibraryType; label: string }[] = [
  { type: "tv", label: "Shows" },
  { type: "movie", label: "Movies" },
  { type: "game", label: "Games" },
];

/**
 * The Shows, Movies, Games switch Home and Search share
 * (prompts/mobile-app-shell-catalog.md, decision 3): a segmented glass
 * control, each segment 44pt tall and announced as a tab with its selected
 * state.
 */
export function MediaSwitch() {
  const { mediaType, setMediaType } = useMediaType();
  return (
    <View
      accessibilityRole="tablist"
      className="mx-4 my-3 flex-row rounded-full border border-border bg-glass-plate p-1"
    >
      {OPTIONS.map((option) => {
        const selected = option.type === mediaType;
        return (
          <Pressable
            key={option.type}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => setMediaType(option.type)}
            className={`min-h-11 flex-1 items-center justify-center rounded-full ${
              selected ? "bg-primary" : ""
            }`}
          >
            <Text
              className={`text-base font-semibold ${
                selected ? "text-primary-foreground" : "text-foreground"
              }`}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
