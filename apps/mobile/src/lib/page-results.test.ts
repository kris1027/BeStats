import { joinPageResults } from "./page-results";

const page = (...ids: number[]) => ({ results: ids.map((id) => ({ id })) });
const ids = (items: { id: number }[]) => items.map((item) => item.id);

describe("joinPageResults", () => {
  it("joins pages in order", () => {
    expect(ids(joinPageResults([page(1, 2), page(3, 4)]))).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it("drops a title a later page repeats, keeping its first place", () => {
    // Movies Trending, seen live on 2026-11-23: a short grid page was filled
    // with the next page's first four titles, which that page showed again.
    expect(
      ids(
        joinPageResults([
          page(1, 2, 3, 70, 71, 72, 73),
          page(70, 71, 72, 73, 74),
        ]),
      ),
    ).toEqual([1, 2, 3, 70, 71, 72, 73, 74]);
  });

  it("drops a repeat inside one page", () => {
    expect(ids(joinPageResults([page(5, 6, 5)]))).toEqual([5, 6]);
  });

  it("is empty with no pages", () => {
    expect(joinPageResults([])).toEqual([]);
  });
});
