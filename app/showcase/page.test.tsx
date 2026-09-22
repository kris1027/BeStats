import { afterEach, describe, expect, it, vi } from "vitest";

import ShowcasePage from "@/app/showcase/page";

/**
 * covers: AC-19
 *
 * The showcase is a development only route, guarded by a single line at the
 * top of the component. If that line is dropped or inverted, the route ships:
 * an internal design page, indexed and public, with no feature owning it. The
 * failure is silent in development, because development is the mode where the
 * page is supposed to render.
 *
 * The guard is exercised by calling the component as a function rather than
 * rendering it. `notFound()` throws before any JSX is built, so the whole
 * showcase tree never has to be mounted to prove the decision it makes. What a
 * production *build* then does with that 404 is a `/check verify` curl step.
 */
const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  }),
);

vi.mock("next/navigation", () => ({ notFound }));

afterEach(() => {
  vi.unstubAllEnvs();
  notFound.mockClear();
});

describe("ShowcasePage", () => {
  it("404s in production rather than shipping the design system page", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(() => ShowcasePage()).toThrow(/404/);
    expect(notFound).toHaveBeenCalledOnce();
  });

  it("renders in development, where it is the drift detector", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(() => ShowcasePage()).not.toThrow();
    expect(notFound).not.toHaveBeenCalled();
  });

  it("renders under test too, so the suite can reach the primitives", () => {
    vi.stubEnv("NODE_ENV", "test");

    expect(() => ShowcasePage()).not.toThrow();
    expect(notFound).not.toHaveBeenCalled();
  });

  it("keeps itself out of search results even where it does render", async () => {
    const { metadata } = await import("@/app/showcase/page");

    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
