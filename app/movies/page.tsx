import type { Metadata } from "next";

import { StatePanel } from "@/components/state-panel";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Movies",
};

/**
 * The movie landing route, the counterpart to `/shows`.
 *
 * It exists today so the media type tabs have two real destinations and the
 * path derived selection in `MediaTypeTabs` has something to be wrong about if
 * it breaks (spec 0004, AC-14, AC-17).
 */
export default function MoviesPage() {
  return (
    <div className="flex flex-1 flex-col justify-center py-12">
      <StatePanel
        variant="empty"
        title="No movies here yet"
        description="The movie page lands with feature 7. This route is here so the navigation, the shell and the shared empty state are real from the start."
        action={
          <ButtonLink size="touch" href="/shows">
            Browse shows
          </ButtonLink>
        }
      />
    </div>
  );
}
