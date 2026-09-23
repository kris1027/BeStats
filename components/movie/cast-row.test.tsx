import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CastRow } from "@/components/movie/cast-row";
import type { CastMember } from "@/lib/tmdb";

/** covers: spec 0006, AC-4, AC-6 */
function member(index: number, overrides: Partial<CastMember> = {}) {
  return {
    personId: index,
    name: `Actor ${index}`,
    character: `Role ${index}`,
    profileUrl: `https://image.tmdb.org/t/p/w185/p${index}.jpg`,
    order: index,
    ...overrides,
  };
}

describe("CastRow", () => {
  it("shows at most the first 12, in billing order", () => {
    render(<CastRow cast={Array.from({ length: 15 }, (_, i) => member(i))} />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(12);
    expect(items[0]).toHaveTextContent("Actor 0");
    expect(items[11]).toHaveTextContent("Actor 11");
  });

  it("is a labelled region the keyboard can reach", () => {
    render(<CastRow cast={[member(1)]} />);

    const region = screen.getByRole("region", { name: "Cast" });
    expect(region).toHaveAttribute("tabindex", "0");
  });

  it("has no links, because there is no person page", () => {
    render(<CastRow cast={[member(1), member(2)]} />);

    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("falls back to a person tile and leaves out an empty character", () => {
    const { container } = render(
      <CastRow cast={[member(1, { profileUrl: null, character: "" })]} />,
    );

    expect(
      container.querySelector('[data-slot="profile-fallback"]'),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(screen.getByRole("listitem").querySelectorAll("p")).toHaveLength(1);
  });

  it("says so when TMDB lists no cast", () => {
    render(<CastRow cast={[]} />);

    expect(
      screen.getByText("TMDB lists no cast for this movie."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region")).toBeNull();
  });
});
