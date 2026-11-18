import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GlassPill } from "@/components/glass-pill";

/**
 * covers: AC-10, AC-5
 *
 * The pill is the one surface in this system that routinely lands on poster
 * artwork, so the opaque plate is owned by the component rather than left to
 * the caller. That ownership is the whole point of AC-5, and it is exactly the
 * kind of thing a later refactor drops without anyone noticing: the text still
 * renders, it is just unreadable over a light poster.
 *
 * These tests assert on the utility class names, which the guide normally
 * warns against. Here the class *is* the behaviour under test: `glass-plate`
 * and `glass-rim-score` are the contract between this component and
 * `globals.css`, and jsdom computes no styles from a Tailwind build, so there
 * is nothing else to look at. The user visible half of the rule (the amber and
 * cyan actually reading against artwork) stays a `/check verify` step.
 */
describe("GlassPill", () => {
  const pill = () => screen.getByText("8.2").closest("[data-slot=glass-pill]");

  it("renders its children", () => {
    render(<GlassPill>8.2</GlassPill>);
    expect(screen.getByText("8.2")).toBeVisible();
  });

  it("carries an opaque plate under the glass, whatever the caller passes", () => {
    render(<GlassPill className="mt-4">8.2</GlassPill>);
    expect(pill()).toHaveClass("glass-plate");
  });

  it("keeps the plate when the caller adds its own classes", () => {
    render(<GlassPill className="absolute top-0">8.2</GlassPill>);

    // A caller class must extend the pill, never displace the plate rule.
    expect(pill()).toHaveClass("glass-plate", "absolute", "top-0");
  });

  it("gives the score tone its own darker plate and the cyan rim", () => {
    render(<GlassPill tone="score">8.2</GlassPill>);

    expect(pill()).toHaveClass("glass-plate-score", "glass-rim-score");
    expect(pill()).not.toHaveClass("glass-plate");
  });

  it("gives the neutral tone the plain rim, never the cyan one", () => {
    render(<GlassPill>8.2</GlassPill>);

    expect(pill()).toHaveClass("glass-rim");
    expect(pill()).not.toHaveClass("glass-rim-score");
  });

  it("is fully rounded, so the rim follows the corner rather than squaring off", () => {
    render(<GlassPill>8.2</GlassPill>);
    expect(pill()).toHaveClass("rounded-full");
  });

  it("renders no icon wrapper when no icon is given", () => {
    const { container } = render(<GlassPill>8.2</GlassPill>);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("renders the icon the caller gives it", () => {
    render(
      <GlassPill icon={<svg role="img" aria-label="star" />}>8.2</GlassPill>,
    );
    expect(screen.getByRole("img", { name: "star" })).toBeInTheDocument();
  });
});
