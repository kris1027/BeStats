import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { TrailerButton } from "./trailer-button";

/**
 * covers: spec 0022, AC-11, AC-20
 *
 * Against the real Base UI dialog: no YouTube iframe exists until the
 * visitor presses Trailer, the embed is the privacy enhanced one with the
 * attributes the spec fixes, focus opens on Close (so Escape still reaches
 * the dialog rather than the cross origin player) and returns to the button,
 * and closing removes the player.
 */
function renderButton() {
  render(
    <TrailerButton
      videoKey="dfeUzm6KF4g"
      videoName="Official Trailer"
      title="Fight Club"
    />,
  );
  return screen.getByRole("button", { name: "Trailer" });
}

describe("TrailerButton", () => {
  it("loads nothing from YouTube until it is pressed", () => {
    renderButton();

    expect(document.querySelector("iframe")).toBeNull();
  });

  it("opens the privacy enhanced player from the keyboard, focus on Close", async () => {
    const user = userEvent.setup();
    const trigger = renderButton();

    trigger.focus();
    await user.keyboard("{Enter}");

    const dialog = await screen.findByRole("dialog", {
      name: "Fight Club trailer",
    });
    const iframe = dialog.querySelector("iframe");
    expect(iframe).toHaveAttribute(
      "src",
      "https://www.youtube-nocookie.com/embed/dfeUzm6KF4g?autoplay=1&rel=0&playsinline=1",
    );
    expect(iframe).toHaveAttribute(
      "title",
      "Fight Club: Official Trailer (YouTube video player)",
    );
    expect(iframe).toHaveAttribute(
      "allow",
      "autoplay; encrypted-media; picture-in-picture; fullscreen",
    );
    expect(iframe).toHaveAttribute(
      "referrerpolicy",
      "strict-origin-when-cross-origin",
    );
    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Close" }),
      );
    });
  });

  it("closes on Escape, removes the player and returns focus", async () => {
    const user = userEvent.setup();
    const trigger = renderButton();

    await user.click(trigger);
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(document.querySelector("iframe")).toBeNull();
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });
});
