import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AuthFeedback } from "@/components/auth/auth-feedback";
import { failure, IDLE_STATE, success } from "@/lib/auth/action-state";
import { AUTH_OUTCOME } from "@/lib/auth/messages";

/**
 * covers: spec 0005, AC-21
 *
 * A form level message that is only styled, never announced, leaves someone
 * using a screen reader to submit, hear nothing, and conclude the button is
 * broken. `role="alert"` is what turns the message into something that arrives.
 *
 * The error uses `alert` because it interrupts; the confirmation uses `status`
 * because it should not. Both matter: an assertive announcement for every
 * neutral "a link is on its way" would talk over whatever the person was doing.
 */
describe("AuthFeedback (AC-21)", () => {
  it("renders nothing before anything has been submitted", () => {
    const { container } = render(<AuthFeedback state={IDLE_STATE} />);

    // An empty reserved band would shift the form when a message arrives.
    expect(container).toBeEmptyDOMElement();
  });

  it("announces an error assertively", () => {
    render(<AuthFeedback state={failure(AUTH_OUTCOME.invalidCredentials)} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("announces a confirmation politely", () => {
    render(<AuthFeedback state={success("A link is on its way.")} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "A link is on its way.",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the message from the shared table, not one the caller wrote", () => {
    render(<AuthFeedback state={failure(AUTH_OUTCOME.rateLimited)} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/limit/i);
  });
});
