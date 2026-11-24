import type { QueryClient } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";

import {
  createApiMock,
  testQueryClient,
  titleWrapper,
} from "@/test-utils/title-harness";

import { CARD_STATE_CHUNK, useCardState, useCardStates } from "./card-states";
import { trackingKeys } from "./tracking";

/**
 * covers: prompts/mobile-look-card-actions.md, R6 (one `/me/titles` read per
 * loaded page of cards, never one per card; AC-7) and R7 (signed out, no
 * read and no card known)
 */
const mockApi = createApiMock();
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  apiRequest: (...args: [string, unknown, Record<string, unknown>]) =>
    mockApi.handle(...args),
}));

let mockSession: object | null = { user: { email: "a@example.test" } };
jest.mock("@/lib/session", () => ({
  useSession: () => ({ session: mockSession }),
}));

const EMPTY = { planned: false, watchedAt: null, rating: null };
const page = (from: number) =>
  Array.from({ length: CARD_STATE_CHUNK }, (_, i) => from + i);
const pathFor = (ids: number[]) =>
  `/api/v1/me/titles?ids=${ids.map((id) => `movie:${id}`).join(",")}`;

/** Answers a page's read with an empty state for each of its movies. */
function answer(ids: number[]) {
  mockApi.on("GET", pathFor(ids), () =>
    Object.fromEntries(ids.map((id) => [`movie:${id}`, EMPTY])),
  );
}

const titleReads = () =>
  mockApi.calls.filter((call) => call.path.startsWith("/api/v1/me/titles"));

let clients: QueryClient[] = [];

/** A fresh client, cleared after the test so its timers never hold Jest open. */
function client() {
  const made = testQueryClient();
  clients.push(made);
  return made;
}

beforeEach(() => {
  mockApi.reset();
  mockSession = { user: { email: "a@example.test" } };
});

afterEach(() => {
  for (const made of clients) made.clear();
  clients = [];
});

test("a scrolled grid sends one read per loaded page and never reads a page again", async () => {
  const first = page(1);
  const second = page(1001);
  answer(first);
  answer(second);
  const queries = client();

  const { result, rerender } = await renderHook(
    ({ ids }: { ids: number[] }) => useCardStates("movie", ids),
    { initialProps: { ids: first }, wrapper: titleWrapper(queries) },
  );
  await waitFor(() => expect(result.current(1)).toBe(true));
  expect(queries.getQueryData(trackingKeys.title("movie", 1))).toEqual(EMPTY);

  await rerender({ ids: [...first, ...second] });
  await waitFor(() => expect(result.current(1001)).toBe(true));

  expect(titleReads().map((call) => call.path)).toEqual([
    pathFor(first),
    pathFor(second),
  ]);
});

test("a seeded card never reads its own title, even once the seed is old", async () => {
  const queries = client();
  queries.setQueryData(trackingKeys.title("movie", 7), EMPTY, { updatedAt: 0 });

  const { result } = await renderHook(() => useCardState("movie", 7), {
    wrapper: titleWrapper(queries),
  });

  expect(result.current).toEqual(EMPTY);
  expect(titleReads()).toEqual([]);
});

test("signed out, nothing is read and no card is known", async () => {
  mockSession = null;
  const queries = client();

  const { result } = await renderHook(() => useCardStates("movie", page(1)), {
    wrapper: titleWrapper(queries),
  });

  expect(result.current(1)).toBe(false);
  expect(titleReads()).toEqual([]);
});
