import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getIgdbCredentials,
  loadIgdbCredentialsFromFile,
  resetIgdbCredentialsCache,
} from "./env";
import { IgdbError } from "./errors";

/**
 * The Twitch credentials, read lazily on the server (spec 0023, AC-1, AC-2,
 * AC-4). A missing value is an `unauthorized` IgdbError naming the variable,
 * never a top level throw and never the value.
 */

const ID = "IGDB_CLIENT_ID";
const SECRET = "IGDB_CLIENT_SECRET";

let dir: string;

beforeEach(() => {
  resetIgdbCredentialsCache();
  dir = mkdtempSync(join(tmpdir(), "igdb-env-"));
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetIgdbCredentialsCache();
  rmSync(dir, { recursive: true, force: true });
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

describe("loadIgdbCredentialsFromFile", () => {
  it("fills missing variables from the file and says the live check can run", () => {
    vi.stubEnv(ID, "");
    vi.stubEnv(SECRET, "");
    const path = join(dir, ".env.local");
    writeFileSync(
      path,
      `OTHER=1\n${ID}= from-file-id \n${SECRET}=from-file-secret\n`,
    );

    expect(loadIgdbCredentialsFromFile(path)).toBe(true);
    expect(getIgdbCredentials()).toEqual({
      clientId: "from-file-id",
      clientSecret: "from-file-secret",
    });
  });

  it("never overrides a value already in the environment", () => {
    vi.stubEnv(ID, "from-env");
    vi.stubEnv(SECRET, "");
    const path = join(dir, ".env.local");
    writeFileSync(path, `${ID}=from-file\n${SECRET}=s\n`);

    loadIgdbCredentialsFromFile(path);

    expect(process.env[ID]).toBe("from-env");
  });

  it("answers false, without throwing, when the file is missing", () => {
    vi.stubEnv(ID, "");
    vi.stubEnv(SECRET, "");
    expect(loadIgdbCredentialsFromFile(join(dir, "absent"))).toBe(false);
  });

  it("answers false when the file has only one of the two", () => {
    vi.stubEnv(ID, "");
    vi.stubEnv(SECRET, "");
    const path = join(dir, ".env.local");
    writeFileSync(path, `${ID}=only-id\n${SECRET}=\n`);
    expect(loadIgdbCredentialsFromFile(path)).toBe(false);
  });

  it("drops the memo, so the next read sees the loaded values", () => {
    vi.stubEnv(ID, "old");
    vi.stubEnv(SECRET, "old");
    getIgdbCredentials();
    vi.stubEnv(ID, "");
    vi.stubEnv(SECRET, "");
    const path = join(dir, ".env.local");
    writeFileSync(path, `${ID}=new\n${SECRET}=new\n`);

    loadIgdbCredentialsFromFile(path);

    expect(getIgdbCredentials().clientId).toBe("new");
  });
});
