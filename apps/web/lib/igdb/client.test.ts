import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fakeAbortTimeouts,
  installIgdbMock,
  restoreIgdbMock,
  settle,
  TEST_CLIENT_ID,
  TEST_CLIENT_SECRET,
  TEST_TOKEN,
  tokenResponse,
} from "./__fixtures__/helpers";
import { igdbRequest } from "./client";
import { IgdbError } from "./errors";
import { recordsSchema } from "./schemas";

/**
 * The request client: headers, the 401 refresh, retries, deadlines and
 * logging (spec 0023, AC-4 to AC-7, AC-17). Fake timers run every backoff and
 * deadline, so nothing here waits for real.
 */

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(restoreIgdbMock);

const BODY = "fields name; where id = 1942; limit 1;";

function read() {
  return igdbRequest("games", BODY, recordsSchema);
}

function kindOf(error: unknown) {
  return (error as IgdbError).kind;
}

describe("the request", () => {
  it("POSTs the Apicalypse body with the Client-ID and Bearer headers", async () => {
    const mock = installIgdbMock({ igdb: [{ body: [{ id: 1 }] }] });

    const { value } = await settle(read());

    expect(value?.data).toEqual([{ id: 1 }]);
    expect(mock.igdbCalls[0].url).toBe("https://api.igdb.com/v4/games");
    expect(mock.igdbCalls[0].init.method).toBe("POST");
    expect(mock.body()).toBe(BODY);
    expect(mock.headers()["Client-ID"]).toBe(TEST_CLIENT_ID);
    expect(mock.headers().Authorization).toBe(`Bearer ${TEST_TOKEN}`);
  });

  it("reads IGDB's X-Count header, and says null when it is absent", async () => {
    installIgdbMock({ igdb: [{ body: [], headers: { "x-count": "140" } }] });
    expect((await settle(read())).value?.totalCount).toBe(140);

    restoreIgdbMock();
    vi.useFakeTimers();
    installIgdbMock({ igdb: [{ body: [] }] });
    expect((await settle(read())).value?.totalCount).toBeNull();
  });

  it("raises bad_response when the payload fails the schema", async () => {
    installIgdbMock({ igdb: [{ body: { not: "an array" } }] });
    const { error } = await settle(read());
    expect(kindOf(error)).toBe("bad_response");
  });

  it("treats a body that is not JSON as upstream", async () => {
    installIgdbMock({ igdb: [{ text: "<html>" }] });
    const { error } = await settle(read());
    expect(kindOf(error)).toBe("upstream");
  });

  it("maps a 400 to bad_response and does not retry it", async () => {
    const mock = installIgdbMock({ igdb: [{ status: 400 }] });
    const { error } = await settle(read());
    expect(kindOf(error)).toBe("bad_response");
    expect(mock.igdbCalls).toHaveLength(1);
  });
});

describe("the 401 refresh (AC-4)", () => {
  it("drops the token, fetches a new one and repeats the request once", async () => {
    const mock = installIgdbMock({
      token: [tokenResponse("old-token"), tokenResponse("new-token")],
      igdb: [{ status: 401 }, { body: [{ id: 1 }] }],
    });

    const { value } = await settle(read());

    expect(value?.data).toEqual([{ id: 1 }]);
    expect(mock.tokenCalls).toHaveLength(2);
    expect(mock.headers(0).Authorization).toBe("Bearer old-token");
    expect(mock.headers(1).Authorization).toBe("Bearer new-token");
  });

  it("raises unauthorized on a second 401", async () => {
    const mock = installIgdbMock({ igdb: [{ status: 401 }] });
    const { error } = await settle(read());
    expect(kindOf(error)).toBe("unauthorized");
    expect(mock.igdbCalls).toHaveLength(2);
  });

  it("raises unauthorized on a 403 without refreshing", async () => {
    const mock = installIgdbMock({ igdb: [{ status: 403 }] });
    const { error } = await settle(read());
    expect(kindOf(error)).toBe("unauthorized");
    expect(mock.tokenCalls).toHaveLength(1);
  });

  it("raises unauthorized naming the variable when a credential is missing", async () => {
    const mock = installIgdbMock();
    vi.stubEnv("IGDB_CLIENT_SECRET", "");
    const { resetIgdbCredentialsCache } = await import("./env");
    resetIgdbCredentialsCache();

    const { error } = await settle(read());

    expect(error).toBeInstanceOf(IgdbError);
    expect(kindOf(error)).toBe("unauthorized");
    expect((error as Error).message).toContain("IGDB_CLIENT_SECRET");
    expect(mock.mock).not.toHaveBeenCalled();
  });
});

describe("retries (AC-6)", () => {
  it("retries a 429 and succeeds on attempt 2", async () => {
    const mock = installIgdbMock({
      igdb: [{ status: 429 }, { body: [{ id: 1 }] }],
    });
    const { value } = await settle(read());
    expect(value?.data).toEqual([{ id: 1 }]);
    expect(mock.igdbCalls).toHaveLength(2);
  });

  it("stops at 3 attempts on a persistent 503 and raises upstream", async () => {
    const mock = installIgdbMock({ igdb: [{ status: 503 }] });
    const { error } = await settle(read());
    expect(kindOf(error)).toBe("upstream");
    expect(mock.igdbCalls).toHaveLength(3);
  });

  it("caps a Retry-After of 60 seconds at 10 seconds", async () => {
    const mock = installIgdbMock({
      igdb: [{ status: 429, headers: { "retry-after": "60" } }, { body: [] }],
    });

    const pending = read();
    await vi.advanceTimersByTimeAsync(9_900);
    expect(mock.igdbCalls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(mock.igdbCalls).toHaveLength(2);
    await expect(pending).resolves.toBeDefined();
  });

  it("retries a network failure as upstream", async () => {
    const mock = installIgdbMock({
      igdb: [{ throws: new TypeError("fetch failed") }, { body: [] }],
    });
    await settle(read());
    expect(mock.igdbCalls).toHaveLength(2);
  });
});

describe("deadlines (AC-6)", () => {
  it("raises timeout after 8 seconds on a hang and does not retry", async () => {
    const durations = fakeAbortTimeouts();
    const mock = installIgdbMock({ igdb: [{ hangs: true }] });

    const { error } = await settle(read());

    expect(kindOf(error)).toBe("timeout");
    expect(mock.igdbCalls).toHaveLength(1);
    expect(durations).toContain(8_000);
  });

  it("gives the whole read up as timeout after 20 seconds", async () => {
    const mock = installIgdbMock({
      igdb: [
        { status: 429, headers: { "retry-after": "10" } },
        { status: 429, headers: { "retry-after": "10" } },
        { body: [] },
      ],
    });
    // Each attempt costs nothing, so the two 10 s waits would end at 20 s.
    const { error } = await settle(read());
    expect(kindOf(error)).toBe("timeout");
    expect(mock.igdbCalls).toHaveLength(2);
  });
});

describe("logging (AC-17)", () => {
  it("logs one JSON line per failure and never a credential or the body", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    installIgdbMock({ igdb: [{ status: 503 }] });

    await settle(read());

    expect(warn).toHaveBeenCalledTimes(3);
    const lines = warn.mock.calls.map((call) => String(call[0]));
    const records = lines.map((line) => JSON.parse(line));
    expect(records.map((record) => record.event)).toEqual([
      "igdb_request_retry",
      "igdb_request_retry",
      "igdb_request_failed",
    ]);
    expect(Object.keys(records[2]).sort()).toEqual(
      ["attempt", "elapsedMs", "endpoint", "event", "kind", "status"].sort(),
    );
    for (const line of lines) {
      for (const secret of [
        TEST_TOKEN,
        TEST_CLIENT_ID,
        TEST_CLIENT_SECRET,
        "where id",
      ]) {
        expect(line).not.toContain(secret);
      }
    }
  });

  it("logs nothing for a successful read", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    installIgdbMock({ igdb: [{ body: [] }] });
    await settle(read());
    expect(warn).not.toHaveBeenCalled();
  });
});
