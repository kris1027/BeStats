import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SceneClock } from "@/lib/film-scene/clock";
import { CONTINUITY_KEY } from "@/lib/film-scene/continuity";
import type { RunOptions } from "@/lib/film-scene/run";

const rgb: [number, number, number] = [0.1, 0.2, 0.3];
vi.mock("@/lib/film-scene/palette", () => ({
  readScenePalette: () => new Proxy({}, { get: () => rgb }),
}));

const runScene =
  vi.fn<(canvas: unknown, options: RunOptions) => SceneClock | null>();
vi.mock("@/lib/film-scene/run", () => ({ runScene }));

import { PageBackgroundCanvas } from "./page-background-canvas";

/** A worker that records what the page posts and lets the test reply. */
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() {
    FakeWorker.instances.push(this);
  }
  reply(data: unknown) {
    act(() => this.onmessage?.({ data }));
  }
}

function fakeClock(): SceneClock {
  return {
    resize: vi.fn(),
    setVisible: vi.fn(),
    setReducedMotion: vi.fn(),
    dispose: vi.fn(),
  };
}

const media = { reducedMotion: false, coarse: false };
let resize: (() => void) | null = null;

/**
 * jsdom has no WebGL, no workers, no `matchMedia` and no `ResizeObserver`;
 * each is stood in for so the real mount module runs end to end. `worker`
 * decides whether the browser can hand a canvas to a worker.
 */
function browser({ worker }: { worker: boolean }) {
  FakeWorker.instances = [];
  vi.stubGlobal("Worker", FakeWorker);
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: query.includes("reduce") ? media.reducedMotion : media.coarse,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  if (worker) {
    HTMLCanvasElement.prototype.transferControlToOffscreen = () =>
      ({}) as OffscreenCanvas;
  }
}

/** Runs the idle timer and waits out every lazy chunk the mount loads. */
async function settle() {
  await act(async () => {
    await vi.runAllTimersAsync();
    await vi.dynamicImportSettled();
  });
}

async function start() {
  const view = render(<PageBackgroundCanvas />);
  await settle();
  return view;
}

/** covers: prompts/film-strip-background.md, AC-6, AC-8, AC-9, AC-10 */
describe("PageBackgroundCanvas", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    runScene.mockReset();
    media.reducedMotion = false;
    media.coarse = false;
    resize = null;
  });
  afterEach(() => {
    sessionStorage.clear();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    // @ts-expect-error jsdom never defines it; the worker tests add it.
    delete HTMLCanvasElement.prototype.transferControlToOffscreen;
  });

  it("draws in a worker where the browser can hand it a canvas", async () => {
    browser({ worker: true });
    const { container } = await start();
    const [worker] = FakeWorker.instances;
    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "init" }),
      expect.any(Array),
    );
    expect(container.querySelector("canvas")).not.toBeNull();
    expect(runScene).not.toHaveBeenCalled();
  });

  it("moves to the main thread when the worker cannot draw", async () => {
    browser({ worker: true });
    runScene.mockReturnValue(fakeClock());
    const { container } = await start();
    FakeWorker.instances[0].reply({ type: "failed" });
    await settle();
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalled();
    expect(runScene).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll("canvas")).toHaveLength(1);
  });

  it("leaves only the gradient when the worker loses its context", async () => {
    browser({ worker: true });
    const { container } = await start();
    FakeWorker.instances[0].reply({ type: "lost" });
    await settle();
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalled();
    expect(runScene).not.toHaveBeenCalled();
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("leaves only the gradient without WebGL2", async () => {
    browser({ worker: false });
    runScene.mockReturnValue(null);
    const { container } = await start();
    expect(runScene).toHaveBeenCalledTimes(1);
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("leaves only the gradient when the main thread loses its context", async () => {
    browser({ worker: false });
    const clock = fakeClock();
    runScene.mockReturnValue(clock);
    const { container } = await start();
    act(() => runScene.mock.calls[0][1].onLost());
    expect(clock.dispose).toHaveBeenCalled();
    expect(runScene).toHaveBeenCalledTimes(1);
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("rebuilds the compact scene in the same worker when the window crosses 768px", async () => {
    browser({ worker: true });
    vi.stubGlobal("innerWidth", 1440);
    const { container } = await start();
    const [worker] = FakeWorker.instances;
    expect(worker.postMessage.mock.calls[0][0].budget.bokeh).toBe(70);

    vi.stubGlobal("innerWidth", 600);
    act(() => resize?.());
    const rebuild = worker.postMessage.mock.lastCall?.[0];
    expect(rebuild).toMatchObject({ type: "rebuild", budget: { bokeh: 35 } });
    // The worker's clock knows the exact pose; the page's copy is a second old.
    expect(rebuild).not.toHaveProperty("time");
    expect(worker.terminate).not.toHaveBeenCalled();
    expect(FakeWorker.instances).toHaveLength(1);
    expect(container.querySelectorAll("canvas")).toHaveLength(1);

    vi.stubGlobal("innerWidth", 700);
    act(() => resize?.());
    expect(worker.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "resize" }),
      [],
    );
  });

  it("rebuilds on the main thread from the time its clock reported as it stopped", async () => {
    browser({ worker: false });
    vi.stubGlobal("innerWidth", 1440);
    const first = fakeClock();
    vi.mocked(first.dispose).mockImplementation(() =>
      runScene.mock.calls[0][1].onTime(42),
    );
    runScene.mockReturnValueOnce(first).mockReturnValueOnce(fakeClock());
    await start();

    vi.stubGlobal("innerWidth", 600);
    act(() => resize?.());
    await settle();
    expect(first.dispose).toHaveBeenCalled();
    expect(runScene).toHaveBeenCalledTimes(2);
    expect(runScene.mock.calls[1][1]).toMatchObject({
      time: 42,
      budget: { bokeh: 35 },
    });
  });

  it("does not rebuild a scene that lost its context", async () => {
    browser({ worker: true });
    vi.stubGlobal("innerWidth", 1440);
    const { container } = await start();
    FakeWorker.instances[0].reply({ type: "lost" });
    vi.stubGlobal("innerWidth", 600);
    act(() => resize?.());
    expect(FakeWorker.instances).toHaveLength(1);
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("sends nothing to the scene when the pointer moves", async () => {
    browser({ worker: true });
    await start();
    const before = FakeWorker.instances[0].postMessage.mock.calls.length;
    act(() => {
      dispatchEvent(
        new MouseEvent("pointermove", { clientX: 10, clientY: 10 }),
      );
    });
    await settle();
    expect(FakeWorker.instances[0].postMessage.mock.calls).toHaveLength(before);
  });

  it("draws the still frame for everyone when asked, as /showcase does", async () => {
    browser({ worker: true });
    render(<PageBackgroundCanvas still />);
    await settle();
    expect(FakeWorker.instances[0].postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "init", reducedMotion: true }),
      expect.any(Array),
    );
  });

  it("stops the worker and removes the canvas on unmount", async () => {
    browser({ worker: true });
    const { container, unmount } = await start();
    const canvas = container.querySelector("canvas");
    unmount();
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalled();
    expect(canvas?.isConnected).toBe(false);
  });
});

/** covers: prompts/film-scene-continuity.md, AC-1, AC-2, AC-3, AC-6 */
describe("PageBackgroundCanvas across loads in one tab", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    runScene.mockReset();
    media.reducedMotion = false;
    media.coarse = false;
    resize = null;
    browser({ worker: true });
  });
  afterEach(() => {
    sessionStorage.clear();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    // @ts-expect-error jsdom never defines it; the worker tests add it.
    delete HTMLCanvasElement.prototype.transferControlToOffscreen;
  });

  const stored = () => sessionStorage.getItem(CONTINUITY_KEY);
  const canvasOf = (container: HTMLElement) =>
    container.querySelector("canvas") as HTMLCanvasElement;

  it("plays the intro from time 0 on the tab's first load", async () => {
    const { container } = await start();
    const [worker] = FakeWorker.instances;
    expect(worker.postMessage.mock.calls[0][0]).toMatchObject({ time: 0 });
    worker.reply({ type: "ready" });
    expect(canvasOf(container).style.transition).toBe("opacity 1.6s ease");
    expect(canvasOf(container).style.opacity).toBe("1");
  });

  it("keeps each time the scene reports for the next load", async () => {
    await start();
    FakeWorker.instances[0].reply({ type: "time", time: 12.5 });
    expect(JSON.parse(stored() ?? "null")).toEqual({ time: 12.5 });
  });

  it("carries on from the stored time with no fade on a later load", async () => {
    sessionStorage.setItem(CONTINUITY_KEY, JSON.stringify({ time: 30 }));
    const { container } = await start();
    const [worker] = FakeWorker.instances;
    expect(worker.postMessage.mock.calls[0][0]).toMatchObject({ time: 30 });
    worker.reply({ type: "ready" });
    expect(canvasOf(container).style.transition).toBe("none");
  });

  it("plays the intro when the stored value is junk", async () => {
    sessionStorage.setItem(CONTINUITY_KEY, "junk");
    const { container } = await start();
    const [worker] = FakeWorker.instances;
    expect(worker.postMessage.mock.calls[0][0]).toMatchObject({ time: 0 });
    worker.reply({ type: "ready" });
    expect(canvasOf(container).style.transition).toBe("opacity 1.6s ease");
  });

  it("reveals a rebuild across the breakpoint with no fade", async () => {
    vi.stubGlobal("innerWidth", 1440);
    const { container } = await start();
    const [worker] = FakeWorker.instances;
    worker.reply({ type: "ready" });
    vi.stubGlobal("innerWidth", 600);
    act(() => resize?.());
    worker.reply({ type: "ready" });
    expect(canvasOf(container).style.transition).toBe("none");
    expect(canvasOf(container).style.opacity).toBe("1");
  });

  it("never reads or writes the stored time for the /showcase still frame", async () => {
    sessionStorage.setItem(CONTINUITY_KEY, JSON.stringify({ time: 30 }));
    render(<PageBackgroundCanvas still />);
    await settle();
    const [worker] = FakeWorker.instances;
    expect(worker.postMessage.mock.calls[0][0]).toMatchObject({ time: 0 });
    worker.reply({ type: "time", time: 99 });
    expect(JSON.parse(stored() ?? "null")).toEqual({ time: 30 });
  });
});
