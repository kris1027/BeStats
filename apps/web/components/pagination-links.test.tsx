import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PaginationLinks } from "@/components/pagination-links";

/** covers: spec 0006, AC-2 */
const href = (page: number) =>
  page === 1 ? "/movies" : `/movies?page=${page}`;

describe("PaginationLinks", () => {
  it("has no Previous link on the first page", () => {
    render(<PaginationLinks page={1} lastPage={500} href={href} />);

    expect(screen.queryByRole("link", { name: /previous/i })).toBeNull();
    expect(screen.getByRole("link", { name: /next/i })).toHaveAttribute(
      "href",
      "/movies?page=2",
    );
    expect(screen.getByText("Page 1 of 500")).toBeInTheDocument();
  });

  it("links page 2 back to the bare path", () => {
    render(<PaginationLinks page={2} lastPage={500} href={href} />);

    expect(screen.getByRole("link", { name: /previous/i })).toHaveAttribute(
      "href",
      "/movies",
    );
  });

  it("has no Next link on the last page", () => {
    render(<PaginationLinks page={500} lastPage={500} href={href} />);

    expect(screen.queryByRole("link", { name: /next/i })).toBeNull();
    expect(screen.getByRole("link", { name: /previous/i })).toHaveAttribute(
      "href",
      "/movies?page=499",
    );
  });

  it("keeps the 44px touch target on mobile", () => {
    render(<PaginationLinks page={2} lastPage={3} href={href} />);

    for (const link of screen.getAllByRole("link")) {
      expect(link.className).toContain("h-11");
    }
  });
});
