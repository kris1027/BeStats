import { DELETE_ACCOUNT_COPY } from "@bestats/core/auth/messages";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AUTH,
  calls,
  ctx,
  errorOf,
  fakeClient,
  req,
  resetDb,
  setDbResult,
} from "../../../test-kit";

/**
 * covers: spec 0033, AC-12 (the mobile half), spec 0035 (`/me/account/delete`)
 * and AGENTS.md section 11 (no false success). Supabase is the boundary: the
 * route calls `delete_own_account()` with no argument, so the user comes only
 * from the verified token.
 */
const verifyBearer = vi.fn();
vi.mock("@/lib/supabase/bearer", () => ({ verifyBearer }));

const { POST } = await import("./route");

const post = (body: unknown) =>
  POST(req("/api/v1/me/account/delete", AUTH, { method: "POST", body }), ctx());
const rpcCalls = () => calls.filter((call) => call.method === "rpc");

beforeEach(() => {
  resetDb();
  verifyBearer.mockResolvedValue({ userId: "user-a", client: fakeClient() });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("POST /api/v1/me/account/delete", () => {
  it("answers 204 with no body after the function runs, private and uncached", async () => {
    const response = await post({ confirm: "DELETE" });
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(rpcCalls()).toEqual([
      { method: "rpc", args: ["delete_own_account"] },
    ]);
  });

  it("deletes nothing without the exact confirm word", async () => {
    for (const body of [{}, { confirm: "delete" }, { confirm: "yes" }]) {
      const response = await post(body);
      expect(response.status).toBe(400);
    }
    expect(rpcCalls()).toEqual([]);
  });

  it("ignores any user named in the body", async () => {
    const response = await post({ confirm: "DELETE", userId: "user-b" });
    expect(response.status).toBe(204);
    expect(rpcCalls()[0]?.args).toEqual(["delete_own_account"]);
  });

  it("answers 401 when the token does not verify, and deletes nothing", async () => {
    verifyBearer.mockResolvedValueOnce(null);
    const response = await post({ confirm: "DELETE" });
    expect(response.status).toBe(401);
    expect(rpcCalls()).toEqual([]);
  });

  it("answers 500 with the still here copy when Postgres refuses", async () => {
    setDbResult({ data: null, error: { code: "42501", message: "x" } });
    const response = await post({ confirm: "DELETE" });
    expect(response.status).toBe(500);
    const error = await errorOf(response);
    expect(error.code).toBe("internal");
    expect(error.message).toBe(DELETE_ACCOUNT_COPY.failed);
  });
});
