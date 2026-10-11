/**
 * GLSL ES 3.00 for the three layers of the background
 * (prompts/ambient-background.md, decision 2).
 *
 * Everything that moves is a function of `uTime` here, so a frame costs the
 * CPU a handful of uniforms. The constants are the design file's, kept as
 * they were so the motion matches it. Fog is the design's exponential squared
 * fog (density 0.045), mixed toward the page background.
 *
 * Every fragment writes its colour already multiplied by its opacity and
 * passed through `capped`, and the renderer blends with `MAX`, so no pixel can
 * outshine `uPeak` (AC-10). Over the black page that matches the design's
 * additive and alpha blending everywhere layers do not overlap.
 */

const CAP = /* glsl */ `
uniform float uPeak;
vec3 capped(vec3 c) {
  float l = dot(pow(c, vec3(2.2)), vec3(0.2126, 0.7152, 0.0722));
  return l > uPeak ? c * pow(uPeak / l, 1.0 / 2.2) : c;
}
`;

const FOG = /* glsl */ `
uniform vec3 uFog;
float fogFactor(float depth) {
  return 1.0 - exp(-0.045 * 0.045 * depth * depth);
}
`;

/**
 * The point wave: a flat grid lifted by three sine terms of time, so its
 * buffer never changes after upload. Points shrink and fade with distance.
 */
export const WAVE_VERTEX = /* glsl */ `#version 300 es
in vec2 aXZ;
uniform mat4 uView;
uniform mat4 uProj;
uniform float uTime;
uniform float uPx;
out float vH;
out float vD;
void main() {
  float h = sin(aXZ.x * 0.35 + uTime * 0.6) * 0.45
    + cos(aXZ.y * 0.4 + uTime * 0.45) * 0.45
    + sin((aXZ.x + aXZ.y) * 0.18 - uTime * 0.3) * 0.6;
  vec4 mv = uView * vec4(aXZ.x, h - 1.8, aXZ.y, 1.0);
  vH = h;
  vD = -mv.z;
  gl_PointSize = (2.2 + h * 0.9) * uPx * (9.0 / vD);
  gl_Position = uProj * mv;
}
`;

export const WAVE_FRAGMENT = /* glsl */ `#version 300 es
precision mediump float;
uniform vec3 uAccent;
uniform vec3 uLow;
${CAP}
in float vH;
in float vD;
out vec4 outColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float a = (1.0 - smoothstep(0.0, 0.5, d))
    * (0.25 + 0.35 * (vH + 1.5) / 3.0)
    * clamp(1.0 - vD / 32.0, 0.0, 1.0);
  vec3 tint = mix(uLow, uAccent, clamp((vH + 0.6) / 1.8, 0.0, 1.0));
  outColor = vec4(capped(tint * a), 1.0);
}
`;

/**
 * The drifting panels, one instanced draw for the fills and one for the
 * outlines. Each panel travels toward the camera and wraps from z = 8 back to
 * z = -30, a 38 unit cycle; its x is rehashed every cycle, as the design
 * re-randomised it on wrap. The vertical bob is the closed form of the
 * design's per frame `+= sin(...) * 0.002` at 60 frames per second.
 */
export const PANEL_VERTEX = /* glsl */ `#version 300 es
in vec2 aCorner;
in vec4 aI0; // y0, z0, seed, speed
in vec3 aI1; // spin, phase, scale
in vec3 aI2; // rotation x, y, z
uniform mat4 uView;
uniform mat4 uProj;
uniform float uTime;
uniform float uOpacity;
out float vAlpha;
out float vDepth;

float hash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

void main() {
  float travel = aI0.y + 30.0 + aI0.w * uTime;
  float cycle = floor(travel / 38.0);
  float z = mod(travel, 38.0) - 30.0;
  float x = (hash(aI0.z + cycle * 7.13) - 0.5) * 22.0;
  float y = aI0.x - 0.24 * cos(uTime * 0.5 + aI1.y);

  float ry = aI2.y + aI1.x * uTime;
  float cx = cos(aI2.x), sx = sin(aI2.x);
  float cy = cos(ry), sy = sin(ry);
  float cz = cos(aI2.z), sz = sin(aI2.z);
  mat3 rx = mat3(1.0, 0.0, 0.0, 0.0, cx, sx, 0.0, -sx, cx);
  mat3 rotY = mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy);
  mat3 rz = mat3(cz, sz, 0.0, -sz, cz, 0.0, 0.0, 0.0, 1.0);

  vec3 world = vec3(x, y, z) + rx * rotY * rz * vec3(aCorner * aI1.z, 0.0);
  vec4 mv = uView * vec4(world, 1.0);
  float fade = clamp(min(1.0, (8.0 - z) / 3.0) * min(1.0, (z + 30.0) / 6.0), 0.0, 1.0);
  vAlpha = uOpacity * fade;
  vDepth = -mv.z;
  gl_Position = uProj * mv;
}
`;

export const PANEL_FRAGMENT = /* glsl */ `#version 300 es
precision mediump float;
uniform vec3 uAccent;
${FOG}
${CAP}
in float vAlpha;
in float vDepth;
out vec4 outColor;
void main() {
  outColor = vec4(capped(mix(uAccent, uFog, fogFactor(vDepth)) * vAlpha), 1.0);
}
`;

/**
 * The dust: fixed points turned slowly about the vertical axis by one angle
 * of time, sized by distance as the design's attenuated points were.
 */
export const DUST_VERTEX = /* glsl */ `#version 300 es
in vec3 aPos;
uniform mat4 uView;
uniform mat4 uProj;
uniform float uTime;
uniform float uHalfHeight;
out float vDepth;
void main() {
  float angle = uTime * 0.01;
  float c = cos(angle), s = sin(angle);
  vec3 p = vec3(c * aPos.x + s * aPos.z, aPos.y, -s * aPos.x + c * aPos.z);
  vec4 mv = uView * vec4(p, 1.0);
  vDepth = -mv.z;
  gl_PointSize = 0.03 * uHalfHeight / vDepth;
  gl_Position = uProj * mv;
}
`;

export const DUST_FRAGMENT = /* glsl */ `#version 300 es
precision mediump float;
uniform vec3 uDust;
${FOG}
${CAP}
in float vDepth;
out vec4 outColor;
void main() {
  outColor = vec4(capped(mix(uDust, uFog, fogFactor(vDepth)) * 0.5), 1.0);
}
`;
