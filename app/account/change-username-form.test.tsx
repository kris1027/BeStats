import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ChangeUsernameForm } from "./change-username-form";

vi.mock("./actions", () => ({ changeUsernameAction: vi.fn() }));

/** covers: prompts/account-username.md, R6 (Q13) */
describe("ChangeUsernameForm", () => {
  it("offers an empty field when no username is set", () => {
    render(<ChangeUsernameForm username={null} unlocksAt={null} />);
    expect(screen.getByLabelText("Username")).toHaveValue("");
    expect(screen.getByLabelText("Username")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Save username" })).toBeEnabled();
  });

  it("prefills the current name while unlocked", () => {
    render(<ChangeUsernameForm username="tester_one" unlocksAt={null} />);
    expect(screen.getByLabelText("Username")).toHaveValue("tester_one");
    expect(screen.getByLabelText("Username")).toBeEnabled();
  });

  it("disables the field and says when it unlocks while locked", () => {
    render(
      <ChangeUsernameForm
        username="tester_one"
        unlocksAt="2026-10-18T12:00:00.000Z"
      />,
    );
    expect(screen.getByLabelText("Username")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Save username" }),
    ).toBeDisabled();
    expect(screen.getByText(/You can change it again on/)).toBeInTheDocument();
    expect(document.querySelector("time")).toHaveAttribute(
      "datetime",
      "2026-10-18T12:00:00.000Z",
    );
  });
});
