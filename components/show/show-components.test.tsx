import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DetailHero } from "@/components/catalog/detail-hero";
import { EpisodeList } from "@/components/show/episode-list";
import { EpisodeRow } from "@/components/show/episode-row";
import { SeasonGrid } from "@/components/show/season-grid";
import { SeasonHeader } from "@/components/show/season-header";
import { SeasonNav } from "@/components/show/season-nav";
import { ShowMeta } from "@/components/show/show-meta";
import type { Episode, SeasonSummary } from "@/lib/tmdb";

/**
 * covers: spec 0009, AC-3 to AC-5, AC-7, AC-9, AC-10, AC-12, AC-18, AC-19
 *
 * Every fallback on the TV pages is asserted: absent means absent or stated,
 * never a zero or a stand in, and no tracking control renders yet.
 */

const POSTER = "https://image.tmdb.org/t/p/w500/poster.jpg";

describe("the show hero", () => {
  function renderHero(meta: React.ReactNode) {
    return render(
      <DetailHero
        title="Breaking Bad"
        tagline="Change the equation."
        posterUrl={POSTER}
        backdropUrl="https://image.tmdb.org/t/p/w1280/backdrop.jpg"
        meta={meta}
        tmdbRating={8.9}
        tmdbVoteCount={16000}
      />,
    );
  }

  it("shows the air span, the status pill and the genres on their own row", () => {
    const { container } = renderHero(
      <ShowMeta
        airSpan="2008–2013"
        status="Ended"
        genres={[{ id: 18, name: "Drama" }]}
      />,
    );

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const status = container.querySelector('[data-slot="show-status"]');
    expect(status).toHaveTextContent("Ended");
    expect(status?.parentElement).toHaveTextContent("2008–2013");
    const genres = screen.getByRole("list", { name: "Genres" });
    expect(genres).toHaveTextContent("Drama");
    expect(genres).not.toContainElement(status as HTMLElement);
    expect(
      container.querySelector('[data-slot="tmdb-rating"]'),
    ).toHaveTextContent("TMDB");
  });

  it("leaves out a missing span, status and genres entirely", () => {
    const { container } = render(
      <ShowMeta airSpan={null} status="" genres={[]} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders no tracking control (feature 14 adds it)", () => {
    renderHero(<ShowMeta airSpan="2008" status="Ended" genres={[]} />);

    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByText(/watchlist|watching|your score/i)).toBeNull();
  });
});

const season = (overrides: Partial<SeasonSummary>): SeasonSummary => ({
  seasonNumber: 1,
  name: "Season 1",
  episodeCount: 7,
  airDate: "2008-01-20",
  posterUrl: POSTER,
  isSpecials: false,
  ...overrides,
});

describe("SeasonGrid", () => {
  it("links each season card with its year and episode count", () => {
    render(
      <SeasonGrid
        showId={1396}
        showName="Breaking Bad"
        showPosterUrl={null}
        seasons={[
          season({}),
          season({ seasonNumber: 0, name: "Specials", episodeCount: 1 }),
        ]}
      />,
    );

    const cards = screen.getAllByRole("listitem");
    expect(cards).toHaveLength(2);
    expect(
      within(cards[0]).getByRole("link", { name: "Season 1" }),
    ).toHaveAttribute("href", "/shows/1396/season/1");
    expect(cards[0]).toHaveTextContent("2008 · 7 episodes");
    expect(within(cards[1]).getByRole("link")).toHaveAttribute(
      "href",
      "/shows/1396/season/0",
    );
    expect(cards[1]).toHaveTextContent("1 episode");
  });

  it("borrows the show poster, then falls back to the tile", () => {
    const { container, rerender } = render(
      <SeasonGrid
        showId={1}
        showName="x"
        showPosterUrl={POSTER}
        seasons={[season({ posterUrl: null })]}
      />,
    );
    expect(container.querySelectorAll("img")).toHaveLength(1);

    rerender(
      <SeasonGrid
        showId={1}
        showName="x"
        showPosterUrl={null}
        seasons={[season({ posterUrl: null })]}
      />,
    );
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(
      container.querySelector('[data-slot="poster-fallback"]'),
    ).toBeInTheDocument();
  });

  it("shows a season with no episodes and no date, and says so", () => {
    render(
      <SeasonGrid
        showId={1}
        showName="x"
        showPosterUrl={null}
        seasons={[season({ episodeCount: 0, airDate: null })]}
      />,
    );

    const card = screen.getByRole("listitem");
    expect(card).toHaveTextContent("No episodes listed yet");
    expect(card).not.toHaveTextContent("·");
    expect(card).not.toHaveTextContent(/\b0\b/);
  });

  it("states a show with no seasons", () => {
    render(
      <SeasonGrid showId={1} showName="x" showPosterUrl={null} seasons={[]} />,
    );

    expect(
      screen.getByText("TMDB lists no seasons for this show yet."),
    ).toBeInTheDocument();
  });
});

describe("SeasonHeader", () => {
  it("links back to the show and titles the page with the season", () => {
    render(
      <SeasonHeader
        showId={1396}
        showName="Breaking Bad"
        seasonName="Season 2"
        posterUrl={POSTER}
        airDate="2009-03-08"
        episodeCount={13}
        overview="Walt and Jesse..."
      />,
    );

    expect(screen.getByRole("link", { name: "Breaking Bad" })).toHaveAttribute(
      "href",
      "/shows/1396",
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Season 2",
    );
    expect(screen.getByText("2009")).toBeInTheDocument();
    expect(screen.getByText("13 episodes")).toBeInTheDocument();
    expect(screen.getByText("Walt and Jesse...")).toBeInTheDocument();
    for (const image of document.querySelectorAll("img")) {
      expect(image).toHaveAttribute("alt", "");
    }
  });

  it("leaves out a missing year, overview and poster", () => {
    const { container } = render(
      <SeasonHeader
        showId={1}
        showName="x"
        seasonName="Season 1"
        posterUrl={null}
        airDate={null}
        episodeCount={3}
        overview={null}
      />,
    );

    expect(
      container.querySelector('[data-slot="poster-fallback"]'),
    ).toBeInTheDocument();
    expect(screen.getByText("3 episodes").closest("p")).toHaveTextContent(
      /^3 episodes$/,
    );
  });
});

const episode = (overrides: Partial<Episode>): Episode => ({
  id: 1,
  showId: 1396,
  seasonNumber: 2,
  episodeNumber: 1,
  name: "Seven Thirty-Seven",
  overview: "Walt and Jesse realize how dire their situation is.",
  airDate: "2009-03-08",
  stillUrl: "https://image.tmdb.org/t/p/w300/still.jpg",
  runtimeMinutes: 47,
  tmdbRating: 8.3,
  ...overrides,
});

describe("EpisodeRow", () => {
  it("shows every fact TMDB has", () => {
    const { container } = render(<EpisodeRow episode={episode({})} />);

    expect(screen.getByText("Episode 1")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Seven Thirty-Seven",
    );
    expect(screen.getByText(/Mar 8, 2009/)).toHaveTextContent(
      "Mar 8, 2009·47m",
    );
    const rating = container.querySelector('[data-slot="tmdb-rating"]');
    expect(rating).toHaveTextContent("8.3");
    expect(rating).toHaveTextContent("TMDB");
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
  });

  it("states or leaves out every missing value", () => {
    const { container } = render(
      <EpisodeRow
        episode={episode({
          episodeNumber: 4,
          name: null,
          overview: null,
          airDate: null,
          stillUrl: null,
          runtimeMinutes: null,
          tmdbRating: null,
        })}
      />,
    );

    // The number becomes the heading, with no second label.
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Episode 4",
    );
    expect(screen.getAllByText("Episode 4")).toHaveLength(1);
    expect(screen.getByText("Air date not announced")).toBeInTheDocument();
    expect(container).not.toHaveTextContent("·");
    expect(container.querySelector('[data-slot="tmdb-rating"]')).toBeNull();
    expect(container).not.toHaveTextContent(/\b0\b/);
    expect(
      container.querySelector('[data-slot="still-fallback"]'),
    ).toBeInTheDocument();
  });

  it("never labels an episode upcoming or aired, and has no controls", () => {
    render(<EpisodeRow episode={episode({ airDate: "2099-01-01" })} />);

    expect(screen.queryByText(/upcoming|aired|watched/i)).toBeNull();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

describe("EpisodeList", () => {
  it("lists every episode in number order, the first two stills eager", () => {
    const { container } = render(
      <EpisodeList
        seasonName="Season 2"
        episodes={[3, 1, 2].map((n) =>
          episode({ id: n, episodeNumber: n, name: `E${n}` }),
        )}
      />,
    );

    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);
    expect(headings).toEqual(["E1", "E2", "E3"]);
    const loading = [...container.querySelectorAll("img")].map((img) =>
      img.getAttribute("loading"),
    );
    expect(loading).toEqual(["eager", "eager", "lazy"]);
  });
});

describe("SeasonNav", () => {
  it("links both neighbours by name", () => {
    render(
      <SeasonNav
        showId={1396}
        previous={{ seasonNumber: 1, name: "Season 1" }}
        next={{ seasonNumber: 3, name: "Season 3" }}
      />,
    );

    expect(
      screen.getByRole("link", { name: /Previous season: ?Season 1/ }),
    ).toHaveAttribute("href", "/shows/1396/season/1");
    expect(
      screen.getByRole("link", { name: /Next season: ?Season 3/ }),
    ).toHaveAttribute("href", "/shows/1396/season/3");
  });

  it("drops the link at each end", () => {
    render(
      <SeasonNav
        showId={1396}
        previous={{ seasonNumber: 5, name: "Season 5" }}
        next={null}
      />,
    );

    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByRole("link", { name: /next season/i })).toBeNull();
  });

  it("renders nothing for a show with one season", () => {
    const { container } = render(
      <SeasonNav showId={1} previous={null} next={null} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
