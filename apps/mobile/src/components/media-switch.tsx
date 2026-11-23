import type { LibraryType } from "@bestats/core/catalog/media-type";
import { Pressable, View } from "react-native";

import { Text } from "@/components/text";
import { useMediaType } from "@/lib/media-type";
import { PILL_FONT_SCALE_CAP, PILL_RADIUS } from "@/theme/pill";

import { GlassPlate } from "./glass/plate";

/** The web's media tabs, in their order and with their names. */
const OPTIONS: readonly { type: LibraryType; label: string }[] = [
  { type: "tv", label: "Shows" },
  { type: "movie", label: "Movies" },
  { type: "game", label: "Games" },
];

/**
 * The Shows, Movies, Games switch Home and Search share
 * (prompts/mobile-app-shell-catalog.md, decision 3), reading their shared
 * choice from `useMediaType()`. Its labels are a tab-like toggle, so they
 * grow with Dynamic Type only to the pill cap and stay on one line, never
 * breaking a word (prompts/mobile-web-parity-foundation.md, requirement 8).
 */
export function MediaSwitch() {
  const { mediaType, setMediaType } = useMediaType();
  return <MediaSwitchView value={mediaType} onChange={setMediaType} />;
}

/**
 * The switch itself: a segmented glass control whose lit segment is the
 * web's cyan `glass-selected-personal` tab with its dark `text-on-personal`
 * label (prompts/mobile-web-parity-foundation.md, decision 12), each segment 44pt tall for
 * the touch rule (AGENTS.md section 3) and announced as a tab with its
 * selected state. The Library tab drives it with its own type, which is not
 * Home's (prompts/mobile-library-tabs.md, decision 3).
 */
export function MediaSwitchView({
  value,
  onChange,
}: {
  value: LibraryType;
  onChange: (next: LibraryType) => void;
}) {
  return (
    <GlassPlate
      accessibilityRole="tablist"
      shadow
      radius={PILL_RADIUS}
      className="mx-4 my-3 flex-row p-1"
    >
      {OPTIONS.map((option) => {
        const selected = option.type === value;
        return (
          <Pressable
            key={option.type}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.type)}
            className="flex-1"
          >
            {selected ? (
              <GlassPlate
                sheen="personal"
                radius={PILL_RADIUS}
                className="min-h-11 items-center justify-center"
              >
                <Text
                  numberOfLines={1}
                  maxFontSizeMultiplier={PILL_FONT_SCALE_CAP}
                  className="text-base font-semibold text-text-on-personal"
                >
                  {option.label}
                </Text>
              </GlassPlate>
            ) : (
              <View className="min-h-11 items-center justify-center">
                <Text
                  numberOfLines={1}
                  maxFontSizeMultiplier={PILL_FONT_SCALE_CAP}
                  className="text-base font-semibold text-foreground"
                >
                  {option.label}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </GlassPlate>
  );
}
