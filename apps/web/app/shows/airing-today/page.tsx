import type { Metadata } from "next";

import { CatalogListPage } from "@/components/catalog/catalog-list-page";
import { catalogList } from "@/lib/catalog/lists";
import { catalogListMetadata } from "@/lib/landing-metadata";

const LIST = catalogList("tv", "airing-today");

/** The list's title, note and canonical (spec 0021, AC-15). */
export async function generateMetadata({
  searchParams,
}: PageProps<"/shows/airing-today">): Promise<Metadata> {
  return catalogListMetadata(LIST, searchParams);
}

/** Shows airing today, paged (spec 0021, AC-9). */
export default function ShowsAiringTodayPage({
  searchParams,
}: PageProps<"/shows/airing-today">) {
  return <CatalogListPage list={LIST} searchParams={searchParams} />;
}
