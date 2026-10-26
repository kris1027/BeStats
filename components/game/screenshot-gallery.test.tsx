import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ScreenshotGallery } from "./screenshot-gallery";

/**
 * covers: spec 0031, AC-6, AC-7, AC-13, AC-15
 *
 * Against the real Base UI dialog: one controlled dialog serves every
 * thumbnail, moves without wrapping, answers the arrow keys and Escape, and
 * returns focus to the thumbnail of the image on screen when it closes. Only
 * that one image is in the dialog.
 */
const URLS = Array.from(
  { length: 4 },
  (_, index) =>
    `https://images.igdb.com/igdb/image/upload/t_1080p/sc${index}.jpg`,
);

function renderGallery(urls = URLS) {
  return render(
    <ScreenshotGallery name="The Witcher 3" screenshotUrls={urls} />,
  );
}

const thumb = (n: number) =>
  screen.getByRole("button", { name: `Open screenshot ${n} of 4` });

async function openAt(n: number) {
  const user = userEvent.setup();
  renderGallery();
  await user.click(thumb(n));
  const dialog = await screen.findByRole("dialog", {
    name: "The Witcher 3 screenshots",
  });
  return { user, dialog };
}

beforeEach(() => {
  // The row's scroller measures itself; jsdom has no ResizeObserver.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

describe("ScreenshotGallery", () => {
  it("renders a labelled, decorative thumbnail per screenshot from IGDB", () => {
    renderGallery();

    expect(
      screen.getByRole("heading", { level: 2, name: "Screenshots" }),
    ).toBeInTheDocument();
    for (const n of [1, 2, 3, 4]) {
      const image = within(thumb(n)).getByRole("presentation", {
        hidden: true,
      });
      expect(image).toHaveAttribute("alt", "");
      expect(image.getAttribute("src")).toContain("images.igdb.com");
      expect(image).toHaveAttribute("loading", "lazy");
    }
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders nothing with no screenshots", () => {
    const { container } = renderGallery([]);

    expect(container).toBeEmptyDOMElement();
  });

  it("opens on the chosen image, focus on Close, with one image mounted", async () => {
    const { dialog } = await openAt(3);

    expect(within(dialog).getByText("3 of 4")).toHaveAttribute(
      "aria-live",
      "polite",
    );
    const images = dialog.querySelectorAll("img");
    expect(images).toHaveLength(1);
    expect(images[0].getAttribute("src")).toContain("sc2");
    await waitFor(() =>
      expect(
        within(dialog).getByRole("button", { name: "Close" }),
      ).toHaveFocus(),
    );
  });

  it("moves with Next and Previous, disabled at the ends, never wrapping", async () => {
    const { user, dialog } = await openAt(1);
    const previous = within(dialog).getByRole("button", {
      name: "Previous screenshot",
    });
    const next = within(dialog).getByRole("button", {
      name: "Next screenshot",
    });

    expect(previous).toBeDisabled();
    await user.click(next);
    await user.click(next);
    await user.click(next);
    expect(within(dialog).getByText("4 of 4")).toBeInTheDocument();
    expect(next).toBeDisabled();
    await user.click(previous);
    expect(within(dialog).getByText("3 of 4")).toBeInTheDocument();
  });

  it("answers the arrow keys, and closes on Escape with focus on the image's thumbnail", async () => {
    const { user, dialog } = await openAt(2);
    await waitFor(() =>
      expect(
        within(dialog).getByRole("button", { name: "Close" }),
      ).toHaveFocus(),
    );

    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}");
    expect(screen.getByText("4 of 4")).toBeInTheDocument();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByText("3 of 4")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(thumb(3)).toHaveFocus();
  });
});
