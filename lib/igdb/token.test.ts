import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fakeAbortTimeouts,
  installIgdbMock,
  restoreIgdbMock,
  settle,
  TEST_CLIENT_SECRET,
  tokenResponse,
} from "./__fixtures__/helpers";
import type { IgdbError } from "./errors";
import { getIgdbToken, invalidateIgdbToken } from "./token";

/**
 * The Twitch token: the form body, the memo and its expiry, single flight,
 * and how a refused or failed request maps (spec 0023, AC-3, AC-4).
 */

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(restoreIgdbMock);

const TEN_MINUTES = 10 * 60 * 1000;

describe("the token request", () => {
  it("sends the credentials in a form body, never in the URL", async () => {
    const mock = installIgdbMock();

    await settle(getIgdbToken());

    const call = mock.tokenCalls[0];
    expect(call.url).toBe("https://id.twitch.tv/oauth2/token");
    expect(call.url).not.toContain(TEST_CLIENT_SECRET);
    expect(call.init.method).toBe("POST");
    const form = new URLSearchParams(String(call.init.body));
    expect(form.get("client_secret")).toBe(TEST_CLIENT_SECRET);
    expect(form.get("grant_type")).toBe("client_credentials");
  });

  it("has its own 8 second timeout", async () => {
    const durations = fakeAbortTimeouts();
    installIgdbMock({ token: [{ hangs: true }] });

    const { error } = await settle(getIgdbToken());

    expect((error as IgdbError).kind).toBe("timeout");
    expect(durations).toEqual([8_000]);
  });

  it.each([
    [400, "unauthorized"],
    [401, "unauthorized"],
    [403, "unauthorized"],
    [429, "rate_limited"],
    [500, "upstream"],
  ])("maps a %i to %s", async (status, kind) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    installIgdbMock({ token: [{ status }] });
    const { error } = await settle(getIgdbToken());
    expect((error as IgdbError).kind).toBe(kind);
    expect((error as IgdbError).endpoint).toBe("token");
  });

  it("treats a response without a usable token as upstream, never echoing it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    installIgdbMock({
      token: [{ body: { access_token: "leaky", expires_in: -1 } }],
    });

    const { error } = await settle(getIgdbToken());

    expect((error as IgdbError).kind).toBe("upstream");
    expect((error as Error).message).not.toContain("leaky");
    expect(JSON.parse(String(warn.mock.calls[0][0])).event).toBe(
      "igdb_token_failed",
    );
  });
});

describe("the memo", () => {
  it("reuses a token until 10 minutes before it expires", async () => {
    const mock = installIgdbMock({
      token: [tokenResponse("first", 3600), tokenResponse("second", 3600)],
    });

    expect((await settle(getIgdbToken())).value).toBe("first");
    vi.advanceTimersByTime(3600 * 1000 - TEN_MINUTES - 1);
    expect((await settle(getIgdbToken())).value).toBe("first");
    vi.advanceTimersByTime(1);
    expect((await settle(getIgdbToken())).value).toBe("second");
    expect(mock.tokenCalls).toHaveLength(2);
  });

  it("shares one request between concurrent callers", async () => {
    const mock = installIgdbMock();

    const tokens = await settle(
      Promise.all([getIgdbToken(), getIgdbToken(), getIgdbToken()]),
    );

    expect(tokens.value).toHaveLength(3);
    expect(mock.tokenCalls).toHaveLength(1);
  });

  it("clears a failed request, so the next caller tries again", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const mock = installIgdbMock({
      token: [{ status: 503 }, tokenResponse("recovered")],
    });

    expect((await settle(getIgdbToken())).error).toBeDefined();
    expect((await settle(getIgdbToken())).value).toBe("recovered");
    expect(mock.tokenCalls).toHaveLength(2);
  });

  it("drops only the token that failed", async () => {
    const mock = installIgdbMock({
      token: [tokenResponse("current"), tokenResponse("next")],
    });
    await settle(getIgdbToken());

    invalidateIgdbToken("some-older-token");
    expect((await settle(getIgdbToken())).value).toBe("current");

    invalidateIgdbToken("current");
    expect((await settle(getIgdbToken())).value).toBe("next");
    expect(mock.tokenCalls).toHaveLength(2);
  });
});
