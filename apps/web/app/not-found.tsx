import type { Metadata } from "next";

import { StatePanel } from "@/components/state-panel";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Page not found",
};

/**
 * The app wide 404, rendered for any URL no route matches, and for a malformed
 * movie id that `proxy.ts` rewrites here with a real 404 status (spec 0006,
 * AC-8). It uses the shared panel so a wrong link still lands inside the app
 * with a way back, not on the framework's default page.
 */
export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col justify-center py-12">
      <StatePanel
        variant="empty"
        title="Page not found"
        description="There's nothing at this address. Check the link, or head back to the catalog."
        action={
          <ButtonLink size="touch" href="/movies">
            Browse movies
          </ButtonLink>
        }
      />
    </div>
  );
}
