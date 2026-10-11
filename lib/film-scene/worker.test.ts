import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SceneClock } from "./clock";
import type { RunOptions } from "./run";

const runScene =
  vi.fn<(canvas: unknown, options: RunOptions) => SceneClock | null>();
vi.mock("./run", () => ({ runScene }));

/** jsdom has no `OffscreenCanvas`, which the messages are checked against. */
class FakeOffscreenCanvas {}
vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);

/** The worker's global scope: what it posts, and the handler it installs. */
const posted: unknown[] = [];
const scope: { onmessage: ((event: { data: unknown }) => void) | null } & {
  postMessage(message: unknown): void;
} = { onmessage: null, postMessage: (message) => posted.push(message) };
vi.stubGlobal("self", scope);

const rgb = [0.1, 0.2, 0.3];
const KEYS = [
  "glow",
  "fog",
  "filmBase",
  "filmWindow",
  "filmShadow",
  "filmEdge",
  "filmRail",
  "filmGlow",
  "lightAmbient",
  "lightKey",
  "lightRim",
  "bokeh1",
  "bokeh2",
  "bokeh3",
  "bokeh4",
  "text",
];
const palette = Object.fromEntries(KEYS.map((key) => [key, rgb]));

function scene(budget: { strips: number; segments: number; bokeh: number }) {
  return {
    canvas: new FakeOffscreenCanvas(),
    width: 1440,
    height: 900,
    budget: { ...budget, pixelRatio: 1 },
    palette,
    reducedMotion: false,
    visible: true,
  };
}

function send(data: unknown) {
  scope.onmessage?.({ data });
}

function fakeClock(): SceneClock {
  return {
    resize: vi.fn(),
    setVisible: vi.fn(),
    setReducedMotion: vi.fn(),
    dispose: vi.fn(),
  };
}

/** covers: prompts/film-scene-continuity.md, AC-3 */
describe("the background worker", () => {
  // A fresh module per test, so no scene survives from the one before.
  beforeEach(async () => {
    runScene.mockReset();
    posted.length = 0;
    vi.resetModules();
    await import("./worker");
  });

  it("rebuilds from the time the old clock reported as it stopped", () => {
    const first = fakeClock();
    runScene.mockReturnValueOnce(first).mockReturnValueOnce(fakeClock());
    send({
      type: "init",
      ...scene({ strips: 3, segments: 400, bokeh: 70 }),
      time: 5,
    });
    const { onTime } = runScene.mock.calls[0][1];
    onTime(7);
    vi.mocked(first.dispose).mockImplementation(() => onTime(7.2));

    send({
      type: "rebuild",
      ...scene({ strips: 2, segments: 240, bokeh: 35 }),
    });
    expect(first.dispose).toHaveBeenCalled();
    expect(runScene.mock.calls[1][1]).toMatchObject({
      time: 7.2,
      budget: { bokeh: 35 },
    });
    expect(posted).toContainEqual({ type: "time", time: 7.2 });
  });

  it("replies failed when the rebuilt scene cannot draw", () => {
    runScene.mockReturnValueOnce(fakeClock()).mockReturnValueOnce(null);
    send({
      type: "init",
      ...scene({ strips: 3, segments: 400, bokeh: 70 }),
      time: 0,
    });
    send({
      type: "rebuild",
      ...scene({ strips: 2, segments: 240, bokeh: 35 }),
    });
    expect(posted).toContainEqual({ type: "failed" });
  });
});
