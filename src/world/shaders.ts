import { Effect } from '@babylonjs/core/Materials/effect';

/** Value-noise helpers shared by the procedural space shaders. */
const NOISE = /* glsl */ `
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x),
                 mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x),
                 mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm3(vec3 p, int octaves) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    v += a * noise3(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return v / (1.0 - pow(0.5, float(octaves)));
}
vec3 sphereDir(vec2 uv) {
  float lon = uv.x * 6.2831853;
  float lat = (uv.y - 0.5) * 3.1415927;
  return vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
}
`;

const SKY_VERTEX = /* glsl */ `
precision highp float;
attribute vec3 position;
uniform mat4 worldViewProjection;
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

const SKY_FRAGMENT = /* glsl */ `
precision highp float;
varying vec3 vDir;
${NOISE}
float starLayer(vec3 d, float scale, float density) {
  vec3 p = d * scale;
  vec3 cell = floor(p);
  vec3 h = hash33(cell);
  if (h.x > density) return 0.0;
  vec3 starPos = cell + 0.25 + h * 0.5;
  float dist = length(p - starPos);
  float size = 0.06 + h.y * 0.08;
  return smoothstep(size, 0.0, dist) * (0.6 + h.z * 2.2);
}
vec3 starColor(vec3 d, float scale) {
  vec3 h = hash33(floor(d * scale) + 17.0);
  return mix(vec3(1.0, 0.82, 0.62), vec3(0.7, 0.82, 1.0), h.x);
}
void main() {
  vec3 d = normalize(vDir);
  vec3 bandN = normalize(vec3(0.32, 0.86, 0.4));
  float bandDist = dot(d, bandN);
  float band = exp(-bandDist * bandDist / 0.06);
  float n1 = fbm3(d * 2.6, 6);
  float n2 = fbm3(d * 5.0 + vec3(7.1, 2.3, 1.7), 5);
  float n3 = fbm3(d * 11.0 + 3.0, 4);
  vec3 col = vec3(0.006, 0.008, 0.018);
  // Nebula clouds: cold blue gas, magenta emission, warm dust.
  float cloud = smoothstep(0.42, 0.85, n1);
  col += vec3(0.1, 0.2, 0.48) * cloud * (0.45 + band);
  col += vec3(0.5, 0.1, 0.38) * smoothstep(0.52, 0.9, n2) * (0.2 + 0.8 * band);
  col += vec3(0.5, 0.28, 0.12) * smoothstep(0.6, 0.85, n1 * n2 * 1.6) * band * 0.5;
  // Galactic band glow with dark dust lanes.
  col += vec3(0.6, 0.56, 0.7) * band * 0.12 * (0.6 + n2);
  col *= 1.0 - 0.7 * band * smoothstep(0.45, 0.72, n3);
  // Distant galaxy smudge.
  vec3 gDir = normalize(vec3(-0.6, 0.35, -0.72));
  float g = max(dot(d, gDir), 0.0);
  col += vec3(0.75, 0.65, 0.9) * pow(g, 900.0) * 0.8 + vec3(0.4, 0.45, 0.8) * pow(g, 180.0) * 0.12;
  // Bright neighbour star systems.
  vec3 s1 = normalize(vec3(0.7, 0.25, -0.65));
  vec3 s2 = normalize(vec3(-0.35, -0.2, 0.9));
  col += vec3(1.0, 0.75, 0.55) * (pow(max(dot(d, s1), 0.0), 6000.0) * 3.0 + pow(max(dot(d, s1), 0.0), 400.0) * 0.08);
  col += vec3(0.6, 0.75, 1.0) * (pow(max(dot(d, s2), 0.0), 8000.0) * 3.0 + pow(max(dot(d, s2), 0.0), 500.0) * 0.06);
  // Star fields (denser along the galactic band).
  float stars = starLayer(d, 140.0, 0.22 + band * 0.4) + starLayer(d, 260.0, 0.18 + band * 0.5) * 0.7 + starLayer(d, 70.0, 0.08);
  col += starColor(d, 140.0) * stars;
  gl_FragColor = vec4(col, 1.0);
}
`;

/** Draws the baked sky cube. Converts to linear when the post-process pipeline applies gamma. */
const SKYBOX_FRAGMENT = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform samplerCube skyTexture;
uniform float uLinear;
uniform float uIntensity;
void main() {
  vec3 col = textureCube(skyTexture, normalize(vDir)).rgb * uIntensity;
  if (uLinear > 0.5) col = pow(col, vec3(2.2));
  gl_FragColor = vec4(col, 1.0);
}
`;

const PLANET_SURFACE = /* glsl */ `
precision highp float;
varying vec2 vUV;
${NOISE}
void main() {
  vec3 p = sphereDir(vUV);
  float lat = (vUV.y - 0.5) * 3.1415927;
  float h = fbm3(p * 1.7 + vec3(3.1, 1.7, 5.3), 7);
  float h2 = fbm3(p * 5.5 + 11.0, 5);
  float land = smoothstep(0.515, 0.545, h + (h2 - 0.5) * 0.12);
  vec3 ocean = mix(vec3(0.012, 0.045, 0.14), vec3(0.03, 0.2, 0.33), smoothstep(0.36, 0.52, h));
  vec3 landCol = mix(vec3(0.13, 0.27, 0.1), vec3(0.55, 0.45, 0.28), smoothstep(0.42, 0.68, h2));
  landCol = mix(landCol, vec3(0.38, 0.34, 0.3), smoothstep(0.62, 0.74, h));
  float ice = smoothstep(1.12, 1.3, abs(lat) + (h2 - 0.5) * 0.35);
  vec3 col = mix(ocean, landCol, land);
  col = mix(col, vec3(0.88, 0.92, 0.97), ice);
  gl_FragColor = vec4(col, (1.0 - land) * (1.0 - ice));
}
`;

const PLANET_CLOUDS = /* glsl */ `
precision highp float;
varying vec2 vUV;
${NOISE}
void main() {
  vec3 p = sphereDir(vUV);
  float lat = (vUV.y - 0.5) * 3.1415927;
  vec3 q = vec3(fbm3(p * 2.0, 4), fbm3(p * 2.0 + 5.2, 4), fbm3(p * 2.0 + 9.1, 4));
  float c = fbm3(p * 3.2 + q * 1.8 + vec3(0.0, lat * 0.6, 0.0), 6);
  c = smoothstep(0.58, 0.86, c);
  float h = fbm3(p * 1.7 + vec3(3.1, 1.7, 5.3), 7);
  float land = smoothstep(0.53, 0.56, h);
  float city = pow(noise3(p * 90.0), 7.0) * 4.0 + pow(noise3(p * 23.0), 4.0) * 0.6;
  city *= land * smoothstep(1.25, 0.5, abs(lat));
  gl_FragColor = vec4(c, clamp(city, 0.0, 1.0), 0.0, 1.0);
}
`;

const PLANET_VERTEX = /* glsl */ `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
uniform mat4 world;
uniform mat4 worldViewProjection;
varying vec3 vNormalW;
varying vec3 vPosW;
varying vec2 vUV;
void main() {
  vec4 wp = world * vec4(position, 1.0);
  vPosW = wp.xyz;
  vNormalW = normalize(mat3(world) * normal);
  vUV = uv;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

const PLANET_FRAGMENT = /* glsl */ `
precision highp float;
varying vec3 vNormalW;
varying vec3 vPosW;
varying vec2 vUV;
uniform sampler2D surfaceTex;
uniform sampler2D cloudTex;
uniform vec3 sunDir;
uniform vec3 camPos;
uniform float time;
uniform float uLinear;
void main() {
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(camPos - vPosW);
  float ndl = dot(N, sunDir);
  float lit = max(ndl, 0.0);
  float day = smoothstep(-0.15, 0.2, ndl);
  vec4 surf = texture2D(surfaceTex, vUV);
  float cloud = texture2D(cloudTex, vUV + vec2(time * 0.0012, 0.0)).r;
  float cityLights = texture2D(cloudTex, vUV).g;
  vec3 col = surf.rgb * (0.015 + 1.05 * lit);
  vec3 H = normalize(sunDir + V);
  col += vec3(1.0, 0.88, 0.7) * pow(max(dot(N, H), 0.0), 80.0) * surf.a * day * 0.9;
  col = mix(col, vec3(0.92, 0.95, 1.0) * (0.02 + 0.95 * lit), cloud * 0.62);
  col += vec3(1.0, 0.7, 0.35) * cityLights * (1.0 - day) * (1.0 - cloud) * 1.4;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.5);
  col += vec3(0.25, 0.55, 1.0) * rim * (0.05 + 0.9 * smoothstep(-0.25, 0.5, ndl));
  // Warm terminator scattering.
  col += vec3(1.0, 0.45, 0.2) * rim * smoothstep(0.25, 0.0, abs(ndl)) * 0.35;
  if (uLinear > 0.5) col = pow(col, vec3(2.2));
  gl_FragColor = vec4(col, 1.0);
}
`;

const ATMOSPHERE_FRAGMENT = /* glsl */ `
precision highp float;
varying vec3 vNormalW;
varying vec3 vPosW;
varying vec2 vUV;
uniform vec3 sunDir;
uniform vec3 camPos;
uniform vec3 tint;
uniform float uLinear;
void main() {
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(camPos - vPosW);
  float rim = 1.0 - max(dot(N, V), 0.0);
  float glow = pow(rim, 4.0) * 1.1;
  float lit = smoothstep(-0.35, 0.6, dot(N, sunDir));
  vec3 col = tint * glow * (0.08 + lit);
  if (uLinear > 0.5) col = pow(col, vec3(2.2));
  gl_FragColor = vec4(col, 1.0);
}
`;

const GAS_GIANT_FRAGMENT = /* glsl */ `
precision highp float;
varying vec3 vNormalW;
varying vec3 vPosW;
varying vec2 vUV;
uniform vec3 sunDir;
uniform vec3 camPos;
uniform float uLinear;
${NOISE}
void main() {
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(camPos - vPosW);
  float lat = vUV.y;
  float turb = fbm3(vec3(vUV.x * 12.0, lat * 40.0, 0.5), 4);
  float bands = sin((lat + turb * 0.04) * 60.0) * 0.5 + 0.5;
  vec3 c1 = vec3(0.82, 0.62, 0.42);
  vec3 c2 = vec3(0.55, 0.32, 0.2);
  vec3 c3 = vec3(0.92, 0.85, 0.72);
  vec3 col = mix(c1, c2, bands);
  col = mix(col, c3, smoothstep(0.6, 0.9, turb) * 0.5);
  float lit = max(dot(N, sunDir), 0.0);
  col *= 0.02 + 1.1 * lit;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  col += vec3(0.9, 0.6, 0.35) * rim * lit * 0.4;
  if (uLinear > 0.5) col = pow(col, vec3(2.2));
  gl_FragColor = vec4(col, 1.0);
}
`;

let registered = false;

export function registerShaders(): void {
  if (registered) return;
  registered = true;
  Effect.ShadersStore['skyVertexShader'] = SKY_VERTEX;
  Effect.ShadersStore['skyFragmentShader'] = SKY_FRAGMENT;
  Effect.ShadersStore['skyboxVertexShader'] = SKY_VERTEX;
  Effect.ShadersStore['skyboxFragmentShader'] = SKYBOX_FRAGMENT;
  Effect.ShadersStore['planetSurfacePixelShader'] = PLANET_SURFACE;
  Effect.ShadersStore['planetCloudsPixelShader'] = PLANET_CLOUDS;
  Effect.ShadersStore['planetVertexShader'] = PLANET_VERTEX;
  Effect.ShadersStore['planetFragmentShader'] = PLANET_FRAGMENT;
  Effect.ShadersStore['atmosphereVertexShader'] = PLANET_VERTEX;
  Effect.ShadersStore['atmosphereFragmentShader'] = ATMOSPHERE_FRAGMENT;
  Effect.ShadersStore['gasGiantVertexShader'] = PLANET_VERTEX;
  Effect.ShadersStore['gasGiantFragmentShader'] = GAS_GIANT_FRAGMENT;
}
