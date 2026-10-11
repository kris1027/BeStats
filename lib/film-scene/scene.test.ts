import { describe, expect, it, vi } from "vitest";

import { FULL_BUDGET } from "./budget";
import type { ScenePalette } from "./palette";
import { createScene } from "./scene";

const palette = new Proxy({}, { get: () => [0.1, 0.2, 0.3] }) as ScenePalette;
const budget = { ...FULL_BUDGET, pixelRatio: 1 };

/**
 * A WebGL2 context that records calls and does nothing, enough to build and
 * draw the scene without a GPU. `linked` decides whether programs link.
 */
function fakeGl({ linked = true } = {}) {
  const calls: Record<string, number> = {};
  const log: string[] = [];
  let handles = 0;
  const gl = new Proxy({} as Record<string, unknown>, {
    get(target, name: string) {
      if (name in target) return target[name];
      if (/^[A-Z_0-9]+$/.test(name)) return name;
      return (...args: unknown[]) => {
        calls[name] = (calls[name] ?? 0) + 1;
        if (name === "depthMask") log.push(`depthMask:${args[0]}`);
        if (name === "clear") log.push("clear");
        if (name === "getProgramParameter") return linked;
        if (name === "getAttribLocation") return 0;
        if (name === "getExtension") return { loseContext: vi.fn() };
        if (name.startsWith("create") || name === "getUniformLocation") {
          handles += 1;
          return { handle: handles, args };
        }
        return undefined;
      };
    },
  });
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => gl),
  } as unknown as OffscreenCanvas;
  return { canvas, calls, log };
}

/** covers: prompts/film-strip-background.md, AC-8, AC-13 */
describe("createScene", () => {
  it("draws nothing without WebGL2", () => {
    const canvas = { getContext: () => null } as unknown as OffscreenCanvas;
    expect(createScene(canvas, budget, palette)).toBeNull();
  });

  it("throws when a program does not link, which the caller treats as no scene", () => {
    const { canvas } = fakeGl({ linked: false });
    expect(() => createScene(canvas, budget, palette)).toThrow(/link/);
  });

  it("draws one call per strip and one for all the bokeh", () => {
    const { canvas, calls } = fakeGl();
    const scene = createScene(canvas, budget, palette);
    scene?.resize(1440, 900, 1.5);
    scene?.draw({ time: 1 });
    expect(calls.drawElements).toBe(FULL_BUDGET.strips);
    expect(calls.drawArraysInstanced).toBe(1);
    expect(canvas.width).toBe(2160);
    expect(canvas.height).toBe(1350);
  });

  it("turns depth writes back on before clearing each frame", () => {
    const { canvas, log } = fakeGl();
    const scene = createScene(canvas, budget, palette);
    scene?.resize(100, 100, 1);
    scene?.draw({ time: 0 });
    log.length = 0;
    scene?.draw({ time: 0 });
    expect(log.slice(0, 2)).toEqual(["depthMask:true", "clear"]);
  });

  it("deletes every buffer, array and program it made on dispose", () => {
    const { canvas, calls } = fakeGl();
    createScene(canvas, budget, palette)?.dispose();
    expect(calls.deleteBuffer).toBe(calls.createBuffer);
    expect(calls.deleteVertexArray).toBe(calls.createVertexArray);
    expect(calls.deleteProgram).toBe(2);
  });
});
