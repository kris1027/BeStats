import type { LibraryType } from "@bestats/core/catalog/media-type";
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useMemo,
  useState,
} from "react";

type MediaTypeState = {
  mediaType: LibraryType;
  setMediaType: (next: LibraryType) => void;
};

const MediaTypeContext = createContext<MediaTypeState | null>(null);

/**
 * The Shows, Movies or Games choice the Home and Search tabs share, kept for
 * the session (prompts/mobile-app-shell-catalog.md, decision 3). It starts on
 * Shows, as the web's `/` opens `/shows`.
 */
export function MediaTypeProvider({ children }: PropsWithChildren) {
  const [mediaType, setMediaType] = useState<LibraryType>("tv");
  const value = useMemo(() => ({ mediaType, setMediaType }), [mediaType]);
  return (
    <MediaTypeContext.Provider value={value}>
      {children}
    </MediaTypeContext.Provider>
  );
}

/**
 * The media type Home and Search share, so switching on one carries to the
 * other as the web's tabs do (AGENTS.md section 3, follow the shipped UI).
 * Throws outside `MediaTypeProvider`, where there is no type to share.
 */
export function useMediaType(): MediaTypeState {
  const value = useContext(MediaTypeContext);
  if (!value) throw new Error("useMediaType needs a MediaTypeProvider");
  return value;
}
