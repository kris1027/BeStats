import type { Metadata } from "next";

import { StatePanel } from "@/components/state-panel";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Shows",
};

/**
 * The TV landing route.
 *
 * A placeholder that renders the real shell and the real empty state panel,
 * which is the thin end to end thread spec 0004 asks for: a token feeds a
 * utility, the utility feeds a component, the component renders through the
 * app shell on a real route. The browse grid that fills it has no owning
 * feature in the scope yet, which the spec records as a follow up.
 */
export default function ShowsPage() {
  return (
    <div className="flex flex-1 flex-col justify-center py-12">
      <StatePanel
        variant="empty"
        title="Nothing to show yet"
        description="Browsing TV shows arrives with the show pages. Until then, the shell, the tokens and the shared states are what live here."
        action={
          <ButtonLink size="touch" href="/movies">
            Browse movies
          </ButtonLink>
        }
      />
    </div>
  );
}
