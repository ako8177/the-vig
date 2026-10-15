// The models built in Blender (STYLE.md, "Pipeline"): art/people/build_people.py writes
// public/models/people.glb, a kit of rigid body parts each modelled at its joint (npcs.ts and
// duel.ts place them with no offset). Loaded once before the app starts; the parts are shared by
// everyone who uses them and live as long as the page.
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshLambertMaterial } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** every part in people.glb */
export type PartName =
  | 'pelvis' | 'skirt' | 'torso_coat' | 'torso_dress' | 'shirt_tie' | 'shirt_bow' | 'neckline'
  | 'head' | 'hair_short' | 'hair_long' | 'hair_bun' | 'hair_quiff' | 'hat'
  | 'arm_upper' | 'arm_fore' | 'hand' | 'thigh' | 'shin' | 'shoe' | 'seat' | 'post'
  | 'coll_torso' | 'coll_vest' | 'coll_head' | 'coll_hat' | 'coll_band' | 'coll_arm' | 'coll_hand';

const parts = new Map<string, BufferGeometry>();

/** Load people.glb (call once, before anything builds a person). */
export async function loadModels(base = import.meta.env.BASE_URL): Promise<void> {
  if (parts.size) return;
  const gltf = await new GLTFLoader().loadAsync(`${base}models/people.glb`);
  gltf.scene.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    parts.set(o.name, tidy(o.geometry as BufferGeometry));
  });
}

/** A part's geometry, shared: don't dispose it. */
export function part(name: PartName): BufferGeometry {
  const g = parts.get(name);
  if (!g) throw new Error(`people.glb has no part "${name}" (run art/people/build_people.py)`);
  return g;
}

/**
 * The material for a kit part: Lambert, flat-shaded (the low-poly facets catch the lamps), its
 * vertex colors the part's mask (1 takes the tint, darker shades it: eyes, a mouth, a tie).
 */
export function partMaterial(color = 0xffffff): MeshLambertMaterial {
  return new MeshLambertMaterial({ color, vertexColors: true, flatShading: true });
}

/** Every part the same layout (a BatchedMesh needs it): position, normal, an RGB float color; indexed. */
function tidy(g: BufferGeometry): BufferGeometry {
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'color') g.deleteAttribute(name);
  const c = g.getAttribute('color');
  const n = g.getAttribute('position').count;
  const rgb = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    rgb[i * 3] = c ? c.getX(i) : 1;
    rgb[i * 3 + 1] = c ? c.getY(i) : 1;
    rgb[i * 3 + 2] = c ? c.getZ(i) : 1;
  }
  g.setAttribute('color', new Float32BufferAttribute(rgb, 3));
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  if (!g.index) {
    const idx = new Uint16Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(Array.from(idx));
  }
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}
