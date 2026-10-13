// The pixel pass (THREEJS-NOTES rule 5): the last step of scene → bloom → pixel pass → upscale.
// It reads the 640×360 frame (already bloomed and sRGB-encoded), adds a 4×4 ordered dither on
// the low-res grid, snaps every pixel to the active palette through a 64³ lookup table, and
// draws the result into the letterboxed viewport at a whole-number scale with no filtering.
// Bloom goes before it so the glow lands on the grid in palette colors, not as a soft haze.
import { DataTexture, NearestFilter, RGBAFormat, ShaderMaterial, UnsignedByteType, Vector2 } from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { paletteRGB, type PaletteId } from '../data/palette';

const LEVELS = 64;

/** Perceptual-ish distance ("redmean"): cheap and better than plain RGB on dark reds and blues. */
function dist(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) {
  const rm = (r1 + r2) / 2;
  const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
}

const luts = new Map<PaletteId, DataTexture>();

/** A 64³ RGB → nearest palette color table, packed as a 4096×64 texture (x = r + 64·b, y = g). */
export function paletteLUT(id: PaletteId): DataTexture {
  let tex = luts.get(id);
  if (tex) return tex;
  const pal = paletteRGB(id);
  const data = new Uint8Array(LEVELS * LEVELS * LEVELS * 4);
  const step = 255 / (LEVELS - 1);
  for (let g = 0; g < LEVELS; g++)
    for (let b = 0; b < LEVELS; b++)
      for (let r = 0; r < LEVELS; r++) {
        const R = r * step, G = g * step, B = b * step;
        let best = 0, bd = Infinity;
        for (let i = 0; i < pal.length; i++) {
          const d = dist(R, G, B, pal[i][0], pal[i][1], pal[i][2]);
          if (d < bd) {
            bd = d;
            best = i;
          }
        }
        const o = (g * LEVELS * LEVELS + b * LEVELS + r) * 4;
        data[o] = pal[best][0];
        data[o + 1] = pal[best][1];
        data[o + 2] = pal[best][2];
        data[o + 3] = 255;
      }
  tex = new DataTexture(data, LEVELS * LEVELS, LEVELS, RGBAFormat, UnsignedByteType);
  tex.magFilter = tex.minFilter = NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  luts.set(id, tex);
  return tex;
}

export function makePixelPass(): ShaderPass {
  const mat = new ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      tLut: { value: null },
      res: { value: new Vector2(640, 360) },
      snap: { value: 1 },
      dither: { value: 0.035 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform sampler2D tLut;
      uniform vec2 res;
      uniform float snap;
      uniform float dither;
      varying vec2 vUv;
      float bayer4(vec2 p) {
        int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0));
        int i = x + y * 4;
        // 4x4 Bayer matrix, row-major
        float m[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
        return m[i] / 16.0 - 0.46875;
      }
      void main() {
        vec2 px = floor(vUv * res);
        vec3 c = texture2D(tDiffuse, (px + 0.5) / res).rgb;
        if (snap > 0.5) {
          c = clamp(c + bayer4(px) * dither, 0.0, 1.0);
          vec3 q = floor(c * 63.0 + 0.5);
          c = texture2D(tLut, vec2((q.r + q.b * 64.0 + 0.5) / 4096.0, (q.g + 0.5) / 64.0)).rgb;
        }
        gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
      }`,
    depthTest: false,
    depthWrite: false,
  });
  return new ShaderPass(mat);
}
