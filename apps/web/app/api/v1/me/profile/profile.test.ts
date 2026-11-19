import {
  v1ProfileSchema,
  v1ProfileWriteOkSchema,
} from "@bestats/core/api/v1/profile";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AUTH,
  calls,
  errorOf,
  fakeClient,
  req,
  resetDb,
  setDbResult,
} from "../../test-kit";

/**
 * covers: spec 0035, API surface (`/me/profile`), Sign up on mobile, and
 * spec 0033, AC-5, AC-8 for the username writes. Supabase is the boundary;
 * the route runs the same claim and change commands as the web actions.
 */
const verifyBearer = vi.fn();
vi.mock("@/lib/supabase/bearer", () => ({ verifyBearer }));

const { GET, PUT } = await import("./route");

const NOW = new Date("2026-11-18T12:00:00Z");
const ROW = (changedAt: string) => ({
  data: { username: "tester_one", username_changed_at: changedAt },
  error: null,
});
const NO_ROW = { data: null, error: null };
const OK = { data: null, error: null };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  resetDb();
  verifyBearer.mockResolvedValue({ userId: "user-a", client: fakeClient() });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const get = () =>
  GET(req("/api/v1/me/profile", AUTH), { params: Promise.resolve({}) });
const put = (body: unknown) =>
  PUT(req("/api/v1/me/profile", AUTH, { method: "PUT", body }), {
    params: Promise.resolve({}),
  });
const writes = () =>
  calls.filter((call) => call.method === "insert" || call.method === "upsert");

describe("GET /api/v1/me/profile", () => {
  it("answers a null username while unclaimed, private and uncached", async () => {
    setDbResult(NO_ROW);
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(v1ProfileSchema.parse(await response.json())).toEqual({
      username: null,
      usernameChangeableAt: null,
    });
    expect(calls).toContainEqual({ method: "eq", args: ["user_id", "user-a"] });
  });

  it("answers when the weekly lock lifts, and null once it has", async () => {
    setDbResult(ROW("2026-11-15T12:00:00+00:00"));
    expect(v1ProfileSchema.parse(await (await get()).json())).toEqual({
      username: "tester_one",
      usernameChangeableAt: "2026-11-22T12:00:00.000Z",
    });

    setDbResult(ROW("2026-11-01T12:00:00+00:00"));
    expect(
      v1ProfileSchema.parse(await (await get()).json()).usernameChangeableAt,
    ).toBeNull();
  });

  it("answers 500, never a null username, when the read fails", async () => {
    setDbResult({ data: null, error: { code: "XX000" } });
    const response = await get();
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("answers 401 when the token does not verify", async () => {
    verifyBearer.mockResolvedValueOnce(null);
    expect((await get()).status).toBe(401);
    expect(calls).toEqual([]);
  });
});

describe("PUT /api/v1/me/profile", () => {
  it("claims a first name with an insert for the verified user", async () => {
    setDbResult(NO_ROW, OK);
    const response = await put({ username: "  tester_one " });
    expect(response.status).toBe(200);
    expect(v1ProfileWriteOkSchema.parse(await response.json())).toEqual({
      ok: true,
      changed: true,
    });
    expect(writes()).toEqual([
      {
        method: "insert",
        args: [{ user_id: "user-a", username: "tester_one" }],
      },
    ]);
  });

  it("answers 409 username_taken when the name was taken in between", async () => {
    setDbResult(NO_ROW, { data: null, error: { code: "23505" } });
    const response = await put({ username: "tester_two" });
    expect(response.status).toBe(409);
    const error = await errorOf(response);
    expect(error).toMatchObject({
      code: "conflict",
      reason: "username_taken",
      message: "That username is taken.",
    });
  });

  it("changes an existing name with an upsert", async () => {
    setDbResult(ROW("2026-11-01T12:00:00+00:00"), OK);
    const response = await put({ username: "tester_two" });
    expect(v1ProfileWriteOkSchema.parse(await response.json())).toEqual({
      ok: true,
      changed: true,
    });
    expect(writes()).toEqual([
      {
        method: "upsert",
        args: [
          { user_id: "user-a", username: "tester_two" },
          { onConflict: "user_id" },
        ],
      },
    ]);
  });

  it("answers the same name as unchanged with no write", async () => {
    setDbResult(ROW("2026-11-01T12:00:00+00:00"));
    const response = await put({ username: "tester_one" });
    expect(v1ProfileWriteOkSchema.parse(await response.json())).toEqual({
      ok: true,
      changed: false,
    });
    expect(writes()).toEqual([]);
  });

  it("answers 409 username_locked for the weekly limit (BS002)", async () => {
    setDbResult(ROW("2026-11-15T12:00:00+00:00"), {
      data: null,
      error: { code: "BS002" },
    });
    const error = await errorOf(await put({ username: "tester_two" }));
    expect(error.code).toBe("conflict");
    expect(error.reason).toBe("username_locked");
  });

  it("answers 400 for a name the web forms refuse, writing nothing", async () => {
    for (const username of ["a", "has space", "admin", "-dash"]) {
      expect((await put({ username })).status).toBe(400);
    }
    expect(calls).toEqual([]);
  });

  it("answers 500 when the profile read fails, writing nothing", async () => {
    setDbResult({ data: null, error: { code: "XX000" } });
    expect((await put({ username: "tester_two" })).status).toBe(500);
    expect(writes()).toEqual([]);
  });
});
