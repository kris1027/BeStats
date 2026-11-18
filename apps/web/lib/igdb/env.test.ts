import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getIgdbCredentials, resetIgdbCredentialsCache } from "./env";
import { IgdbError } from "./errors";

/**
 * The Twitch credentials, read lazily on the server (spec 0023, AC-1, AC-2,
 * AC-4). A missing value is an `unauthorized` IgdbError naming the variable,
 * never a top level throw and never the value.
 */

const ID = "IGDB_CLIENT_ID";
const SECRET = "IGDB_CLIENT_SECRET";

beforeEach(() => {
  resetIgdbCredentialsCache();
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetIgdbCredentialsCache();
});

function caught(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("getIgdbCredentials", () => {
  it("returns both values, trimmed", () => {
    vi.stubEnv(ID, "  client-id  ");
    vi.stubEnv(SECRET, "secret-value");
    expect(getIgdbCredentials()).toEqual({
      clientId: "client-id",
      clientSecret: "secret-value",
    });
  });

  it.each([
    [ID, ""],
    [ID, "   "],
    [SECRET, ""],
    [SECRET, " \t "],
  ])("raises unauthorized naming %s when it is %j", (variable, value) => {
    vi.stubEnv(ID, "client-id");
    vi.stubEnv(SECRET, "secret-value");
    vi.stubEnv(variable, value);

    const error = caught(getIgdbCredentials);

    expect(error).toBeInstanceOf(IgdbError);
    expect(error).toMatchObject({ kind: "unauthorized", endpoint: "token" });
    expect((error as Error).message).toContain(variable);
  });

  it("never puts the other credential's value in the message", () => {
    vi.stubEnv(ID, "visible-client-id");
    vi.stubEnv(SECRET, "");
    const error = caught(getIgdbCredentials) as Error;
    expect(error.message).not.toContain("visible-client-id");
  });

  it("memoizes until reset, so a changed variable needs the reset", () => {
    vi.stubEnv(ID, "first");
    vi.stubEnv(SECRET, "secret");
    expect(getIgdbCredentials().clientId).toBe("first");

    vi.stubEnv(ID, "second");
    expect(getIgdbCredentials().clientId).toBe("first");

    resetIgdbCredentialsCache();
    expect(getIgdbCredentials().clientId).toBe("second");
  });
});
