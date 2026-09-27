import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0013, AC-18
 */
vi.mock("@/app/shows/actions", () => ({ setShowStatus: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

const { ShowCardBookmarkButton } = await import("./show-card-bookmark-button");

describe("ShowCardBookmarkButton", () => {
  it("names the Planned removal with Watchlist capitalised, as the watchlist card does (AC-18)", () => {
    render(
      <ShowCardBookmarkButton
        showId={1399}
        name="Game of Thrones"
        planned
        returnPath="/shows"
      />,
    );
    expect(
      screen.getByRole("button", {
        name: "Remove Game of Thrones from Watchlist",
      }),
    ).toBeInTheDocument();
  });

  it("names an unplanned show's bookmark Plan (AC-18)", () => {
    render(
      <ShowCardBookmarkButton
        showId={1399}
        name="Game of Thrones"
        planned={false}
        returnPath="/shows"
      />,
    );
    expect(
      screen.getByRole("button", { name: "Plan Game of Thrones" }),
    ).toBeInTheDocument();
  });
});
