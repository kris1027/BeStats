/**
 * The few matrices the scene needs, column major as WebGL expects. Written
 * out rather than imported: they are the only linear algebra the background
 * uses, and a maths library would cost more than the renderer.
 */

type Vec3 = readonly [number, number, number];
/** A 3 × 3 matrix, row major, used only while composing. */
type Mat3 = readonly number[];

/** A perspective projection, `fovY` in radians. */
export function perspective(
  fovY: number,
  aspect: number,
  near: number,
  far: number,
): Float32Array {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  // biome-ignore format: matrix layout
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
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

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** The view matrix of a camera at `eye` looking at `target`, y up. */
export function lookAt(eye: Vec3, target: Vec3): Float32Array {
  const z = normalize([
    eye[0] - target[0],
    eye[1] - target[1],
    eye[2] - target[2],
  ]);
  const x = normalize(cross([0, 1, 0], z));
  const y = cross(z, x);
  // biome-ignore format: matrix layout
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
  ]);
}

function multiply(a: Mat3, b: Mat3): Mat3 {
  const out: number[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      out.push(
        a[row * 3] * b[col] +
          a[row * 3 + 1] * b[3 + col] +
          a[row * 3 + 2] * b[6 + col],
      );
    }
  }
  return out;
}

/**
 * One strip's model matrix, composed the way the design nested it: the coil
 * spins about its own axis inside a group that is scaled, tilted (Three's
 * XYZ order, with no Y turn) and then moved into place.
 */
export function stripModel({
  x,
  y,
  z,
  rx,
  rz,
  scale,
  spin,
}: {
  x: number;
  y: number;
  z: number;
  rx: number;
  rz: number;
  scale: number;
  spin: number;
}): Float32Array {
  const [cx, sx] = [Math.cos(rx), Math.sin(rx)];
  const [cz, sz] = [Math.cos(rz), Math.sin(rz)];
  const [cy, sy] = [Math.cos(spin), Math.sin(spin)];
  const tilt = multiply(
    [1, 0, 0, 0, cx, -sx, 0, sx, cx],
    [cz, -sz, 0, sz, cz, 0, 0, 0, 1],
  );
  const m = multiply(tilt, [
    cy * scale,
    0,
    sy * scale,
    0,
    scale,
    0,
    -sy * scale,
    0,
    cy * scale,
  ]);
  // biome-ignore format: matrix layout
  return new Float32Array([
    m[0], m[3], m[6], 0,
    m[1], m[4], m[7], 0,
    m[2], m[5], m[8], 0,
    x, y, z, 1,
  ]);
}
