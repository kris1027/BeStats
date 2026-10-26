import { createElement, Fragment, type ReactElement, Suspense } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GameDetailSkeleton } from "@/components/game/game-detail-skeleton";
import { GameFacts } from "@/components/game/game-facts";
import { GameHero } from "@/components/game/game-hero";
import { GameMoreLikeThisSection } from "@/components/game/game-more-like-this";
import { GameOverview } from "@/components/game/game-overview";
import { ScreenshotGallery } from "@/components/game/screenshot-gallery";
import { GameTrackingSlot } from "@/components/tracking/game-tracking-slot";

/**
 * covers: spec 0025, AC-1, AC-6, AC-7, AC-8, AC-9, AC-10; spec 0031, AC-1,
 * AC-11
 *
 * Until G10 every game page outcome is `noindex`, with no canonical or share
 * card. `loadGame` is replaced, so the metadata and the streamed body branch
 * on the same fake result, and `notFound` throws a marker the tests catch.
 */
const loadGame = vi.fn();

vi.mock("./load-game", () => ({
  loadGame: (id: number) => loadGame(id),
}));

const NOT_FOUND = new Error("notFound()");

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw NOT_FOUND;
  },
}));

const { default: GamePage, generateMetadata } = await import("./page");

const GAME = {
  name: "The Witcher 3: Wild Hunt",
  releaseYear: 2015,
  summary: "RPG and sequel to The Witcher 2 (2011).",
};

function metadataFor(id: string) {
  return generateMetadata({
    params: Promise.resolve({ id }),
  } as Parameters<typeof generateMetadata>[0]);
}

type Element = ReactElement<Record<string, unknown>>;

function shellFor(id: string) {
  return GamePage({
    params: Promise.resolve({ id }),
  } as Parameters<typeof GamePage>[0]) as Element;
}

/** Runs the async body the shell streams inside its Suspense boundary. */
async function bodyFor(id: string) {
  const detail = shellFor(id).props.children as Element;
  const render = detail.type as (props: unknown) => Promise<Element>;
  return render(detail.props);
}

afterEach(() => loadGame.mockReset());

describe("a found game's metadata (AC-10)", () => {
  it("is the name and year, the summary, and noindex with nothing else", async () => {
    loadGame.mockResolvedValue({ kind: "found", game: GAME });

    expect(await metadataFor("1942")).toEqual({
      title: "The Witcher 3: Wild Hunt (2015)",
      description: "RPG and sequel to The Witcher 2 (2011).",
      robots: { index: false },
    });
    expect(loadGame).toHaveBeenCalledWith(1942);
  });

  it("leaves the year and description out when IGDB has none", async () => {
    loadGame.mockResolvedValue({
      kind: "found",
      game: { ...GAME, releaseYear: null, summary: null },
    });

    const metadata = await metadataFor("1942");

    expect(metadata.title).toBe("The Witcher 3: Wild Hunt");
    expect(metadata.description).toBeUndefined();
  });

  it("cuts a long summary at a word, within 160 characters", async () => {
    loadGame.mockResolvedValue({
      kind: "found",
      game: { ...GAME, summary: "word ".repeat(60) },
    });

    const metadata = await metadataFor("1942");

    expect(metadata.description?.length).toBeLessThanOrEqual(160);
  });
});

describe("a game page with nothing to show (AC-7, AC-8)", () => {
  it.each([
    ["not found", { kind: "not_found" }, "Game not found"],
    ["a failed IGDB read", { kind: "failed" }, "Game"],
  ])("is noindex for %s", async (_, result, title) => {
    loadGame.mockResolvedValue(result);

    expect(await metadataFor("1942")).toEqual({
      title,
      robots: { index: false },
    });
  });

  it("is noindex for a malformed id without asking IGDB (AC-6)", async () => {
    expect(await metadataFor("abc")).toEqual({
      title: "Game not found",
      robots: { index: false },
    });
    expect(loadGame).not.toHaveBeenCalled();
  });
});

describe("the page shell (AC-9)", () => {
  it("is only a Suspense boundary over the game skeleton, with no IGDB read", () => {
    const shell = shellFor("1942");

    expect(shell.type).toBe(Suspense);
    expect((shell.props.fallback as Element).type).toBe(GameDetailSkeleton);
    expect(loadGame).not.toHaveBeenCalled();
  });
});

describe("the streamed body", () => {
  const FOUND = {
    ...GAME,
    id: 1942,
    hidden: false,
    coverUrl:
      "https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co1wyy.jpg",
    releaseDate: "2015-05-19",
    gameType: "main_game",
    genres: [{ id: 12, name: "Role-playing (RPG)" }],
    platforms: [{ id: 6, name: "PC (Microsoft Windows)" }],
    communityRating: 9.3,
    communityRatingCount: 5501,
    storyline: null,
    artUrl: "https://images.igdb.com/igdb/image/upload/t_1080p/ar1.jpg",
    screenshotUrls: [],
    trailer: { key: "dQw4w9WgXcQ", name: "Launch Trailer" },
    similarGameIds: [1887],
    developers: ["CD Projekt RED"],
    publishers: [],
    gameModes: [],
    playerPerspectives: [],
    themes: [],
    franchises: [],
    series: [],
    gameEngines: [],
    platformReleases: [],
  };

  /** The article's children: the hero first, then the sections in order. */
  const sectionsOf = (article: Element) => article.props.children as Element[];

  it("hands the found game's facts to the hero and nothing it does not show (AC-1)", async () => {
    loadGame.mockResolvedValue({ kind: "found", game: FOUND });

    const article = await bodyFor("1942");
    const hero = sectionsOf(article)[0];

    expect(loadGame).toHaveBeenCalledWith(1942);
    expect(hero.type).toBe(GameHero);
    const { tracking, ...facts } = hero.props as { tracking: Element };
    expect(facts).toEqual({
      name: FOUND.name,
      coverUrl: FOUND.coverUrl,
      releaseDate: FOUND.releaseDate,
      gameType: FOUND.gameType,
      genres: FOUND.genres,
      platforms: FOUND.platforms,
      communityRating: FOUND.communityRating,
      communityRatingCount: FOUND.communityRatingCount,
      artUrl: FOUND.artUrl,
      trailer: FOUND.trailer,
    });
  });

  it("orders the sections under the hero as spec 0031 lists them (AC-1)", async () => {
    loadGame.mockResolvedValue({ kind: "found", game: FOUND });

    const types = sectionsOf(await bodyFor("1942")).map((child) => child.type);

    expect(types).toEqual([
      GameHero,
      GameOverview,
      ScreenshotGallery,
      GameMoreLikeThisSection,
      GameFacts,
    ]);
  });

  it("renders the hero alone for a game IGDB has nothing more on (AC-1, AC-11)", async () => {
    const BARE = {
      ...FOUND,
      summary: null,
      artUrl: null,
      trailer: null,
      similarGameIds: [],
      developers: [],
    };
    loadGame.mockResolvedValue({ kind: "found", game: BARE });

    const [hero, ...sections] = sectionsOf(await bodyFor("94975"));

    expect(hero.props).toMatchObject({ artUrl: null, trailer: null });
    expect(
      renderToStaticMarkup(createElement(Fragment, null, ...sections)),
    ).toBe("");
  });

  it("puts the status control in the hero's tracking slot, in its own null fallback boundary (spec 0026, AC-1)", async () => {
    loadGame.mockResolvedValue({ kind: "found", game: FOUND });

    const article = await bodyFor("1942");
    const hero = sectionsOf(article)[0];
    const tracking = hero.props.tracking as Element;
    const slot = tracking.props.children as Element;

    expect(tracking.type).toBe(Suspense);
    expect(tracking.props.fallback).toBeNull();
    expect(slot.type).toBe(GameTrackingSlot);
    expect(slot.props).toEqual({
      gameId: 1942,
      name: FOUND.name,
      releaseDate: FOUND.releaseDate,
    });
  });

  it("calls notFound for a game IGDB does not know or hides (AC-7)", async () => {
    loadGame.mockResolvedValue({ kind: "not_found" });

    await expect(bodyFor("12503")).rejects.toBe(NOT_FOUND);
  });

  it("calls notFound for a malformed id without asking IGDB (AC-6)", async () => {
    await expect(bodyFor("0550")).rejects.toBe(NOT_FOUND);
    expect(loadGame).not.toHaveBeenCalled();
  });

  it("shows the retry panel pointing back at the same game when IGDB fails (AC-8)", async () => {
    loadGame.mockResolvedValue({ kind: "failed" });

    const html = renderToStaticMarkup(await bodyFor("1942"));

    expect(html).toContain("Couldn&#x27;t reach IGDB");
    expect(html).toContain("IGDB didn&#x27;t respond. Try again in a moment.");
    expect(html).toMatch(/<a href="\/games\/1942"[^>]*>Try again<\/a>/);
  });
});
