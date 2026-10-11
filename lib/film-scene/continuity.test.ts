import { describe, expect, it } from "vitest";

import { CONTINUITY_KEY, readSceneTime, saveSceneTime } from "./continuity";

function memoryStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    data,
  };
}

const throwingStore = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("quota");
  },
};

/** covers: prompts/film-scene-continuity.md, AC-2, AC-4 */
describe("scene continuity", () => {
  it("round trips a saved time", () => {
    const store = memoryStore();
    saveSceneTime(12.5, store);
    expect(readSceneTime(store)).toBe(12.5);
  });

  it("reads null on the tab's first load", () => {
    expect(readSceneTime(memoryStore())).toBeNull();
    expect(readSceneTime(null)).toBeNull();
  });

  it.each([
    "junk",
    "{}",
    '{"time":-1}',
    '{"time":"3"}',
    '{"time":1e300}',
    "null",
  ])("ignores a stored %s", (raw) => {
    expect(readSceneTime(memoryStore({ [CONTINUITY_KEY]: raw }))).toBeNull();
  });

  it("never throws when storage does", () => {
    expect(readSceneTime(throwingStore)).toBeNull();
    expect(() => saveSceneTime(1, throwingStore)).not.toThrow();
  });

  it("does not save an invalid time", () => {
    const store = memoryStore();
    saveSceneTime(Number.NaN, store);
    saveSceneTime(-1, store);
    expect(store.data.size).toBe(0);
  });
});
