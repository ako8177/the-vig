// Pixel textures: the PNGs drawn by pixel-art/vig-room/build.py (the pixel-art-studio skill),
// one set per candidate palette in public/tex/<palette>/. NearestFilter, no mipmaps, sRGB
// (THREEJS-NOTES rule 6). Switching the palette reloads every texture in place, so materials
// keep their references.
import { NearestFilter, SRGBColorSpace, Texture, TextureLoader, RepeatWrapping } from 'three';
import type { PaletteId } from '../data/palette';

export const TEXTURE_NAMES = [
  'carpet', 'wall', 'felt', 'wood', 'brass', 'ceiling', 'cage', 'door',
  'sign_bandit', 'sign_twentyone', 'sign_hilo', 'sign_wheel', 'sign_redline', 'sign_deadman', 'sign_collector',
] as const;
export type TextureName = (typeof TEXTURE_NAMES)[number];

export class Textures {
  private loader = new TextureLoader();
  readonly tex = new Map<TextureName, Texture>();
  /** every texture requested, for e2e/coverage.mjs */
  readonly requested = new Set<string>();
  ready: Promise<void> = Promise.resolve();

  constructor(palette: PaletteId) {
    for (const n of TEXTURE_NAMES) {
      const t = new Texture();
      t.magFilter = t.minFilter = NearestFilter;
      t.generateMipmaps = false;
      t.colorSpace = SRGBColorSpace;
      t.wrapS = t.wrapT = RepeatWrapping;
      this.tex.set(n, t);
    }
    this.load(palette);
  }

  get(n: TextureName): Texture {
    return this.tex.get(n)!;
  }

  /** Load (or reload) every texture from the palette's set. */
  load(palette: PaletteId) {
    const jobs = TEXTURE_NAMES.map(
      (n) =>
        new Promise<void>((resolve) => {
          const url = `tex/${palette}/${n}.png`;
          this.requested.add(url);
          this.loader.load(
            url,
            (img) => {
              const t = this.tex.get(n)!;
              t.image = img.image;
              t.needsUpdate = true;
              img.dispose();
              resolve();
            },
            undefined,
            () => resolve(),
          );
        }),
    );
    this.ready = Promise.all(jobs).then(() => {});
  }

  dispose() {
    for (const t of this.tex.values()) t.dispose();
    this.tex.clear();
  }
}
