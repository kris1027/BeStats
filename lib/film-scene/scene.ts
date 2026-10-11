import type { SceneBudget } from "./budget";
import {
  BOKEH_STRIDE,
  bokehInstances,
  CAMERA,
  placeStrip,
  RIBBON_STRIDE,
  ribbon,
  STRIPS,
} from "./layout";
import { lookAt, perspective, stripModel } from "./matrices";
import { peakLuminance, type ScenePalette } from "./palette";
import {
  BOKEH_FRAGMENT,
  BOKEH_VERTEX,
  STRIP_FRAGMENT,
  STRIP_VERTEX,
} from "./shaders";

/** What changes from frame to frame: only the clock. */
export interface FrameState {
  /** Scene seconds: real seconds times the design's speed. */
  time: number;
}

/**
 * The scene without a clock: it draws whatever frame it is handed, so the
 * clock decides when, and tests can drive it with no GPU.
 */
export interface SceneRenderer {
  draw(frame: FrameState): void;
  resize(width: number, height: number, pixelRatio: number): void;
  dispose(): void;
}

type Canvas = HTMLCanvasElement | OffscreenCanvas;

const FLOAT_BYTES = Float32Array.BYTES_PER_ELEMENT;

/**
 * Transparent, so the CSS gradient behind shows through and the bokeh add
 * onto it as the design's additive sprites did; a depth buffer, so the
 * strips hide the discs behind them; and the low power GPU where there is a
 * choice.
 */
const CONTEXT_OPTIONS: WebGLContextAttributes = {
  alpha: true,
  premultipliedAlpha: true,
  antialias: true,
  depth: true,
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
    if (!shader) throw new Error("film-scene: shader allocation failed");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  // Checked once after linking, never per shader, so a healthy page does not
  // stall on the compile status queries.
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error("film-scene: shader program failed to link");
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

function upload(
  gl: WebGL2RenderingContext,
  target: GLenum,
  data: Float32Array | Uint16Array,
): WebGLBuffer {
  const handle = gl.createBuffer();
  gl.bindBuffer(target, handle);
  gl.bufferData(target, data, gl.STATIC_DRAW);
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

function uniforms<Name extends string>(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  names: readonly Name[],
): Record<Name, WebGLUniformLocation | null> {
  return Object.fromEntries(
    names.map((name) => [name, gl.getUniformLocation(program, name)]),
  ) as Record<Name, WebGLUniformLocation | null>;
}

/** `value` wrapped into 0 to 1, so the film scroll never loses precision. */
const wrap = (value: number) => value - Math.floor(value);

/**
 * The film strip scene, drawn with plain WebGL2 rather than Three.js
 * (prompts/film-strip-background.md, decision 1). One draw call per strip
 * and one for every bokeh disc at once.
 *
 * It touches no DOM, so the same module runs in a worker on an
 * `OffscreenCanvas` and on the main thread on a canvas element. Returns null
 * when the canvas has no WebGL2, which leaves the page on its CSS gradient; a
 * shader that fails to link throws, and the caller treats that the same way.
 */
export function createScene(
  canvas: Canvas,
  budget: SceneBudget,
  palette: ScenePalette,
): SceneRenderer | null {
  const gl = canvas.getContext(
    "webgl2",
    CONTEXT_OPTIONS,
  ) as WebGL2RenderingContext | null;
  if (!gl) return null;

  const film = compile(gl, STRIP_VERTEX, STRIP_FRAGMENT);
  const bokeh = compile(gl, BOKEH_VERTEX, BOKEH_FRAGMENT);
  const filmU = uniforms(gl, film, [
    "uModel",
    "uView",
    "uProj",
    "uScroll",
    "uEye",
    "uPeak",
    "uBase",
    "uWindow",
    "uShadow",
    "uEdge",
    "uRail",
    "uEmissive",
    "uAmbient",
    "uKey",
    "uRim",
    "uFog",
  ]);
  const bokehU = uniforms(gl, bokeh, [
    "uView",
    "uProj",
    "uTime",
    "uPeak",
    "uGlow",
    "uTints",
  ]);

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

  const strips = STRIPS.slice(0, budget.strips).map((layout) => {
    const { vertices, indices } = ribbon(layout, budget.segments);
    const handle = vao(() => {
      buffers.push(upload(gl, gl.ARRAY_BUFFER, vertices));
      const stride = RIBBON_STRIDE * FLOAT_BYTES;
      attribute(gl, film, "aPosition", 3, stride, 0);
      attribute(gl, film, "aNormal", 3, stride, 3 * FLOAT_BYTES);
      attribute(gl, film, "aUv", 2, stride, 6 * FLOAT_BYTES);
      buffers.push(upload(gl, gl.ELEMENT_ARRAY_BUFFER, indices));
    });
    return { layout, vao: handle, count: indices.length, x: 0, y: 0 };
  });

  const bokehCount = budget.bokeh;
  const bokehVao = vao(() => {
    // biome-ignore format: corner pairs
    buffers.push(upload(gl, gl.ARRAY_BUFFER, new Float32Array([
      -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5,
    ])));
    attribute(gl, bokeh, "aCorner", 2, 0, 0);
    buffers.push(upload(gl, gl.ARRAY_BUFFER, bokehInstances(bokehCount)));
    const stride = BOKEH_STRIDE * FLOAT_BYTES;
    attribute(gl, bokeh, "aStart", 4, stride, 0, 1);
    attribute(gl, bokeh, "aMotion", 4, stride, 4 * FLOAT_BYTES, 1);
    attribute(gl, bokeh, "aTint", 1, stride, 8 * FLOAT_BYTES, 1);
  });

  // Colours never change while the page is open, so they are set once.
  const peak = peakLuminance(palette.text);
  activate(gl, film);
  gl.uniform1f(filmU.uPeak, peak);
  for (const [name, color] of [
    [filmU.uBase, palette.filmBase],
    [filmU.uWindow, palette.filmWindow],
    [filmU.uShadow, palette.filmShadow],
    [filmU.uEdge, palette.filmEdge],
    [filmU.uRail, palette.filmRail],
    [filmU.uEmissive, palette.filmGlow],
    [filmU.uAmbient, palette.lightAmbient],
    [filmU.uKey, palette.lightKey],
    [filmU.uRim, palette.lightRim],
    [filmU.uFog, palette.fog],
  ] as const) {
    gl.uniform3fv(name, color);
  }
  activate(gl, bokeh);
  gl.uniform1f(bokehU.uPeak, peak);
  gl.uniform3fv(bokehU.uGlow, palette.glow);
  gl.uniform3fv(
    bokehU.uTints,
    [palette.bokeh1, palette.bokeh2, palette.bokeh3, palette.bokeh4].flat(),
  );

  gl.clearColor(0, 0, 0, 0);
  gl.enable(gl.DEPTH_TEST);
  // MAX keeps the brightest disc rather than summing them, so the cap each
  // fragment applies holds where they overlap (decision 5).
  gl.blendEquation(gl.MAX);

  let projection = perspective(CAMERA.fovY, 1, CAMERA.near, CAMERA.far);
  // The camera never moves, so its view is worked out once.
  const view = lookAt(CAMERA.eye, CAMERA.target);

  return {
    resize(width, height, ratio) {
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      gl.viewport(0, 0, canvas.width, canvas.height);
      const aspect = width / Math.max(1, height);
      projection = perspective(CAMERA.fovY, aspect, CAMERA.near, CAMERA.far);
      for (const strip of strips) {
        Object.assign(strip, placeStrip(strip.layout, aspect));
      }
    },

    draw({ time }) {
      // The depth mask goes back on before the clear: the bokeh pass turned
      // it off, and a clear with it off leaves last frame's depth behind,
      // which would hide this frame's strips wherever they did not move.
      gl.depthMask(true);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      // The strips are opaque: depth written, nothing blended.
      gl.disable(gl.BLEND);
      activate(gl, film);
      gl.uniformMatrix4fv(filmU.uView, false, view);
      gl.uniformMatrix4fv(filmU.uProj, false, projection);
      gl.uniform3fv(filmU.uEye, CAMERA.eye);
      strips.forEach((strip, i) => {
        const { layout } = strip;
        const model = stripModel({
          x: strip.x,
          y: strip.y + Math.sin(time * 0.4 + i * 2) * 0.15,
          z: layout.z,
          rx: layout.rx,
          rz: layout.rz + Math.sin(time * 0.25 + i) * 0.05,
          scale: layout.scale,
          spin: layout.spin * time,
        });
        gl.uniformMatrix4fv(filmU.uModel, false, model);
        gl.uniform1f(filmU.uScroll, wrap(-layout.run * time));
        gl.bindVertexArray(strip.vao);
        gl.drawElements(gl.TRIANGLES, strip.count, gl.UNSIGNED_SHORT, 0);
      });

      // The bokeh: hidden behind strips, but never hiding each other.
      gl.enable(gl.BLEND);
      gl.depthMask(false);
      activate(gl, bokeh);
      gl.uniformMatrix4fv(bokehU.uView, false, view);
      gl.uniformMatrix4fv(bokehU.uProj, false, projection);
      gl.uniform1f(bokehU.uTime, time);
      gl.bindVertexArray(bokehVao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, bokehCount);
      gl.bindVertexArray(null);
    },

    dispose() {
      for (const handle of arrays) gl.deleteVertexArray(handle);
      for (const handle of buffers) gl.deleteBuffer(handle);
      gl.deleteProgram(film);
      gl.deleteProgram(bokeh);
      // Hands the GPU memory back now instead of whenever the canvas is
      // collected, which matters on a phone navigating away.
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
