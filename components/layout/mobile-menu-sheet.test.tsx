import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { MobileMenuSheet } from "@/components/layout/mobile-menu-sheet";

/**
 * The four behaviours AC-15 names, tested against the real Base UI Dialog
 * rather than mocked.
 *
 * These are the tests worth having here: Base UI supplies the behaviour, so
 * the thing that can actually break is the wiring, and the wiring is exactly
 * what a mock would hide. A regression here means a keyboard user is trapped
 * outside an open menu or dumped at the top of the page on close, which is
 * invisible to a type checker and to anyone testing with a mouse.
 */
function Sheet() {
  return (
    <MobileMenuSheet>
      <nav aria-label="Library">
        <a href="/watchlist">Watchlist</a>
        <a href="/watched">Watched</a>
      </nav>
    </MobileMenuSheet>
  );
}

describe("MobileMenuSheet", () => {
  it("opens from the keyboard and moves focus into the sheet", async () => {
    const user = userEvent.setup();
    render(<Sheet />);

    const trigger = screen.getByRole("button", { name: "Open menu" });
    trigger.focus();
    await user.keyboard("{Enter}");

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    await waitFor(() => {
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    });
  });

  it("hides the page behind it while open, and gives it back on close", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Behind the sheet</button>
        <Sheet />
      </>,
    );

    const findBehind = () =>
      screen.queryByRole("button", { name: "Behind the sheet" });

    expect(findBehind()).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open menu" }));
    await screen.findByRole("dialog");

    /*
     * This is the assertion that carries the focus trap, expressed the way
     * jsdom can actually prove it. While the sheet is open the page behind is
     * not in the accessible tree at all, so nothing there can be reached by
     * keyboard or read by a screen reader.
     *
     * Tab containment itself is deliberately not asserted here: jsdom does not
     * implement `inert`'s focus semantics, so a Tab loop would be testing
     * jsdom rather than this component. It was verified in a real browser
     * instead, along with the scroll lock.
     */
    expect(findBehind()).not.toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(findBehind()).toBeInTheDocument());
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    render(<Sheet />);

    const trigger = screen.getByRole("button", { name: "Open menu" });
    await user.click(trigger);
    await screen.findByRole("dialog");

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("closes from its own close button", async () => {
    const user = userEvent.setup();
    render(<Sheet />);

    await user.click(screen.getByRole("button", { name: "Open menu" }));
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: "Close menu" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("names the trigger for assistive technology, since it is icon only", () => {
    render(<Sheet />);
    expect(screen.getByRole("button", { name: "Open menu" })).toBeVisible();
  });
});
