import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { QuickSearchResponse } from "@/lib/search/quick";

import { QuickSearch } from "./quick-search";

/**
 * covers: spec 0010, AC-2 to AC-5
 *
 * Driven against the real Base UI Autocomplete and a scripted `fetch`, so what
 * is tested is the wiring: the debounce, the race guard, the three panel
 * states and the keys this component adds to the combobox.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

function body(total: number, titles: string[]): QuickSearchResponse {
  return {
    totalResults: total,
    results: titles.map((title, index) => ({
      id: index + 1,
      title,
      year: index === 0 ? null : 2000 + index,
      posterUrl: null,
      tmdbRating: index === 0 ? null : 7.25,
      href: `/shows/${index + 1}`,
    })),
  };
}

type Script = (query: string) => Promise<Response>;
let script: Script;
const fetchMock = vi.fn((input: string, init?: RequestInit) => {
  const query = new URL(input, "http://localhost").searchParams.get("q") ?? "";
  return new Promise<Response>((resolve, reject) => {
    init?.signal?.addEventListener("abort", () =>
      reject(new DOMException("aborted", "AbortError")),
    );
    script(query).then(resolve, reject);
  });
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status });
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  script = async (query) => json(body(95, [`${query} one`, `${query} two`]));
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockClear();
  push.mockClear();
});

describe("QuickSearch", () => {
  it("is a combobox named for the catalog it searches", () => {
    render(<QuickSearch type="movie" />);
    expect(screen.getByRole("combobox")).toHaveAttribute(
      "placeholder",
      "Search movies",
    );
  });

  it("waits for two characters and a pause, then lists rows with TMDB's count", async () => {
    const user = userEvent.setup();
    render(<QuickSearch type="tv" />);

    await user.type(screen.getByRole("combobox"), "d");
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(fetchMock).not.toHaveBeenCalled();

    await user.type(screen.getByRole("combobox"), "une");

    expect(await screen.findByText("95 shows")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/search?type=tv&q=dune");
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    // No year and no rating render nothing, never a placeholder.
    expect(options[0]).toHaveTextContent(/^dune one$/);
    expect(options[1]).toHaveTextContent("2001");
    expect(options[1]).toHaveTextContent("7.3");
    expect(screen.getByRole("link", { name: "See all" })).toHaveAttribute(
      "href",
      "/search?type=tv&q=dune",
    );
    expect(screen.getByRole("combobox")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("never shows an older query's answer after a newer one", async () => {
    const user = userEvent.setup();
    let releaseSlow: () => void = () => {};
    script = (query) =>
      query === "du"
        ? new Promise((resolve) => {
            releaseSlow = () => resolve(json(body(3, ["du stale"])));
          })
        : Promise.resolve(json(body(95, ["dune fresh"])));
    render(<QuickSearch type="tv" />);

    await user.type(screen.getByRole("combobox"), "du");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await user.type(screen.getByRole("combobox"), "ne");
    expect(await screen.findByText("dune fresh")).toBeInTheDocument();

    releaseSlow();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText("du stale")).not.toBeInTheDocument();
  });

  it("says when nothing matches, with no count and no See all", async () => {
    const user = userEvent.setup();
    script = async () => json(body(0, []));
    render(<QuickSearch type="movie" />);

    await user.type(screen.getByRole("combobox"), "zzqq");

    expect(
      await screen.findByText("No movies match “zzqq”"),
    ).toBeInTheDocument();
    expect(screen.queryByText("See all")).not.toBeInTheDocument();
  });

  it("offers Try again when TMDB fails, and keeps See all", async () => {
    const user = userEvent.setup();
    script = async () => json({ error: "upstream", kind: "timeout" }, 502);
    render(<QuickSearch type="tv" />);

    await user.type(screen.getByRole("combobox"), "dune");

    expect(await screen.findByText("Couldn't reach TMDB")).toBeInTheDocument();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText("See all")).toBeInTheDocument();

    script = async () => json(body(95, ["dune back"]));
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("dune back")).toBeInTheDocument();
    expect(fetchMock.mock.calls.at(-1)?.[1]?.cache).toBe("no-store");
  });

  it("opens the active row on Enter", async () => {
    const user = userEvent.setup();
    render(<QuickSearch type="tv" />);

    await user.type(screen.getByRole("combobox"), "dune");
    await screen.findByText("95 shows");
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(screen.getByRole("combobox")).toHaveAttribute(
      "aria-activedescendant",
      screen.getAllByRole("option")[1].id,
    );
    await user.keyboard("{Enter}");

    expect(push).toHaveBeenCalledWith("/shows/2");
    expect(screen.getByRole("combobox")).toHaveValue("");
  });

  it("opens the results page on Enter with no active row", async () => {
    const user = userEvent.setup();
    render(<QuickSearch type="movie" />);

    await user.type(screen.getByRole("combobox"), " dune {Enter}");

    expect(push).toHaveBeenCalledWith("/search?type=movie&q=dune");
  });

  it("closes on the first Escape and clears on the second", async () => {
    const user = userEvent.setup();
    render(<QuickSearch type="tv" />);
    const field = screen.getByRole("combobox");

    await user.type(field, "dune");
    await screen.findByText("95 shows");
    await user.keyboard("{Escape}");
    expect(field).toHaveAttribute("aria-expanded", "false");
    expect(field).toHaveValue("dune");

    await user.keyboard("{Escape}");
    expect(field).toHaveValue("");
  });

  it("clears and closes from the clear button", async () => {
    const user = userEvent.setup();
    render(<QuickSearch type="tv" />);

    await user.type(screen.getByRole("combobox"), "dune");
    await screen.findByText("95 shows");
    // Base UI hides the clear button from assistive technology and the tab
    // order: it is a pointer shortcut, and Escape is the keyboard's.
    const clear = document.querySelector('[aria-label="Clear search"]');
    if (!clear) throw new Error("no clear button");
    await user.click(clear);

    expect(screen.getByRole("combobox")).toHaveValue("");
    expect(screen.queryByText("95 shows")).not.toBeInTheDocument();
  });
});
