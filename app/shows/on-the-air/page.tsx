import type { Metadata } from "next";

import { CatalogListPage } from "@/components/catalog/catalog-list-page";
import { catalogList } from "@/lib/catalog/lists";
import { catalogListMetadata } from "@/lib/landing-metadata";

const LIST = catalogList("tv", "on-the-air");

/** The list's title, note and canonical (spec 0021, AC-15). */
export async function generateMetadata({
  searchParams,
}: PageProps<"/shows/on-the-air">): Promise<Metadata> {
  return catalogListMetadata(LIST, searchParams);
}

/** Shows on the air, paged (spec 0021, AC-9). */
export default function ShowsOnTheAirPage({
  searchParams,
}: PageProps<"/shows/on-the-air">) {
  return <CatalogListPage list={LIST} searchParams={searchParams} />;
}
