import { useRouter } from "expo-router";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react-native";
import { View } from "react-native";

import { tokenColor } from "@/theme/token-vars";

import { GlassButton } from "./glass-button";

type SeasonLink = { seasonNumber: number; name: string };

/**
 * Previous and Next season, as the web's season nav (spec 0009, AC-12). It
 * replaces the screen rather than pushing, so Back still returns to the show
 * instead of walking through every season visited.
 */
export function SeasonNav({
  showId,
  previous,
  next,
}: {
  showId: number;
  previous: SeasonLink | null;
  next: SeasonLink | null;
}) {
  const router = useRouter();
  if (!previous && !next) return null;
  const go = (seasonNumber: number) =>
    router.replace({
      pathname: "/shows/[id]/season/[number]",
      params: { id: String(showId), number: String(seasonNumber) },
    });
  return (
    <View className="flex-row flex-wrap justify-between gap-2">
      {previous ? (
        <GlassButton
          label={previous.name}
          icon={
            <ChevronLeftIcon size={18} color={tokenColor("color-foreground")} />
          }
          accessibilityLabel={`Previous season, ${previous.name}`}
          onPress={() => go(previous.seasonNumber)}
        />
      ) : (
        <View />
      )}
      {next ? (
        <GlassButton
          label={next.name}
          icon={
            <ChevronRightIcon
              size={18}
              color={tokenColor("color-foreground")}
            />
          }
          iconAfter
          accessibilityLabel={`Next season, ${next.name}`}
          onPress={() => go(next.seasonNumber)}
        />
      ) : null}
    </View>
  );
}
