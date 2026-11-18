import type { Metadata } from "next";

import { CatalogListPage } from "@/components/catalog/catalog-list-page";
import { catalogList } from "@/lib/catalog/lists";
import { catalogListMetadata } from "@/lib/landing-metadata";

const LIST = catalogList("movie", "trending");

/** The list's title, note and canonical (spec 0021, AC-15). */
export async function generateMetadata({
  searchParams,
}: PageProps<"/movies/trending">): Promise<Metadata> {
  return catalogListMetadata(LIST, searchParams);
}

/** Trending movies this week, paged (spec 0021, AC-9). */
export default function TrendingMoviesPage({
  searchParams,
}: PageProps<"/movies/trending">) {
  return <CatalogListPage list={LIST} searchParams={searchParams} />;
}
