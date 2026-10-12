import { CarouselRow } from "@/components/catalog/carousel-row";
import type { CatalogList } from "@/lib/catalog/lists";

/** Posters loaded eagerly on a landing: the first 6 cards of row 0 (AC-7). */
const FIRST_ROW_EAGER = 6;

/**
 * A catalog landing, `/shows` or `/movies` (spec 0021, AC-1): the h1, then one
 * carousel row per list in registry order. The h1 and every row header are
 * prerendered; each row's cards stream on their own.
 */
function CatalogLanding({
  heading,
  lists,
}: {
  heading: string;
  lists: readonly CatalogList[];
}) {
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl leading-tight font-bold tracking-[-0.03em] text-foreground md:text-4xl">
        {heading}
      </h1>
      <div className="flex flex-col gap-10">
        {lists.map((list, index) => (
          <CarouselRow
            key={list.slug}
            list={list}
            eagerCount={index === 0 ? FIRST_ROW_EAGER : 0}
          />
        ))}
      </div>
    </div>
  );
}

export { CatalogLanding };
