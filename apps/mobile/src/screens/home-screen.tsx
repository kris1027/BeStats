import {
  LANDING_COUNTS,
  landingSlots,
  nowBlurb,
} from "@bestats/core/catalog/landing";
import { useQueryClient } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
import { RefreshControl, ScrollView } from "react-native";

import { CatalogNotice } from "@/components/catalog-notice";
import { LandingSection } from "@/components/landing-section";
import { MediaSwitch } from "@/components/media-switch";
import { CATALOG_QUERY_ROOT } from "@/lib/catalog";
import { useMediaType } from "@/lib/media-type";
import { tokenColor } from "@/theme/token-vars";

/**
 * Home: the web's catalog landing for the chosen media type, natively
 * (prompts/mobile-app-shell-catalog.md, decision 4). The sections, their
 * lists, labels and counts all come from core's `landingSlots` and
 * `LANDING_COUNTS`, in the web's order: Trending, Popular, the "now"
 * section, the upcoming one, Top rated. The web's hero, parallax and moving
 * rows stay on the web. Signed out it shows the same, since the catalog is
 * public (AGENTS.md section 7).
 */
export function HomeScreen() {
  // Deferred, so a switch made on Search commits there first: this landing
  // remounts its five sections per type and, mounted in its hidden tab, would
  // otherwise hold that commit back for every one of them. Its own switch
  // still lights at once, since `MediaSwitch` reads the type directly.
  const mediaType = useDeferredValue(useMediaType().mediaType);
  const slots = landingSlots(mediaType);
  const queries = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    await queries
      .invalidateQueries({ queryKey: [CATALOG_QUERY_ROOT, "list", mediaType] })
      .finally(() => setRefreshing(false));
  }

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="pb-6"
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refresh}
          tintColor={tokenColor("color-foreground")}
        />
      }
    >
      <MediaSwitch />
      <LandingSection
        key={`${mediaType}-trending`}
        list={slots.trending}
        count={LANDING_COUNTS.trending}
        variant="large"
      />
      <LandingSection
        key={`${mediaType}-popular`}
        list={slots.popular}
        count={LANDING_COUNTS.popular}
        variant="row"
      />
      <LandingSection
        key={`${mediaType}-now`}
        list={slots.now}
        count={LANDING_COUNTS.now}
        variant="row"
        label={slots.nowLabel}
        blurb={(shown) => nowBlurb(slots.now, shown)}
      />
      <LandingSection
        key={`${mediaType}-upcoming`}
        list={slots.upcoming}
        count={LANDING_COUNTS.upcomingRow * LANDING_COUNTS.upcomingRowsPerPage}
        variant="row"
      />
      <LandingSection
        key={`${mediaType}-top`}
        list={slots.top}
        count={LANDING_COUNTS.top}
        variant="ranked"
      />
      <CatalogNotice type={mediaType} />
    </ScrollView>
  );
}
