"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";

import {
  CATALOG_PATHS,
  isMediaType,
  type LibraryType,
} from "@/lib/catalog/media-type";
import { gamesLibraryEnabled } from "@/lib/env";

import { WithPageMediaType } from "./page-media-type";

/**
 * The browser's memory of the last catalog viewed, for the logo only.
 * Exported so its test writes the same key.
 */
const LAST_MEDIA_TYPE_KEY = "bestats:last-media-type";

const BRAND_CLASS =
  "rounded-sm text-xl leading-none font-extrabold tracking-[-0.03em] text-foreground";

/**
 * The BeStats wordmark, linking to the landing of the catalog being viewed
 * (prompts/logo-follows-media-type.md): `/movies` on a movie page, `/shows`
 * on a TV page, and `/games` on a games page or games tab (spec 0028,
 * AC-16). On a page about neither catalog it links to the one last viewed, kept in `localStorage` because a cookie the server read would
 * pull every route out of its prerendered shell. It is a per browser
 * convenience only: nothing else reads it, and it never lights a tab, since
 * selection comes from the URL (`components/AGENTS.md`).
 */
function BrandLink() {
  return (
    <WithPageMediaType fallback={() => <BrandLinkView type="tv" />}>
      {(page) =>
        page.libraryType === null ? (
          <RememberedBrandLink />
        ) : (
          <TypedBrandLink type={page.libraryType} />
        )
      }
    </WithPageMediaType>
  );
}

/** On a typed page the logo follows the page, and remembers it. */
function TypedBrandLink({ type }: { type: LibraryType }) {
  useEffect(() => {
    try {
      window.localStorage.setItem(LAST_MEDIA_TYPE_KEY, type);
    } catch {
      // Blocked storage only costs the memory; the link still works.
    }
  }, [type]);

  return <BrandLinkView type={type} />;
}

/**
 * On a page with no type, the remembered catalog. The server snapshot is null,
 * so the server and the first client render agree on `/shows`.
 */
function RememberedBrandLink() {
  const type = useSyncExternalStore(subscribe, readRemembered, () => null);
  return <BrandLinkView type={type ?? "tv"} />;
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/**
 * The stored type, parsed as a `LibraryType`. A remembered `game` counts only
 * while the games library is on, so a stale value never leads to a hidden
 * tab (spec 0028, AC-16).
 */
function readRemembered(): LibraryType | null {
  try {
    const value = window.localStorage.getItem(LAST_MEDIA_TYPE_KEY);
    if (value === "game") return gamesLibraryEnabled() ? "game" : null;
    return isMediaType(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * The wordmark for one catalog. Also the Suspense fallback in `Navbar`, where
 * a dynamic route's pathname is unknown at prerender time.
 */
function BrandLinkView({ type }: { type: LibraryType }) {
  return (
    <Link href={CATALOG_PATHS[type]} className={BRAND_CLASS}>
      BeStats
    </Link>
  );
}

export { BrandLink, BrandLinkView, LAST_MEDIA_TYPE_KEY };
