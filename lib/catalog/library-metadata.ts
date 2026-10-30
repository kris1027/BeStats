import type { Metadata } from "next";

import {
  defaultLibraryType,
  type LibraryPageKey,
  libraryPageName,
} from "./library-list";
import { parseLibraryTypeParam } from "./media-type";

/**
 * A library page's metadata: its name on the current tab as the title, and
 * never indexed (prompts/library-page-names.md). Reading `searchParams` defers
 * the metadata to request time, which Cache Components allows here because
 * the page's section already streams; the shell stays prerendered. A bad
 * `type` titles the page's default tab, as the heading does.
 */
export async function libraryPageMetadata(
  list: LibraryPageKey,
  searchParams: Promise<Record<string, string | string[] | undefined>>,
): Promise<Metadata> {
  const type =
    parseLibraryTypeParam((await searchParams).type) ??
    defaultLibraryType(list);
  return { title: libraryPageName(list, type), robots: { index: false } };
}
