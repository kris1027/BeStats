import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LibraryErrorBoundary } from "./library-error-boundary";

/**
 * covers: spec 0027, AC-5
 *
 * The section is replaced by a child that throws, the way `LibrarySection`
 * does on a read the tabs do not settle. React logs every caught error, so
 * the console is silenced for the throwing cases.
 */
function Throws(): never {
  throw new Error("library read exploded");
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
      <LibraryErrorBoundary>
        <p>The grid</p>
      </LibraryErrorBoundary>,
    );
    expect(screen.getByText("The grid")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the failed panel with a retry", () => {
    render(
      <LibraryErrorBoundary>
        <Throws />
      </LibraryErrorBoundary>,
    );
    const panel = screen.getByRole("alert");
    expect(panel).toHaveTextContent("Couldn't load your list");
    expect(panel).toHaveTextContent(
      "Your list didn't load. Try again in a moment.",
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  it("never shows the error's own message", () => {
    render(
      <LibraryErrorBoundary>
        <Throws />
      </LibraryErrorBoundary>,
    );
    expect(screen.queryByText(/library read exploded/)).not.toBeInTheDocument();
  });
});
