import { SeasonScreen } from "@/screens/season-screen";

/**
 * `/shows/{id}/season/{number}`, the web's season path, inside every tab's
 * stack so a season opened from Search keeps Search's back stack
 * (prompts/mobile-title-tracking.md, decision 7).
 */
export default function SeasonRoute() {
  return <SeasonScreen />;
}
