import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CastRow, CastSection } from "@/components/movie/cast-row";
import type { CastMember } from "@/lib/tmdb";

/** covers: spec 0006, AC-4, AC-6 (the row drawn as a carousel since spec 0022) */
function member(index: number, overrides: Partial<CastMember> = {}) {
  return {
    personId: index,
    creditId: `credit-${index}`,
    name: `Actor ${index}`,
    character: `Role ${index}`,
    profileUrl: `https://image.tmdb.org/t/p/w185/p${index}.jpg`,
    order: index,
    ...overrides,
  };
}

beforeEach(() => {
  // The carousel's scroller measures itself; jsdom has no ResizeObserver.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

describe("CastRow", () => {
  it("shows at most the first 12, in billing order", () => {
    render(<CastRow cast={Array.from({ length: 15 }, (_, i) => member(i))} />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(12);
    expect(items[0]).toHaveTextContent("Actor 0");
    expect(items[11]).toHaveTextContent("Actor 11");
  });

  it("is a carousel: a Cast heading and a labelled region the keyboard can reach", () => {
    render(
      <CastSection>
        <CastRow cast={[member(1)]} />
      </CastSection>,
    );

    expect(screen.getByRole("heading", { name: "Cast" })).toBeVisible();
    // The section is named by its heading; the scroll region inside it is
    // the focusable one, as on every carousel row.
    const region = screen
      .getAllByRole("region", { name: "Cast" })
      .find((element) => element.getAttribute("tabindex") === "0");
    expect(region).toBeDefined();
    expect(region).toContainElement(screen.getByRole("listitem"));
  });

  it("draws each person like a row media card", () => {
    render(<CastRow cast={[member(1)]} />);

    const item = screen.getByRole("listitem");
    expect(item).toHaveClass("w-[140px]", "md:w-[180px]", "snap-start");
    expect(
      screen.getByRole("heading", { level: 3, name: "Actor 1" }),
    ).toBeVisible();
    expect(item.querySelector("img")).toHaveAttribute(
      "sizes",
      "(min-width: 768px) 180px, 140px",
    );
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
    // The name is the caption; with no character there is no second line.
    expect(screen.getByRole("listitem").querySelectorAll("p")).toHaveLength(0);
  });

  it("says so when TMDB lists no cast", () => {
    render(<CastRow cast={[]} />);

    expect(
      screen.getByText("TMDB lists no cast for this movie."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("keeps one card per role when an actor plays several", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <CastRow
        cast={[
          member(1, { creditId: "a", character: "Mandrake" }),
          member(1, { creditId: "b", character: "Muffley", order: 2 }),
        ]}
      />,
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    const messages = error.mock.calls.map((call) => call.join(" "));
    expect(messages.filter((m) => m.includes("same key"))).toEqual([]);
    error.mockRestore();
  });
});
