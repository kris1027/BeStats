import * as Linking from "expo-linking";
import { useCallback } from "react";

import { useToast } from "@/components/toast";

/** What the toast says when the phone refuses to open a link. */
export const OPEN_LINK_FAILED = "Could not open the link.";

/**
 * Opens an outside link (a trailer, Where to watch, a legal page) and says so
 * when the phone cannot: `Linking.openURL` rejects when no app takes the URL,
 * and a button that does nothing and says nothing is a silent failure
 * (AGENTS.md section 11; prompts/mobile-look-review-fixes.md, decision 1).
 * The toast never names the URL. A URL built from config can be passed as a
 * function, so a missing value fails into the same toast, not a throw.
 */
export function useOpenLink(): (url: string | (() => string)) => void {
  const toast = useToast();
  return useCallback(
    (url: string | (() => string)) => {
      Promise.resolve()
        .then(() => Linking.openURL(typeof url === "function" ? url() : url))
        .catch(() => {
          toast.show({ id: "open-link", message: OPEN_LINK_FAILED });
        });
    },
    [toast],
  );
}
