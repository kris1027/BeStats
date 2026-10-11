import { describe, expect, it } from "vitest";

import { lookAt, perspective } from "./camera";

function transform(m: Float32Array, [x, y, z]: number[]) {
  return [0, 1, 2, 3].map(
    (row) => m[row] * x + m[4 + row] * y + m[8 + row] * z + m[12 + row],
  );
}

describe("camera matrices", () => {
  it("puts the look target straight ahead on the view axis", () => {
    const view = lookAt([0, 2.2, 9], [0, 0.4, -4]);
    const [x, y, z] = transform(view, [0, 0.4, -4]);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(0);
    expect(z).toBeLessThan(0);
  });

  it("maps the near and far planes to the clip range", () => {
    const projection = perspective(Math.PI / 3, 1.5, 0.1, 100);
    const near = transform(projection, [0, 0, -0.1]);
    const far = transform(projection, [0, 0, -100]);
    expect(near[2] / near[3]).toBeCloseTo(-1);
    expect(far[2] / far[3]).toBeCloseTo(1);
  });
});
