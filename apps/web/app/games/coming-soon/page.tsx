import type { Metadata } from "next";

import { CatalogListPage } from "@/components/catalog/catalog-list-page";
import { catalogList } from "@/lib/catalog/lists";
import { catalogListMetadata } from "@/lib/landing-metadata";

const LIST = catalogList("game", "coming-soon");

/** The list's title, note and canonical (spec 0032, AC-5). */
export async function generateMetadata({
  searchParams,
}: PageProps<"/games/coming-soon">): Promise<Metadata> {
  return catalogListMetadata(LIST, searchParams);
}

/** One games list, paged by 24 (spec 0028, AC-9). */
export default function ComingSoonGamesPage({
  searchParams,
}: PageProps<"/games/coming-soon">) {
  return <CatalogListPage list={LIST} searchParams={searchParams} />;
}
