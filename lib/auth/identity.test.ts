import { describe, expect, it } from "vitest";

import {
  avatarLetter,
  displayName,
  hasPasswordIdentity,
  isRecoverySession,
} from "./identity";

/**
 * covers: spec 0005, AC-13, AC-16
 *
 * Both values the navbar shows are derived from the address at render time and
 * never stored, which is why this feature adds no `profiles` table: nothing
 * derived can go stale if nothing derived is kept. What that trades away is any
 * guarantee about the input's shape, so the odd cases are pinned down here.
 */
describe("the navbar's derived identity (AC-13)", () => {
  it.each([
    ["kris1027@gmail.com", "kris1027", "K"],
    ["a@example.com", "a", "A"],
    ["Firstname.Lastname@example.com", "Firstname.Lastname", "F"],
    ["7even@example.com", "7even", "7"],
  ])("derives %s into %s and %s", (email, name, letter) => {
    expect(displayName(email)).toBe(name);
    expect(avatarLetter(email)).toBe(letter);
  });

  it("keeps the avatar circle filled when the address is missing", () => {
    // An empty circle reads as a broken control rather than as an unknown
    // account, and the bar reserves the same space either way.
    expect(displayName("")).toBe("Account");
    expect(avatarLetter("")).toBe("A");
  });
});

/**
 * covers: spec 0005, AC-16
 *
 * The change password form is rendered only for an account that has a password
 * to change. A Google only account, which feature 20 makes possible, carries no
 * `email` identity, so the form would be a control that cannot work.
 *
 * That account cannot exist yet, so the negative branch is unreachable in a
 * browser today. The spec records that and asks for the condition itself to be
 * covered rather than a step nobody can run.
 */
describe("the change password form's rendering condition (AC-16)", () => {
  it("renders for an email account", () => {
    expect(hasPasswordIdentity([{ provider: "email" }])).toBe(true);
  });

  it("renders for an account carrying both a password and Google", () => {
    expect(
      hasPasswordIdentity([{ provider: "google" }, { provider: "email" }]),
    ).toBe(true);
  });

  it("does not render for a Google only account", () => {
    expect(hasPasswordIdentity([{ provider: "google" }])).toBe(false);
  });

  it("does not render when the identities list is absent or empty", () => {
    expect(hasPasswordIdentity(undefined)).toBe(false);
    expect(hasPasswordIdentity(null)).toBe(false);
    expect(hasPasswordIdentity([])).toBe(false);
  });
});

/**
 * covers: spec 0005, AC-24
 *
 * `/reset-password` sets a password without the current one, so it must accept
 * only a session a recovery link created. Every shape but the one the Auth
 * server was seen to issue is refused, so an ordinary signed in session cannot
 * walk around the current password check on `/account`.
 */
describe("the recovery session gate (AC-24)", () => {
  it("accepts the session a recovery link creates", () => {
    expect(
      isRecoverySession([{ method: "recovery", timestamp: 1_758_500_000 }]),
    ).toBe(true);
  });

  it.each([
    [
      "an ordinary password session",
      [{ method: "password", timestamp: 1_758_500_000 }],
    ],
    ["the bare string form", ["recovery"]],
    ["an empty claim", []],
    ["a missing claim", undefined],
    [
      "a recovery entry beside another method",
      [
        { method: "recovery", timestamp: 1_758_500_000 },
        { method: "password", timestamp: 1_758_400_000 },
      ],
    ],
  ])("refuses %s", (_label, amr) => {
    expect(isRecoverySession(amr)).toBe(false);
  });
});
