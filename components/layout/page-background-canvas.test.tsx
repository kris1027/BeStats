import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SceneClock } from "@/lib/film-scene/clock";
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

  it("rebuilds the compact scene when the window crosses 768px", async () => {
    browser({ worker: true });
    vi.stubGlobal("innerWidth", 1440);
    const { container } = await start();
    const first = FakeWorker.instances[0];
    expect(first.postMessage.mock.calls[0][0].budget.bokeh).toBe(70);

    vi.stubGlobal("innerWidth", 600);
    act(() => resize?.());
    const second = FakeWorker.instances[1];
    expect(first.terminate).toHaveBeenCalled();
    expect(second.postMessage.mock.calls[0][0].budget.bokeh).toBe(35);
    expect(container.querySelectorAll("canvas")).toHaveLength(1);

    vi.stubGlobal("innerWidth", 700);
    act(() => resize?.());
    expect(FakeWorker.instances).toHaveLength(2);
    expect(second.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "resize" }),
      [],
    );
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
