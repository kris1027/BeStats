/**
 * GLSL ES 3.00 for the two programs of the background
 * (prompts/film-strip-background.md, decisions 1 and 5).
 *
 * The constants are the design file's, kept as they were so the look matches
 * it: the film frame was a 360 × 256 canvas texture, the material Three's
 * `MeshStandardMaterial` (roughness and metalness 0.35, emissive at 0.28),
 * lit by an ambient, a directional and a point light, under linear fog from
 * 8 to 22. Three r149 lit in the raw sRGB values and wrote the result
 * unconverted, and so does this.
 *
 * Both fragment shaders cap what they write to `uPeak`, the brightest
 * luminance at which muted text keeps 4.5:1. The strips are opaque, so their
 * cap is exact. The bokeh add their light onto the CSS gradient behind the
 * canvas, so their cap counts the gradient's brightest colour (`uGlow`) as
 * already there, and they blend with `MAX` so overlapping discs never add up.
 */

const CAP = /* glsl */ `
uniform float uPeak;
float luma(vec3 c) {
  return dot(pow(max(c, 0.0), vec3(2.2)), vec3(0.2126, 0.7152, 0.0722));
}
vec3 capped(vec3 c) {
  float l = luma(c);
  return l > uPeak ? c * pow(uPeak / l, 1.0 / 2.2) : c;
}
`;

/** The film ribbon, already in place: the CPU sends one matrix per strip. */
export const STRIP_VERTEX = /* glsl */ `#version 300 es
in vec3 aPosition;
in vec3 aNormal;
in vec2 aUv;
uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProj;
uniform float uScroll;
out vec3 vWorld;
out vec3 vNormal;
out vec2 vUv;
out float vDepth;
void main() {
  vec4 world = uModel * vec4(aPosition, 1.0);
  vec4 view = uView * world;
  vWorld = world.xyz;
  vNormal = mat3(uModel) * aNormal;
  vUv = vec2(aUv.x + uScroll, aUv.y);
  vDepth = -view.z;
  gl_Position = uProj * view;
}
`;

/**
 * The film frame, drawn where the design drew its canvas texture, in the
 * texture's own pixels: a teal base, a dark window with a vertical gradient
 * and a bright border, rails along both edges, and four rounded sprocket
 * holes top and bottom, which are discarded as the design's `alphaTest` cut
 * them. Edges are smoothed over one screen pixel with `fwidth`.
 */
export const STRIP_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
uniform vec3 uBase;
uniform vec3 uWindow;
uniform vec3 uShadow;
uniform vec3 uEdge;
uniform vec3 uRail;
uniform vec3 uEmissive;
uniform vec3 uAmbient;
uniform vec3 uKey;
uniform vec3 uRim;
uniform vec3 uFog;
uniform vec3 uEye;
${CAP}
in vec3 vWorld;
in vec3 vNormal;
in vec2 vUv;
in float vDepth;
out vec4 outColor;

const float PI = 3.14159265;
const vec3 KEY_DIR = vec3(0.37139068, 0.74278135, 0.55708601);
const vec3 RIM_POS = vec3(-3.0, 2.0, 5.0);
const float ROUGHNESS = 0.35;
const float METALNESS = 0.35;

float box(vec2 p, vec2 extent, float r) {
  vec2 q = abs(p) - extent + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float inside(float d, float w) {
  return 1.0 - smoothstep(-w, w, d);
}

vec3 directLight(vec3 n, vec3 v, vec3 l, vec3 radiance, vec3 diffuse, vec3 f0) {
  float nl = clamp(dot(n, l), 0.0, 1.0);
  if (nl <= 0.0) return vec3(0.0);
  vec3 h = normalize(l + v);
  float nv = clamp(abs(dot(n, v)), 1e-4, 1.0);
  float nh = clamp(dot(n, h), 0.0, 1.0);
  float vh = clamp(dot(v, h), 0.0, 1.0);
  float a = ROUGHNESS * ROUGHNESS;
  float a2 = a * a;
  vec3 f = f0 + (1.0 - f0) * pow(1.0 - vh, 5.0);
  float gv = nl * sqrt(a2 + (1.0 - a2) * nv * nv);
  float gl = nv * sqrt(a2 + (1.0 - a2) * nl * nl);
  float vis = 0.5 / max(gv + gl, 1e-6);
  float dd = nh * nh * (a2 - 1.0) + 1.0;
  float d = a2 / (PI * dd * dd);
  return nl * radiance * (diffuse + PI * f * vis * d);
}

void main() {
  vec2 px = vec2(vUv.x * 360.0, (1.0 - vUv.y) * 256.0);
  float w = max(fwidth(px.x), fwidth(px.y)) * 0.5 + 1e-3;
  float x = mod(px.x, 360.0);
  float y = px.y;

  // The sprocket holes, every 90 pixels along, 62 × 24 with 5 pixel corners.
  float column = floor(x / 90.0);
  vec2 hole = vec2(x - (45.0 + column * 90.0), y - (y < 128.0 ? 24.0 : 232.0));
  if (box(hole, vec2(31.0, 12.0), 5.0) < 0.0) discard;

  vec3 albedo = uBase;
  vec2 frame = vec2(x - 180.0, y - 128.0);
  float t = clamp((y - 52.0) / 152.0, 0.0, 1.0);
  vec3 glass = mix(uShadow, uWindow, 1.0 - abs(2.0 * t - 1.0));
  float d = box(frame, vec2(164.0, 76.0), 0.0);
  albedo = mix(albedo, glass, inside(d, w));
  albedo = mix(albedo, uEdge, inside(abs(d) - 1.5, w));
  float rail = min(y, 256.0 - y) - 3.0;
  albedo = mix(albedo, uRail, inside(rail, w));

  vec3 n = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 v = normalize(uEye - vWorld);
  vec3 diffuse = albedo * (1.0 - METALNESS);
  vec3 f0 = mix(vec3(0.04), albedo, METALNESS);

  vec3 color = uAmbient * 0.45 * diffuse;
  color += directLight(n, v, KEY_DIR, uKey * 0.9, diffuse, f0);
  vec3 toRim = RIM_POS - vWorld;
  float falloff = pow(clamp(1.0 - length(toRim) / 30.0, 0.0, 1.0), 2.0);
  color += directLight(n, v, normalize(toRim), uRim * 1.4 * falloff, diffuse, f0);
  color += uEmissive * 0.28 * albedo;

  color = mix(color, uFog, smoothstep(8.0, 22.0, vDepth));
  outColor = vec4(capped(color), 1.0);
}
`;

/**
 * The bokeh, one instanced quad each, facing the camera. Each disc's place
 * is a function of the clock: it rises and drifts, and when it passes the
 * top it comes back in at the bottom at a new place across, as the design
 * moved it on the CPU. Its opacity breathes on its own phase.
 */
export const BOKEH_VERTEX = /* glsl */ `#version 300 es
in vec2 aCorner;
in vec4 aStart;
in vec4 aMotion;
in float aTint;
uniform mat4 uView;
uniform mat4 uProj;
uniform float uTime;
uniform vec3 uTints[4];
out vec2 vCorner;
out vec3 vLight;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  float rise = aMotion.x;
  float cycle = (aStart.y + 8.0 + rise * uTime) / 16.0;
  float lap = floor(cycle);
  float y = fract(cycle) * 16.0 - 8.0;
  float since = lap < 1.0 ? uTime : uTime - (lap * 16.0 - aStart.y - 8.0) / rise;
  float x0 = lap < 1.0
    ? aStart.x
    : (hash(vec2(float(gl_InstanceID), lap)) - 0.5) * 22.0;
  vec4 view = uView * vec4(x0 + aMotion.y * since, y, aStart.z, 1.0);
  view.xy += aCorner * aStart.w;
  gl_Position = uProj * view;
  vCorner = aCorner;
  float opacity = aMotion.z * 0.6 * (0.7 + 0.3 * sin(uTime * 0.9 + aMotion.w));
  vLight = uTints[int(aTint)] * opacity;
}
`;

/**
 * The disc itself, the design's radial gradient: a soft body, a brighter
 * ring near the rim, and a quick fade at the edge.
 */
export const BOKEH_FRAGMENT = /* glsl */ `#version 300 es
precision mediump float;
uniform vec3 uGlow;
${CAP}
in vec2 vCorner;
in vec3 vLight;
out vec4 outColor;

float profile(float r) {
  if (r >= 1.0) return 0.0;
  if (r < 0.72) return mix(0.55, 0.42, r / 0.72);
  if (r < 0.88) return mix(0.42, 0.6, (r - 0.72) / 0.16);
  if (r < 0.97) return mix(0.6, 0.08, (r - 0.88) / 0.09);
  return mix(0.08, 0.0, (r - 0.97) / 0.03);
}

void main() {
  vec3 light = vLight * profile(length(vCorner) * 2.0);
  float under = luma(uGlow);
  float lit = luma(uGlow + light);
  if (lit > uPeak) light *= max(0.0, (uPeak - under) / (lit - under));
  outColor = vec4(light, 0.0);
}
`;
