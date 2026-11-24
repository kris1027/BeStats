import {
  ICON_KEY_ENTRIES,
  ICON_KEY_LABEL,
  type IconKeyMark,
} from "@bestats/core/catalog/icon-key";
import type { ReactNode } from "react";
import { View } from "react-native";
import { RatingStar } from "@/components/glass-pill";
import {
  CalendarIcon,
  NextEpisodeIcon,
  PlanIcon,
  PlannedIcon,
  WatchedIcon,
} from "@/components/icons";
import { Text } from "@/components/text";

/** The size the key draws every mark at, the web key's `size-4`. */
const SIZE = 16;

/**
 * The app's own icon for each mark core lists: the same icons and meaning
 * colours the cards and pills draw, so the key can never drift from them.
 */
const ICONS: Record<IconKeyMark, ReactNode> = {
  communityRating: <RatingStar tone="community" />,
  personalScore: <RatingStar tone="personal" />,
  plan: <PlanIcon size={SIZE} />,
  planned: <PlannedIcon size={SIZE} />,
  markWatched: <WatchedIcon filled={false} size={SIZE} />,
  watched: <WatchedIcon filled size={SIZE} />,
  nextEpisode: <NextEpisodeIcon size={SIZE} />,
  releaseDate: <CalendarIcon size={SIZE} />,
};

/**
 * The key to the card marks on About, the web footer's `IconKey`
 * (prompts/mobile-look-account.md, decision 9), with core's words and order,
 * so the community and personal stars are named apart as on the web (AGENTS.md
 * section 9). Icons are decorative; each entry is read by its label alone,
 * and the header names the list (AGENTS.md section 3).
 */
export function IconKey() {
  return (
    <View className="gap-3">
      <Text
        accessibilityRole="header"
        className="text-base font-semibold text-foreground"
      >
        {ICON_KEY_LABEL}
      </Text>
      {ICON_KEY_ENTRIES.map((entry) => (
        <View
          key={entry.mark}
          accessible
          accessibilityLabel={entry.label}
          className="min-h-6 flex-row items-center gap-3"
        >
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            className="w-5 items-center"
          >
            {ICONS[entry.mark]}
          </View>
          <Text className="flex-1 text-sm text-text-legend">{entry.label}</Text>
        </View>
      ))}
    </View>
  );
}
