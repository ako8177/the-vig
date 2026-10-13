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
  readonly pixel: ShaderPass;
  toggles: PassToggles = { bloom: true, pixel: true, lowRes: true };
  box: Letterbox = { x: 0, y: 0, w: VIEW_W, h: VIEW_H, scale: 1, css: { x: 0, y: 0, w: VIEW_W, h: VIEW_H } };
  private ray = new Raycaster();
  private dw = 0;
  private dh = 0;
  private black = new MeshBasicMaterial({ color: 0x000000 });
  private stash = new Map<Mesh, Material | Material[]>();
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

  /** Mark an object (and its children) as glowing. */
  static glow(o: Object3D) {
    o.traverse((c) => c.layers.enable(GLOW));
  }

  /** Fit the window: whole-number scale of 640×360, centered, black bars. */
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const ch = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (cw !== this.dw || ch !== this.dh) {
      this.renderer.setSize(cw, ch, false);
      this.dw = cw;
      this.dh = ch;
    }
    const k = Math.max(1, Math.floor(Math.min(cw / VIEW_W, ch / VIEW_H)));
    // a window smaller than 640x360 still gets the whole picture, scaled down to fit
    const w = Math.min(cw, VIEW_W * k), h = Math.min(ch, VIEW_H * k);
    const x = Math.floor((cw - w) / 2), y = Math.floor((ch - h) / 2);
    this.box = { x, y, w, h, scale: k, css: { x: x / dpr, y: y / dpr, w: w / dpr, h: h / dpr } };
    const [rw, rh] = this.toggles.lowRes ? [VIEW_W, VIEW_H] : [w, h];
    this.glowComposer.setSize(rw, rh);
    this.composer.setSize(rw, rh);
    this.pixel.uniforms.res.value.set(rw, rh);
  }

  /** Render the glow layer alone: everything else black (it still occludes), no background. */
  private renderGlow() {
    this.scene.traverse((o) => {
      if (o instanceof Mesh && !o.layers.isEnabled(GLOW)) {
        this.stash.set(o, o.material);
        o.material = this.black;
      }
    });
    const bg = this.scene.background;
    this.scene.background = this.bg.set(0x000000);
    this.glowComposer.render();
    this.scene.background = bg;
    for (const [m, mat] of this.stash) m.material = mat;
    this.stash.clear();
    // UnrealBloomPass composites its result back into the composer's read buffer
    this.mix.uniforms.tGlow.value = this.glowComposer.readBuffer.texture;
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
    this.pixel.dispose();
    this.black.dispose();
    this.renderer.dispose();
  }
}
