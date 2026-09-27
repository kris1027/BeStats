import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0013, AC-18
 */
const setShowStatus = vi.fn(async (..._args: unknown[]) => ({
  ok: true,
  undo: null,
}));
vi.mock("@/app/shows/actions", () => ({
  setShowStatus: (...args: unknown[]) => setShowStatus(...args),
}));
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

  it.each([
    [true, [1399, null, "want_to_watch"]],
    [false, [1399, "want_to_watch", null]],
  ])(
    "names the status the icon stood for (planned %s), so a stale card cannot overwrite a newer one",
    async (planned, args) => {
      setShowStatus.mockClear();
      const user = userEvent.setup();
      render(
        <ShowCardBookmarkButton
          showId={1399}
          name="Game of Thrones"
          planned={planned}
          returnPath="/shows"
        />,
      );
      await user.click(screen.getByRole("button"));
      expect(setShowStatus).toHaveBeenCalledWith(...args);
    },
  );
});
