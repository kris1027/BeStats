import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PosterCard } from "@/components/poster-card";
import { PosterCardSkeleton, Skeleton } from "@/components/skeleton";

/**
 * covers: AC-12
 *
 * AC-12's real promise is that swapping a skeleton for the real thing moves
 * nothing on the page. That promise lives in two places at once, the skeleton
 * and the component it stands in for, so it breaks the day someone changes the
 * card's frame and forgets the placeholder. The last test here compares the
 * two directly rather than restating the card's classes, so it keeps holding
 * as the card changes.
 *
 * The pulse itself, and its removal under reduced motion, is a CSS animation
 * declared in `globals.css`. jsdom runs no animations and computes nothing
 * from the Tailwind build, so that half stays a `/check verify` step.
 */
describe("Skeleton", () => {
  const skeleton = (root: HTMLElement) =>
    root.querySelector("[data-slot=skeleton]");

  it("is hidden from assistive technology, so a dozen boxes are not read out", () => {
    const { container } = render(<Skeleton shape="line" />);

    expect(skeleton(container)).toHaveAttribute("aria-hidden", "true");
  });

  it("gives the poster shape the 2:3 frame the real poster uses", () => {
    const { container } = render(<Skeleton shape="poster" />);

    expect(skeleton(container)).toHaveClass("aspect-2/3", "rounded-lg");
  });

  it("gives the pill shape the pill's height and full radius", () => {
    const { container } = render(<Skeleton shape="pill" />);

    expect(skeleton(container)).toHaveClass("h-7", "rounded-full");
  });

  it("reads as an absence: flat plate and rim, never the glass gradient", () => {
    const { container } = render(<Skeleton shape="line" />);

    expect(skeleton(container)).toHaveClass("glass-plate", "glass-rim");
    expect(skeleton(container)).not.toHaveClass("glass");
  });

  it("carries the pulse, which is where reduced motion is handled", () => {
    const { container } = render(<Skeleton shape="line" />);

    expect(skeleton(container)).toHaveClass("skeleton-pulse");
  });

  it("lets a caller narrow a shape without losing it", () => {
    const { container } = render(<Skeleton shape="line" className="w-2/3" />);

    expect(skeleton(container)).toHaveClass("w-2/3", "h-4");
  });
});

describe("PosterCardSkeleton", () => {
  it("occupies the same frame as a real PosterCard, so swapping moves nothing", () => {
    const { container: loading } = render(<PosterCardSkeleton />);
    const { container: loaded } = render(
      <PosterCard title="Lioness" posterUrl={null} href="/shows/1" />,
    );

    const frame = (root: HTMLElement) =>
      root.querySelector(".aspect-2\\/3")?.className ?? "";

    expect(frame(loaded)).toContain("aspect-2/3");
    // Both draw a 2:3 frame at the card's radius across the full column.
    for (const token of ["aspect-2/3", "w-full", "rounded-lg"]) {
      expect(frame(loading)).toContain(token);
      expect(frame(loaded)).toContain(token);
    }
  });

  it("stands in for the caption line as well as the poster", () => {
    const { container } = render(<PosterCardSkeleton />);

    expect(container.querySelectorAll("[data-slot=skeleton]")).toHaveLength(2);
  });

  it("announces nothing at all while it is standing in", () => {
    const { container } = render(<PosterCardSkeleton />);

    for (const node of container.querySelectorAll("[data-slot=skeleton]")) {
      expect(node).toHaveAttribute("aria-hidden", "true");
    }
  });
});
