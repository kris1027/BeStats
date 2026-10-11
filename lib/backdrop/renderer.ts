import { lookAt, perspective } from "./camera";
import type { BackdropColors } from "./colors";
import {
  type BackdropBudget,
  dustPoints,
  PANEL_STRIDE,
  panelInstances,
  waveGrid,
} from "./params";
import {
  DUST_FRAGMENT,
  DUST_VERTEX,
  PANEL_FRAGMENT,
  PANEL_VERTEX,
  WAVE_FRAGMENT,
  WAVE_VERTEX,
} from "./shaders";

/** What changes from frame to frame: the clock and the smoothed pointer. */
export interface FrameState {
  time: number;
  pointerX: number;
  pointerY: number;
}

export interface BackdropRenderer {
  draw(frame: FrameState): void;
  resize(width: number, height: number, pixelRatio: number): void;
  dispose(): void;
}

type Canvas = HTMLCanvasElement | OffscreenCanvas;

/**
 * Cheapest context that still draws the scene: no alpha (the page behind is
 * black anyway), no depth or stencil buffers (every layer is blended and
 * drawn in a fixed order), and the low power GPU where there is a choice.
 */
const CONTEXT_OPTIONS: WebGLContextAttributes = {
  alpha: false,
  antialias: true,
  depth: false,
  stencil: false,
  powerPreference: "low-power",
  preserveDrawingBuffer: false,
};

function compile(
  gl: WebGL2RenderingContext,
  vertex: string,
  fragment: string,
): WebGLProgram {
  const program = gl.createProgram();
  const shaders = [
    [gl.VERTEX_SHADER, vertex],
    [gl.FRAGMENT_SHADER, fragment],
  ] as const;
  for (const [type, source] of shaders) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("backdrop: shader allocation failed");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  // Checked once after linking, never per shader, so a healthy page does not
  // stall on the compile status queries.
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error("backdrop: shader program failed to link");
  }
  return program;
}

/**
 * `gl.useProgram` under another name. Biome's hook rule reads any `use*` call
 * as a React hook, so the one real call sits here behind one suppression.
 */
function activate(gl: WebGL2RenderingContext, program: WebGLProgram) {
  // biome-ignore lint/correctness/useHookAtTopLevel: a WebGL call, not a hook
  gl.useProgram(program);
}

function buffer(gl: WebGL2RenderingContext, data: Float32Array): WebGLBuffer {
  const handle = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, handle);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return handle;
}

function attribute(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string,
  size: number,
  stride: number,
  offset: number,
  divisor = 0,
) {
  const location = gl.getAttribLocation(program, name);
  if (location < 0) return;
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset);
  gl.vertexAttribDivisor(location, divisor);
}

function uniforms(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  names: readonly string[],
): Record<string, WebGLUniformLocation | null> {
  return Object.fromEntries(
    names.map((name) => [name, gl.getUniformLocation(program, name)]),
  );
}

/**
 * The background scene, drawn with plain WebGL2 rather than Three.js
 * (prompts/ambient-background.md, decision 1). Four draw calls a frame: the
 * point wave, the panel fills, the panel outlines and the dust.
 *
 * It touches no DOM, so the same module runs in a worker on an
 * `OffscreenCanvas` and on the main thread on a canvas element. Returns null
 * when the canvas has no WebGL2, which leaves the page on its static
 * vignette; a shader that fails to link throws, and the caller treats that
 * the same way.
 */
export function createRenderer(
  canvas: Canvas,
  budget: BackdropBudget,
  colors: BackdropColors,
): BackdropRenderer | null {
  const gl = canvas.getContext(
    "webgl2",
    CONTEXT_OPTIONS,
  ) as WebGL2RenderingContext | null;
  if (!gl) return null;

  const wave = compile(gl, WAVE_VERTEX, WAVE_FRAGMENT);
  const panel = compile(gl, PANEL_VERTEX, PANEL_FRAGMENT);
  const dust = compile(gl, DUST_VERTEX, DUST_FRAGMENT);
  const shared = ["uView", "uProj", "uTime"] as const;
  const waveU = uniforms(gl, wave, [...shared, "uPx", "uAccent", "uLow"]);
  const panelU = uniforms(gl, panel, [
    ...shared,
    "uOpacity",
    "uAccent",
    "uFog",
  ]);
  const dustU = uniforms(gl, dust, [...shared, "uHalfHeight", "uDust", "uFog"]);

  const buffers: WebGLBuffer[] = [];
  const arrays: WebGLVertexArrayObject[] = [];
  const vao = (setup: () => void) => {
    const handle = gl.createVertexArray();
    gl.bindVertexArray(handle);
    setup();
    gl.bindVertexArray(null);
    arrays.push(handle);
    return handle;
  };

  const waveCount = budget.gridWidth * budget.gridDepth;
  const waveVao = vao(() => {
    buffers.push(buffer(gl, waveGrid(budget)));
    attribute(gl, wave, "aXZ", 2, 0, 0);
  });

  const panelCount = budget.panels;
  const panelVao = vao(() => {
    // A 1 × 1.5 plane, as a strip for the fill. The outline reads the same
    // four corners in loop order from the start of the second buffer half.
    // biome-ignore format: corner pairs
    buffers.push(buffer(gl, new Float32Array([
      -0.5, -0.75, 0.5, -0.75, -0.5, 0.75, 0.5, 0.75,
      -0.5, -0.75, 0.5, -0.75, 0.5, 0.75, -0.5, 0.75,
    ])));
    attribute(gl, panel, "aCorner", 2, 0, 0);
    buffers.push(buffer(gl, panelInstances(panelCount)));
    const stride = PANEL_STRIDE * 4;
    attribute(gl, panel, "aI0", 4, stride, 0, 1);
    attribute(gl, panel, "aI1", 3, stride, 16, 1);
    attribute(gl, panel, "aI2", 3, stride, 28, 1);
  });

  const dustCount = budget.dust;
  const dustVao = vao(() => {
    buffers.push(buffer(gl, dustPoints(dustCount)));
    attribute(gl, dust, "aPos", 3, 0, 0);
  });

  // Colours never change while the page is open, so they are set once.
  activate(gl, wave);
  gl.uniform3fv(waveU.uAccent, colors.accent);
  gl.uniform3fv(waveU.uLow, colors.wave);
  activate(gl, panel);
  gl.uniform3fv(panelU.uAccent, colors.accent);
  gl.uniform3fv(panelU.uFog, colors.background);
  activate(gl, dust);
  gl.uniform3fv(dustU.uDust, colors.dust);
  gl.uniform3fv(dustU.uFog, colors.background);
  gl.clearColor(...colors.background, 1);
  gl.enable(gl.BLEND);

  let projection = perspective((55 * Math.PI) / 180, 1, 0.1, 100);
  let pixelRatio = 1;

  return {
    resize(width, height, ratio) {
      pixelRatio = ratio;
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      gl.viewport(0, 0, canvas.width, canvas.height);
      projection = perspective(
        (55 * Math.PI) / 180,
        width / Math.max(1, height),
        0.1,
        100,
      );
    },

    draw({ time, pointerX, pointerY }) {
      const view = lookAt(
        [pointerX * 1.6, 2.2 - pointerY * 0.8, 9],
        [0, 0.4, -4],
      );
      gl.clear(gl.COLOR_BUFFER_BIT);

      // Additive, as the design's wave material.
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      activate(gl, wave);
      gl.uniformMatrix4fv(waveU.uView, false, view);
      gl.uniformMatrix4fv(waveU.uProj, false, projection);
      gl.uniform1f(waveU.uTime, time);
      gl.uniform1f(waveU.uPx, pixelRatio);
      gl.bindVertexArray(waveVao);
      gl.drawArrays(gl.POINTS, 0, waveCount);

      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      activate(gl, dust);
      gl.uniformMatrix4fv(dustU.uView, false, view);
      gl.uniformMatrix4fv(dustU.uProj, false, projection);
      gl.uniform1f(dustU.uTime, time);
      gl.uniform1f(dustU.uHalfHeight, canvas.height / 2);
      gl.bindVertexArray(dustVao);
      gl.drawArrays(gl.POINTS, 0, dustCount);

      activate(gl, panel);
      gl.uniformMatrix4fv(panelU.uView, false, view);
      gl.uniformMatrix4fv(panelU.uProj, false, projection);
      gl.uniform1f(panelU.uTime, time);
      gl.bindVertexArray(panelVao);
      gl.uniform1f(panelU.uOpacity, 0.04);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, panelCount);
      gl.uniform1f(panelU.uOpacity, 0.4);
      gl.drawArraysInstanced(gl.LINE_LOOP, 4, 4, panelCount);
      gl.bindVertexArray(null);
    },

    dispose() {
      for (const handle of arrays) gl.deleteVertexArray(handle);
      for (const handle of buffers) gl.deleteBuffer(handle);
      for (const program of [wave, panel, dust]) gl.deleteProgram(program);
      // Hands the GPU memory back now instead of whenever the canvas is
      // collected, which matters on a phone navigating away.
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
