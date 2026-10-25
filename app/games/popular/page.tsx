import type { Metadata } from "next";

import { CatalogListPage } from "@/components/catalog/catalog-list-page";
import { catalogList } from "@/lib/catalog/lists";
import { gameListMetadata } from "@/lib/landing-metadata";

const LIST = catalogList("game", "popular");

/** The list's title and note, `noindex` until G10 (spec 0028, AC-13). */
export const metadata: Metadata = gameListMetadata(LIST);

/** One games list, paged by 24 (spec 0028, AC-9). */
export default function PopularGamesPage({
  searchParams,
}: PageProps<"/games/popular">) {
  return <CatalogListPage list={LIST} searchParams={searchParams} />;
}
