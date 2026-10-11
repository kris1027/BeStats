/**
 * The scene's geometry and placement, as pure functions
 * (prompts/film-strip-background.md, decisions 1 and 8). Everything here is
 * the design file's numbers, computed once at build time and uploaded, so the
 * frame loop only moves whole strips and passes the clock to the shaders.
 */

/** One strip of the design's layout table. */
export interface StripLayout {
  /** Helix radius, turns and rise per turn. */
  radius: number;
  turns: number;
  pitch: number;
  /** Screen position as a fraction of the half frustum at the strip's depth. */
  fx: number;
  fy: number;
  z: number;
  /** Tilt of the whole coil, in radians. */
  rx: number;
  rz: number;
  scale: number;
  /** Spin around the coil's axis and film scroll, per scene second. */
  spin: number;
  run: number;
}

/**
 * The design's strips, in its order: the large coil upper right, the one
 * lower left, then a small distant one at the bottom. A fourth existed in the
 * design's table for a prop the app does not expose, so it is not kept.
 */
export const STRIPS: readonly StripLayout[] = [
  {
    radius: 2.4,
    turns: 1.4,
    pitch: 1.7,
    fx: 0.62,
    fy: 0.62,
    z: -1,
    rx: 0.35,
    rz: -0.55,
    scale: 1,
    spin: 0.12,
    run: 0.12,
  },
  {
    radius: 2.0,
    turns: 1.2,
    pitch: 1.6,
    fx: -0.68,
    fy: -0.6,
    z: 0,
    rx: -0.25,
    rz: 0.5,
    scale: 1,
    spin: -0.1,
    run: -0.1,
  },
  {
    radius: 1.8,
    turns: 1.6,
    pitch: 1.6,
    fx: 0.15,
    fy: -0.95,
    z: -7,
    rx: 0.5,
    rz: 1.2,
    scale: 0.9,
    spin: 0.08,
    run: 0.08,
  },
];

/** The film's width across the ribbon, in scene units, as in the design. */
export const FILM_WIDTH = 1.1;

/**
 * The length of one frame along the film. The design textured the ribbon
 * with a 360 × 256 frame, so a frame is that 1.4 aspect ratio times the width
 * and the sprocket holes stay evenly spaced however long a coil is.
 */
export const FRAME_LENGTH = FILM_WIDTH * 1.4;

/**
 * The design's camera: a 50 degree lens at z = 10 looking at (0, 0, -3). It
 * stays still: the design's pointer parallax was dropped at the owner's
 * request on 2026-10-11, so nothing in the scene follows the cursor.
 */
export const CAMERA = {
  fovY: (50 * Math.PI) / 180,
  near: 0.1,
  far: 100,
  eye: [0, 0, 10] as const,
  target: [0, 0, -3] as const,
} as const;

type Vec3 = [number, number, number];

/**
 * The design's coil at `s` from 0 to 1: a helix whose radius swells by a
 * quarter in the middle, centred on the origin vertically. The design ran a
 * Catmull-Rom spline through 61 samples of this; the curve itself is used
 * here, which is the same shape without the spline's tiny wobble.
 */
function coilPoint(strip: StripLayout, s: number): Vec3 {
  const angle = s * strip.turns * Math.PI * 2;
  const r = strip.radius * (1 + 0.25 * Math.sin(s * Math.PI));
  return [
    r * Math.cos(angle),
    (angle / (Math.PI * 2)) * strip.pitch - (strip.turns * strip.pitch) / 2,
    r * Math.sin(angle),
  ];
}

/** Floats per ribbon vertex: position, normal, uv. */
export const RIBBON_STRIDE = 8;

/** Fine steps used to measure the coil's length before spacing the ribbon. */
const ARC_SAMPLES = 2048;

/**
 * The film ribbon along one strip's coil, as an indexed triangle strip laid
 * out for `gl.TRIANGLES`. Vertices are spaced evenly by arc length, as the
 * design's `getPointAt` did, so the frames along the film are all the same
 * size. The ribbon stays level, its width at right angles to the coil and to
 * world up, which is what made the design's film twist as it coils. `u` runs
 * one unit per frame along the film, `v` 0 to 1 across it.
 */
export function ribbon(
  strip: StripLayout,
  segments: number,
): { vertices: Float32Array; indices: Uint16Array } {
  // Cumulative length at each fine sample.
  const lengths = new Float64Array(ARC_SAMPLES + 1);
  let previous = coilPoint(strip, 0);
  for (let i = 1; i <= ARC_SAMPLES; i++) {
    const point = coilPoint(strip, i / ARC_SAMPLES);
    lengths[i] =
      lengths[i - 1] +
      Math.hypot(
        point[0] - previous[0],
        point[1] - previous[1],
        point[2] - previous[2],
      );
    previous = point;
  }
  const total = lengths[ARC_SAMPLES];

  // The coil parameter at a given distance along it.
  let cursor = 0;
  const atLength = (target: number) => {
    while (cursor < ARC_SAMPLES - 1 && lengths[cursor + 1] < target) cursor++;
    const span = lengths[cursor + 1] - lengths[cursor] || 1;
    return (cursor + (target - lengths[cursor]) / span) / ARC_SAMPLES;
  };

  const half = FILM_WIDTH / 2;
  const vertices = new Float32Array((segments + 1) * 2 * RIBBON_STRIDE);
  const indices = new Uint16Array(segments * 6);
  const delta = 1 / ARC_SAMPLES;

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const s = atLength(t * total);
    const p = coilPoint(strip, s);
    const a = coilPoint(strip, Math.max(0, s - delta));
    const b = coilPoint(strip, Math.min(1, s + delta));
    const tangent = normalize([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    // World up with its component along the coil removed.
    const side = normalize([
      -tangent[1] * tangent[0],
      1 - tangent[1] * tangent[1],
      -tangent[1] * tangent[2],
    ]);
    const normal = normalize(cross(side, tangent));
    const u = (t * total) / FRAME_LENGTH;

    for (const [sign, v] of [
      [-1, 0],
      [1, 1],
    ] as const) {
      const offset = (i * 2 + v) * RIBBON_STRIDE;
      vertices.set(
        [
          p[0] + sign * side[0] * half,
          p[1] + sign * side[1] * half,
          p[2] + sign * side[2] * half,
          ...normal,
          u,
          v,
        ],
        offset,
      );
    }
    if (i < segments) {
      const first = i * 2;
      indices.set(
        [first, first + 1, first + 2, first + 1, first + 3, first + 2],
        i * 6,
      );
    }
  }
  return { vertices, indices };
}

/**
 * Where a strip sits for a viewport of this aspect ratio: the same fraction
 * of the visible half width and height at its depth, so a coil stays in its
 * corner on any screen shape, as the design placed it.
 */
export function placeStrip(
  strip: StripLayout,
  aspect: number,
): { x: number; y: number } {
  const distance = CAMERA.eye[2] - strip.z;
  const halfHeight = Math.tan(CAMERA.fovY / 2) * distance;
  return {
    x: strip.fx * halfHeight * aspect,
    y: strip.fy * halfHeight,
  };
}

/**
 * Floats per bokeh instance: start position and size, rise, drift, opacity
 * and phase, and which of the four tints it takes.
 */
export const BOKEH_STRIDE = 9;

/** The design's bokeh field: 22 wide, rising through 16, from z 3 to -11. */
export const BOKEH_FIELD = { width: 22, height: 16 } as const;

/**
 * A small seeded generator (mulberry32), so the bokeh field is the same on
 * every load and in tests, rather than reshuffling on each mount.
 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The seed the bokeh field is drawn from. */
export const BOKEH_SEED = 20261011;

/**
 * The design's bokeh, drawn the way it drew them: three in ten large, faint
 * discs and the rest small bright ones, tinted in turn. Where each one is at
 * a given time is worked out in the vertex shader from these.
 */
export function bokehInstances(count: number, seed = BOKEH_SEED): Float32Array {
  const random = seededRandom(seed);
  const data = new Float32Array(count * BOKEH_STRIDE);
  for (let k = 0; k < count; k++) {
    const big = random() < 0.3;
    const size = big ? 0.6 + random() * 1.4 : 0.06 + random() * 0.35;
    const x = (random() - 0.5) * BOKEH_FIELD.width;
    const y = (random() - 0.5) * 14;
    const z = -random() * 14 + 3;
    const base = big ? 0.12 + random() * 0.2 : 0.35 + random() * 0.55;
    const phase = random() * Math.PI * 2;
    const rise = 0.05 + random() * 0.15;
    const drift = (random() - 0.5) * 0.06;
    data.set(
      [x, y, z, size, rise, drift, base, phase, k % 4],
      k * BOKEH_STRIDE,
    );
  }
  return data;
}

function normalize([x, y, z]: Vec3): Vec3 {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
