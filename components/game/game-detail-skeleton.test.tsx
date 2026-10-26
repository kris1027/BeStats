import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DetailHeroSkeleton } from "@/components/catalog/detail-skeletons";
import { GameDetailSkeleton } from "@/components/game/game-detail-skeleton";

/**
 * covers: spec 0025, AC-9; spec 0031, AC-12
 *
 * A game has no tagline, so its skeleton reserves none. Since spec 0031 most
 * games have art, so it reserves the backdrop and the Overview, as movies do.
 */
const skeletons = (container: HTMLElement) =>
  container.querySelectorAll('[data-slot="skeleton"]');

/** The backdrop band is the one skeleton drawn at a video aspect ratio. */
const backdrop = (container: HTMLElement) =>
  container.querySelector('[data-slot="skeleton"].aspect-video');

describe("GameDetailSkeleton", () => {
  it("tells a screen reader the game is loading", () => {
    render(<GameDetailSkeleton />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading game details",
    );
  });

  it("draws the backdrop band and no tagline line", () => {
    const game = render(<GameDetailSkeleton />).container;
    const hero = game.querySelector(":scope > div > div") as HTMLElement;
    const withBoth = render(<DetailHeroSkeleton metaRows={2} />).container;

    expect(backdrop(game)).not.toBeNull();
    expect(skeletons(hero)).toHaveLength(skeletons(withBoth).length - 1);
  });

  it("hides every placeholder from assistive technology", () => {
    const { container } = render(<GameDetailSkeleton />);

    for (const skeleton of skeletons(container)) {
      expect(skeleton).toHaveAttribute("aria-hidden", "true");
    }
  });
});

describe("DetailHeroSkeleton", () => {
  it("keeps the backdrop and tagline by default, for movies and shows", () => {
    const withBoth = render(<DetailHeroSkeleton />).container;
    const withNeither = render(
      <DetailHeroSkeleton backdrop={false} tagline={false} />,
    ).container;

    expect(backdrop(withBoth)).not.toBeNull();
    expect(skeletons(withNeither)).toHaveLength(skeletons(withBoth).length - 2);
  });
});
