import type { Metadata } from "next";

import { type LibraryList, libraryPageName } from "@/lib/catalog/library-list";
import { parseLibraryTypeParam } from "@/lib/catalog/media-type";

/**
 * A library page's metadata: its name on the current tab as the title, and
 * never indexed (prompts/library-page-names.md). Reading `searchParams` defers
 * the metadata to request time, which Cache Components allows here because
 * the page's section already streams; the shell stays prerendered. A bad
 * `type` titles the shows tab, as the heading does.
 */
export async function libraryPageMetadata(
  list: LibraryList,
  searchParams: Promise<Record<string, string | string[] | undefined>>,
): Promise<Metadata> {
  const type = parseLibraryTypeParam((await searchParams).type) ?? "tv";
  return { title: libraryPageName(list, type), robots: { index: false } };
}
