import { describe, expect, it } from "vitest";

import {
  BOKEH_STRIDE,
  bokehInstances,
  CAMERA,
  FILM_WIDTH,
  FRAME_LENGTH,
  placeStrip,
  RIBBON_STRIDE,
  ribbon,
  STRIPS,
  seededRandom,
} from "./layout";

const [first] = STRIPS;

/** covers: prompts/film-strip-background.md, AC-13 */
describe("ribbon", () => {
  const segments = 40;
  const { vertices, indices } = ribbon(first, segments);
  const vertex = (i: number) =>
    Array.from(vertices.subarray(i * RIBBON_STRIDE, (i + 1) * RIBBON_STRIDE));

  it("has two vertices per step and two triangles between steps", () => {
    expect(vertices.length).toBe((segments + 1) * 2 * RIBBON_STRIDE);
    expect(indices.length).toBe(segments * 6);
    expect(Math.max(...indices)).toBe((segments + 1) * 2 - 1);
  });

  it("is the film's width across and level, with unit normals", () => {
    for (const step of [0, 13, segments]) {
      const left = vertex(step * 2);
      const right = vertex(step * 2 + 1);
      const across = Math.hypot(
        right[0] - left[0],
        right[1] - left[1],
        right[2] - left[2],
      );
      expect(across).toBeCloseTo(FILM_WIDTH, 5);
      expect(Math.hypot(left[3], left[4], left[5])).toBeCloseTo(1, 5);
      expect([left[7], right[7]]).toEqual([0, 1]);
    }
  });

  it("spaces its steps evenly along the coil, one u per frame", () => {
    const u = (step: number) => vertex(step * 2)[6];
    const stepU = u(1) - u(0);
    for (let step = 1; step < segments; step++) {
      expect(u(step + 1) - u(step)).toBeCloseTo(stepU, 2);
    }
    expect(u(0)).toBe(0);
    // A coil of a 2.4 radius and 1.4 turns is many frames long.
    expect(u(segments) * FRAME_LENGTH).toBeGreaterThan(2 * Math.PI * 2.4);
  });

  it("stays within the coil's swollen radius, centred vertically", () => {
    const limit = first.radius * 1.25 + FILM_WIDTH;
    for (let i = 0; i < vertices.length; i += RIBBON_STRIDE) {
      expect(Math.hypot(vertices[i], vertices[i + 2])).toBeLessThan(limit);
      expect(Math.abs(vertices[i + 1])).toBeLessThan(
        (first.turns * first.pitch) / 2 + FILM_WIDTH,
      );
    }
  });
});

describe("placeStrip", () => {
  it("keeps the same fraction of the frustum on any screen shape", () => {
    const halfHeight = Math.tan(CAMERA.fovY / 2) * (CAMERA.z - first.z);
    for (const aspect of [16 / 9, 9 / 16]) {
      const { x, y } = placeStrip(first, aspect);
      expect(x / (halfHeight * aspect)).toBeCloseTo(first.fx);
      expect(y / halfHeight).toBeCloseTo(first.fy);
    }
  });

  it("puts the design's strips upper right, lower left and bottom", () => {
    const [a, b, c] = STRIPS.map((strip) => placeStrip(strip, 16 / 9));
    expect(a.x > 0 && a.y > 0).toBe(true);
    expect(b.x < 0 && b.y < 0).toBe(true);
    expect(c.y < 0).toBe(true);
  });
});

describe("bokehInstances", () => {
  it("is the same field for the same seed", () => {
    expect(bokehInstances(70)).toEqual(bokehInstances(70));
    expect(bokehInstances(70, 1)).not.toEqual(bokehInstances(70, 2));
  });

  it("draws every disc inside the design's ranges", () => {
    const data = bokehInstances(200);
    for (let k = 0; k < 200; k++) {
      const [x, y, z, size, rise, drift, base, phase, tint] = data.subarray(
        k * BOKEH_STRIDE,
        (k + 1) * BOKEH_STRIDE,
      );
      expect(Math.abs(x)).toBeLessThanOrEqual(11);
      expect(Math.abs(y)).toBeLessThanOrEqual(7);
      expect(z).toBeLessThanOrEqual(3);
      expect(z).toBeGreaterThanOrEqual(-11);
      expect(size).toBeGreaterThan(0.06 - 1e-6);
      expect(size).toBeLessThan(2.0);
      expect(rise).toBeGreaterThanOrEqual(0.05 - 1e-6);
      expect(Math.abs(drift)).toBeLessThanOrEqual(0.03);
      expect(base).toBeGreaterThan(0.1);
      expect(base).toBeLessThan(0.91);
      expect(phase).toBeLessThan(Math.PI * 2);
      expect(tint).toBe(k % 4);
    }
  });

  it("keeps the design's mix of large faint and small bright discs", () => {
    const data = bokehInstances(1000);
    let big = 0;
    for (let k = 0; k < 1000; k++) if (data[k * BOKEH_STRIDE + 3] >= 0.6) big++;
    expect(big / 1000).toBeGreaterThan(0.2);
    expect(big / 1000).toBeLessThan(0.4);
  });
});

describe("seededRandom", () => {
  it("returns values in 0 to 1", () => {
    const random = seededRandom(7);
    for (let i = 0; i < 1000; i++) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
