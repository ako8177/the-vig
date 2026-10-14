// The 3D view: one WebGLRenderer, a 640×360 render target, scene → bloom → pixel pass →
// whole-number upscale into a letterboxed viewport (THREEJS-NOTES rule 5). Three.js lives only in
// src/render3d/; this reads sim state and events and never writes them.
//
// Bloom is selective: only meshes on the GLOW layer (neon, signs, the Collector's eyes) feed it,
// the rest of the scene drawn black so it still hides glow behind it. A luminance threshold can't
// do this job here: pure red and violet neon are darker by luminance than white panel text, so a
// threshold either skips the red tables or haloes the odds card.
import {
  HalfFloatType, PerspectiveCamera, Raycaster, Scene, Vector2, WebGLRenderTarget, WebGLRenderer, Color, Mesh,
  MeshBasicMaterial, ShaderMaterial, type Material, type Object3D,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { makePixelPass, paletteLUT } from './pixelpass';
import { activePalette, setPalette, hexOf, C, type PaletteId } from '../data/palette';

export const VIEW_W = 640;
export const VIEW_H = 360;
/** The layer whose meshes glow. */
export const GLOW = 1;

/** Each stage can be switched off to compare (Milestone 0: "the same view with each pass toggled"). */
export interface PassToggles {
  bloom: boolean;
  pixel: boolean;
  /** off = render at the window's resolution instead of 640×360 */
  lowRes: boolean;
}

/** Where the 640×360 image lands in the window, in device pixels and in CSS pixels. */
export interface Letterbox { x: number; y: number; w: number; h: number; scale: number; css: { x: number; y: number; w: number; h: number } }

export class View3D {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(60, VIEW_W / VIEW_H, 0.05, 60);
  /** the glow-only render and its bloom */
  readonly glowComposer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  /** the frame: scene + bloom, output encoding, pixel pass to the screen */
  readonly composer: EffectComposer;
  readonly mix: ShaderPass;
  /** the bar's work (DESIGN.md §10): the room swims, doubles and warms as you drink */
  readonly drunk: ShaderPass;
  readonly pixel: ShaderPass;
  toggles: PassToggles = { bloom: true, pixel: true, lowRes: true };
  /** 'auto': a whole-number scale when it fills most of the window, else fit it; 'pixel': whole
   *  numbers only (STYLE.md's strict rule); 'fill': always fit (DECISIONS #35) */
  scaling: 'auto' | 'pixel' | 'fill' = 'auto';
  box: Letterbox = { x: 0, y: 0, w: VIEW_W, h: VIEW_H, scale: 1, css: { x: 0, y: 0, w: VIEW_W, h: VIEW_H } };
  private ray = new Raycaster();
  private dw = 0;
  private dh = 0;
  private black = new MeshBasicMaterial({ color: 0x000000 });
  private stash = new Map<Mesh, Material | Material[]>();
  /** the meshes drawn black in the glow pass, found once (invalidateGlow after the scene changes) */
  private dark: Mesh[] | null = null;
  private skip: Mesh[] | null = null;
  private bg = new Color();

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.autoClear = true;
    this.scene.background = new Color(hexOf(C.ink));
    this.camera.rotation.order = 'YXZ';

    this.glowComposer = new EffectComposer(this.renderer, new WebGLRenderTarget(VIEW_W, VIEW_H, { type: HalfFloatType }));
    this.glowComposer.renderToScreen = false;
    this.glowComposer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new Vector2(VIEW_W, VIEW_H), 0.3, 0.05, 0);
    this.glowComposer.addPass(this.bloom);

    this.composer = new EffectComposer(this.renderer, new WebGLRenderTarget(VIEW_W, VIEW_H, { type: HalfFloatType }));
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.mix = new ShaderPass(
      new ShaderMaterial({
        uniforms: { tDiffuse: { value: null }, tGlow: { value: null }, amount: { value: 1 } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader:
          'uniform sampler2D tDiffuse; uniform sampler2D tGlow; uniform float amount; varying vec2 vUv;\n' +
          'void main() { gl_FragColor = texture2D(tDiffuse, vUv) + amount * vec4(texture2D(tGlow, vUv).rgb, 0.0); }',
      }),
    );
    this.composer.addPass(this.mix);
    this.composer.addPass(new OutputPass());
    this.drunk = new ShaderPass(
      new ShaderMaterial({
        uniforms: { tDiffuse: { value: null }, amount: { value: 0 }, time: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: [
          'uniform sampler2D tDiffuse; uniform float amount; uniform float time; varying vec2 vUv;',
          'void main() {',
          '  float a = amount;',
          '  vec2 uv = vUv;',
          // the room swims: two slow waves across the frame
          '  uv.x += sin(uv.y * 9.0 + time * 1.7) * 0.006 * a;',
          '  uv.y += cos(uv.x * 7.0 + time * 1.3) * 0.005 * a;',
          // and doubles: a second image drifting off the first
          '  vec2 off = vec2(sin(time * 0.9), cos(time * 0.7)) * 0.014 * a;',
          '  vec4 c1 = texture2D(tDiffuse, uv);',
          '  vec4 c2 = texture2D(tDiffuse, uv + off);',
          '  vec4 c = mix(c1, (c1 + c2) * 0.5, min(1.0, a * 0.9));',
          // warmer, louder colors, and the edges closing in
          '  float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));',
          '  c.rgb = mix(vec3(l), c.rgb, 1.0 + 0.45 * a);',
          '  float v = smoothstep(0.85, 0.2, distance(vUv, vec2(0.5)));',
          '  c.rgb *= mix(1.0, v, 0.55 * a);',
          '  gl_FragColor = vec4(c.rgb, 1.0);',
          '}',
        ].join('\n'),
      }),
    );
    this.drunk.enabled = false;
    this.composer.addPass(this.drunk);
    this.pixel = makePixelPass();
    this.composer.addPass(this.pixel);
    this.setPalette(activePalette);
    this.resize();
  }

  setPalette(id: PaletteId) {
    setPalette(id);
    this.pixel.uniforms.tLut.value = paletteLUT(id);
    this.scene.background = new Color(hexOf(C.ink));
  }

  /** The scene's meshes changed (a room built or disposed): find the dark ones again. */
  invalidateGlow() {
    this.dark = null;
    this.skip = null;
  }

  /** Mark an object (and its children) as glowing. */
  static glow(o: Object3D) {
    o.traverse((c) => c.layers.enable(GLOW));
  }

  /** Fit the window: 640×360 scaled the same on both axes, centered, black bars. */
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const ch = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (cw !== this.dw || ch !== this.dh) {
      this.renderer.setSize(cw, ch, false);
      this.dw = cw;
      this.dh = ch;
    }
    const fit = Math.min(cw / VIEW_W, ch / VIEW_H);
    // a whole number keeps every pixel square; when the best whole number would waste most of the
    // window (a 1366x768 laptop gets 1x: a quarter of the screen), fit it instead (DECISIONS #35).
    // Below 1x it always fits, never out of aspect.
    const whole = Math.floor(fit);
    const k = fit < 1 ? fit : this.scaling === 'pixel' || (this.scaling === 'auto' && whole / fit >= 0.85) ? whole : fit;
    const w = Math.round(VIEW_W * k), h = Math.round(VIEW_H * k);
    const x = Math.floor((cw - w) / 2), y = Math.floor((ch - h) / 2);
    this.box = { x, y, w, h, scale: k, css: { x: x / dpr, y: y / dpr, w: w / dpr, h: h / dpr } };
    const [rw, rh] = this.toggles.lowRes ? [VIEW_W, VIEW_H] : [w, h];
    // the glow buffer at half size: bloom is a blur, and this pass was a third of the frame (DECISIONS #36)
    this.glowComposer.setSize(Math.ceil(rw / 2), Math.ceil(rh / 2));
    this.composer.setSize(rw, rh);
    this.pixel.uniforms.res.value.set(rw, rh);
  }

  /** Render the glow layer alone: everything else black (it still occludes), no background. */
  private renderGlow() {
    // the glow pass draws the glowing meshes and, in black, only the rooms' shells to hide neon behind
    // a wall: the furniture and the crowd sit it out (they were most of this pass's pixels)
    if (!this.dark) {
      this.dark = [];
      this.skip = [];
      this.scene.traverse((o) => {
        if (!(o instanceof Mesh) || o.layers.isEnabled(GLOW)) return;
        if (o.userData.occluder) this.dark!.push(o);
        else this.skip!.push(o);
      });
    }
    for (const o of this.dark) {
      this.stash.set(o, o.material);
      o.material = this.black;
    }
    const hidden: Mesh[] = [];
    for (const o of this.skip!) if (o.visible) {
      o.visible = false;
      hidden.push(o);
    }
    const bg = this.scene.background;
    this.scene.background = this.bg.set(0x000000);
    this.glowComposer.render();
    this.scene.background = bg;
    for (const [m, mat] of this.stash) m.material = mat;
    this.stash.clear();
    for (const o of hidden) o.visible = true;
    // UnrealBloomPass composites its result back into the composer's read buffer
    this.mix.uniforms.tGlow.value = this.glowComposer.readBuffer.texture;
  }

  /** How drunk the picture is, 0..1 (the pass is off when sober). */
  setDrunk(amount: number, time: number) {
    this.drunk.enabled = amount > 0.002;
    this.drunk.uniforms.amount.value = amount;
    this.drunk.uniforms.time.value = time;
  }

  render() {
    const r = this.renderer;
    this.pixel.uniforms.snap.value = this.toggles.pixel ? 1 : 0;
    this.mix.uniforms.amount.value = this.toggles.bloom ? 1 : 0;
    if (this.toggles.bloom) this.renderGlow();
    else if (!this.mix.uniforms.tGlow.value) this.mix.uniforms.tGlow.value = this.glowComposer.readBuffer.texture;
    r.setRenderTarget(null);
    r.setViewport(0, 0, this.dw, this.dh);
    r.setClearColor(0x000000, 1);
    r.clear();
    r.setScissorTest(true);
    r.setScissor(this.box.x, this.dh - this.box.y - this.box.h, this.box.w, this.box.h);
    r.setViewport(this.box.x, this.dh - this.box.y - this.box.h, this.box.w, this.box.h);
    this.composer.render();
    r.setScissorTest(false);
  }

  /** Map a CSS-pixel point in the canvas to normalized device coordinates in the letterbox. */
  ndc(cssX: number, cssY: number): Vector2 | null {
    const b = this.box.css;
    const u = (cssX - b.x) / b.w, v = (cssY - b.y) / b.h;
    if (u < 0 || v < 0 || u > 1 || v > 1) return null;
    return new Vector2(u * 2 - 1, -(v * 2 - 1));
  }

  /** Where a CSS-pixel point hits a mesh, as the mesh's UV (for table panels). */
  pickUV(mesh: Mesh, cssX: number, cssY: number): Vector2 | null {
    const p = this.ndc(cssX, cssY);
    if (!p) return null;
    this.ray.setFromCamera(p, this.camera);
    const hit = this.ray.intersectObject(mesh, false)[0];
    return hit?.uv ?? null;
  }

  /** Draw calls and triangles of the scene alone (one plain render), for e2e/perf.mjs. */
  measure(): { calls: number; triangles: number } {
    const r = this.renderer;
    const rt = new WebGLRenderTarget(VIEW_W, VIEW_H);
    r.info.autoReset = false;
    r.info.reset();
    r.setRenderTarget(rt);
    r.render(this.scene, this.camera);
    const out = { calls: r.info.render.calls, triangles: r.info.render.triangles };
    r.info.autoReset = true;
    r.setRenderTarget(null);
    rt.dispose();
    return out;
  }

  dispose() {
    this.glowComposer.dispose();
    this.composer.dispose();
    this.bloom.dispose();
    this.mix.dispose();
    this.drunk.dispose();
    this.pixel.dispose();
    this.black.dispose();
    this.renderer.dispose();
  }
}
