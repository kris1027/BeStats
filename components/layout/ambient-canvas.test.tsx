import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BackdropOptions } from "@/lib/backdrop/backdrop";
import type { BackdropLoop } from "@/lib/backdrop/loop";

const rgb: [number, number, number] = [0.1, 0.2, 0.3];
vi.mock("@/lib/backdrop/colors", () => ({
  readBackdropColors: () => ({
    accent: rgb,
    background: rgb,
    wave: rgb,
    dust: rgb,
  }),
}));

const createBackdrop =
  vi.fn<(canvas: unknown, options: BackdropOptions) => BackdropLoop | null>();
vi.mock("@/lib/backdrop/backdrop", () => ({ createBackdrop }));

import { AmbientCanvas } from "./ambient-canvas";

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

function fakeLoop(): BackdropLoop {
  return {
    resize: vi.fn(),
    setPointer: vi.fn(),
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
  const view = render(<AmbientCanvas />);
  await settle();
  return view;
}

/** covers: prompts/ambient-background.md, AC-5, AC-7, AC-8, AC-9 */
describe("AmbientCanvas", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    createBackdrop.mockReset();
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
    expect(createBackdrop).not.toHaveBeenCalled();
  });

  it("moves to the main thread when the worker cannot draw", async () => {
    browser({ worker: true });
    createBackdrop.mockReturnValue(fakeLoop());
    const { container } = await start();
    FakeWorker.instances[0].reply({ type: "failed" });
    await settle();
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalled();
    expect(createBackdrop).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll("canvas")).toHaveLength(1);
  });

  it("leaves only the vignette when the worker loses its context", async () => {
    browser({ worker: true });
    const { container } = await start();
    FakeWorker.instances[0].reply({ type: "lost" });
    await settle();
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalled();
    expect(createBackdrop).not.toHaveBeenCalled();
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("leaves only the vignette without WebGL2", async () => {
    browser({ worker: false });
    createBackdrop.mockReturnValue(null);
    const { container } = await start();
    expect(createBackdrop).toHaveBeenCalledTimes(1);
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("leaves only the vignette when the main thread loses its context", async () => {
    browser({ worker: false });
    const loop = fakeLoop();
    createBackdrop.mockReturnValue(loop);
    const { container } = await start();
    act(() => createBackdrop.mock.calls[0][1].onLost());
    expect(loop.dispose).toHaveBeenCalled();
    expect(createBackdrop).toHaveBeenCalledTimes(1);
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("rebuilds at the compact density when the window crosses 768px", async () => {
    browser({ worker: true });
    vi.stubGlobal("innerWidth", 1440);
    const { container } = await start();
    const first = FakeWorker.instances[0];
    expect(first.postMessage.mock.calls[0][0].budget.gridWidth).toBe(140);

    vi.stubGlobal("innerWidth", 600);
    act(() => resize?.());
    const second = FakeWorker.instances[1];
    expect(first.terminate).toHaveBeenCalled();
    expect(second.postMessage.mock.calls[0][0].budget.gridWidth).toBe(70);
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

  it.each([
    { reducedMotion: false, sent: 1 },
    { reducedMotion: true, sent: 0 },
  ])(
    "sends pointer moves only when motion is allowed (%o)",
    async ({ reducedMotion, sent }) => {
      media.reducedMotion = reducedMotion;
      browser({ worker: true });
      await start();
      act(() => {
        dispatchEvent(
          new MouseEvent("pointermove", { clientX: 10, clientY: 10 }),
        );
      });
      await settle();
      const pointerMessages =
        FakeWorker.instances[0].postMessage.mock.calls.filter(
          ([message]) => message.type === "pointer",
        );
      expect(pointerMessages).toHaveLength(sent);
    },
  );

  it("stops the worker and removes the canvas on unmount", async () => {
    browser({ worker: true });
    const { container, unmount } = await start();
    const canvas = container.querySelector("canvas");
    unmount();
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalled();
    expect(canvas?.isConnected).toBe(false);
  });
});
