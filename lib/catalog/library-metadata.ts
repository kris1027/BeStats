import type { Metadata } from "next";

import {
  defaultLibraryTypeAt,
  type LibraryPath,
  libraryPathName,
} from "./library-list";
import { parseLibraryPageType } from "./media-type";

/**
 * A library page's metadata: its name on the current tab as the title, and
 * never indexed (prompts/library-page-names.md). Reading `searchParams` defers
 * the metadata to request time, which Cache Components allows here because
 * the page's section already streams; the shell stays prerendered. A bad
 * `type`, or a tab with no page at the route, titles the route's default
 * tab, as the heading does (prompts/library-page-urls.md).
 */
export async function libraryPageMetadata(
  path: LibraryPath,
  searchParams: Promise<Record<string, string | string[] | undefined>>,
): Promise<Metadata> {
  const type =
    parseLibraryPageType(path, (await searchParams).type) ??
    defaultLibraryTypeAt(path);
  return { title: libraryPathName(path, type), robots: { index: false } };
}
