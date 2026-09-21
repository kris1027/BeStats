import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StatePanel } from "@/components/state-panel";

/**
 * The guarantee AC-11 is really making: a user is never shown a failure with no
 * way out of it.
 *
 * The type system already refuses an `error` or `signed-out` panel with no
 * action, but a type error disappears the moment someone reaches for `as any`
 * or builds the props dynamically, and this is a rule about what people see,
 * not about what compiles. So it is enforced at runtime too, and tested here.
 */
describe("StatePanel", () => {
  it("renders the empty variant with no action at all", () => {
    render(
      <StatePanel
        variant="empty"
        title="Nothing here yet"
        description="Your watchlist is empty."
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Nothing here yet" }),
    ).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("announces the error variant as an alert", () => {
    render(
      <StatePanel
        variant="error"
        title="Something went wrong"
        description="We could not reach TMDB."
        action={<button type="button">Try again</button>}
      />,
    );

    expect(screen.getByRole("alert")).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  it("does not announce the empty or signed out variants as alerts", () => {
    render(
      <StatePanel
        variant="signed-out"
        title="Sign in to track this"
        description="Your lists are private."
        action={<a href="/sign-in">Sign in</a>}
      />,
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toBeVisible();
  });

  it.each(["error", "signed-out"] as const)(
    "refuses to render the %s variant without a way forward",
    (variant) => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      expect(() =>
        render(
          // @ts-expect-error the missing action is the point: the type system
          // rejects this too, and this test proves the runtime does as well.
          <StatePanel
            variant={variant}
            title="Gone wrong"
            description="Bad."
          />,
        ),
      ).toThrow(/always needs an action/);

      consoleError.mockRestore();
    },
  );
});
