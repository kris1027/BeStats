import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

/**
 * Proves the jsdom project runs, that its setup file loaded (the
 * `toBeInTheDocument` matcher comes from it), and that the `@/*` alias
 * resolves there too. Spec 0003 requires component tests to be named `.tsx`
 * even without JSX, because `.ts` matches the node project instead.
 */
describe("vitest jsdom project", () => {
  it("renders and resolves the @/* alias", () => {
    render(<div className={cn("a")}>hi</div>);
    expect(screen.getByText("hi")).toBeInTheDocument();
  });
});
