import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LibraryErrorBoundary } from "./library-error-boundary";

/**
 * covers: spec 0027, AC-5 (an invalid flag shows the library error boundary)
 *
 * The section is replaced by a child that throws, the way `LibrarySection`
 * does on a bad `NEXT_PUBLIC_GAMES_LIBRARY`. React logs every caught error,
 * so the console is silenced for the throwing cases.
 */
function Throws(): never {
  throw new Error("NEXT_PUBLIC_GAMES_LIBRARY must be on or off");
}

describe("LibraryErrorBoundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders its children when nothing throws", () => {
    render(
      <LibraryErrorBoundary list="watchlist">
        <p>The grid</p>
      </LibraryErrorBoundary>,
    );
    expect(screen.getByText("The grid")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each([
    ["watchlist", "Couldn't load your watchlist"],
    ["upcoming", "Couldn't load your upcoming titles"],
    ["watched", "Couldn't load your watched titles"],
  ] as const)("shows the %s failed panel with a retry", (list, title) => {
    render(
      <LibraryErrorBoundary list={list}>
        <Throws />
      </LibraryErrorBoundary>,
    );
    const panel = screen.getByRole("alert");
    expect(panel).toHaveTextContent(title);
    expect(panel).toHaveTextContent(
      "Your list didn't load. Try again in a moment.",
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  it("never shows the error's own message", () => {
    render(
      <LibraryErrorBoundary list="watchlist">
        <Throws />
      </LibraryErrorBoundary>,
    );
    expect(
      screen.queryByText(/NEXT_PUBLIC_GAMES_LIBRARY/),
    ).not.toBeInTheDocument();
  });
});
