// The models built in Blender (STYLE.md, "Pipeline"), loaded once before the app starts and shared by
// everyone who uses them for as long as the page lives (don't dispose them; clone to own one):
// - people.glb (art/people/build_people.py): a kit of rigid body parts each modelled at its joint
//   (npcs.ts and duel.ts place them with no offset), one tint times a vertex mask;
// - tables.glb (art/tables/build_tables.py): the six game tables, one part per material
//   (`<table>_<material>`) round the footprint's middle on the floor, and the stools (room.ts);
// - props.glb (art/props/build_props.py): the crowd's chips, cards and dice (tableplay.ts), one tint
//   times a vertex mask, drawn instanced.
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshLambertMaterial } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** every part in people.glb */
export type PartName =
  | 'pelvis' | 'skirt' | 'torso_coat' | 'torso_dress' | 'shirt_tie' | 'shirt_bow' | 'neckline'
  | 'head' | 'hair_short' | 'hair_long' | 'hair_bun' | 'hair_quiff' | 'hat'
  | 'arm_upper' | 'arm_fore' | 'hand' | 'thigh' | 'shin' | 'shoe' | 'seat' | 'post'
  | 'coll_torso' | 'coll_vest' | 'coll_head' | 'coll_hat' | 'coll_band' | 'coll_arm' | 'coll_hand';

/** the room's flat and textured materials a table part may take (room.ts maps each to its own) */
export const TABLE_MATS = ['wood', 'felt', 'brass', 'brassLo', 'woodLo', 'ink', 'night'] as const;
export type TableMat = (typeof TABLE_MATS)[number];

/** every piece in props.glb */
export type PropName = 'chip' | 'card' | 'die';

const parts = new Map<string, BufferGeometry>();
const tables = new Map<string, BufferGeometry>();
const props = new Map<string, BufferGeometry>();

/** Load the .glb files (call once, before anything builds a person, a room or a table's game). */
export async function loadModels(base = import.meta.env.BASE_URL): Promise<void> {
  if (parts.size) return;
  const loader = new GLTFLoader();
  const load = async (file: string, into: Map<string, BufferGeometry>, tidy: (g: BufferGeometry) => BufferGeometry) => {
    const gltf = await loader.loadAsync(`${base}models/${file}`);
    gltf.scene.traverse((o) => {
      if (o instanceof Mesh) into.set(o.name, tidy(o.geometry as BufferGeometry));
    });
  };
  await Promise.all([load('people.glb', parts, tidyMasked), load('tables.glb', tables, tidyTextured), load('props.glb', props, tidyMasked)]);
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

/**
 * A table's parts by material (each geometry shared: clone it to place it). Throws if the table has
 * none (run art/tables/build_tables.py).
 */
export function tableParts(table: string): { mat: TableMat; geo: BufferGeometry }[] {
  const out = TABLE_MATS.filter((m) => tables.has(`${table}_${m}`)).map((mat) => ({ mat, geo: tables.get(`${table}_${mat}`)! }));
  if (!out.length) throw new Error(`tables.glb has no table "${table}" (run art/tables/build_tables.py)`);
  return out;
}

/** The stool's seat (its top at y 0) or post (1 m tall, from y 0), shared: clone it to place it. */
export function stoolPart(name: 'seat' | 'post'): BufferGeometry {
  const g = tables.get(`stool_${name}`);
  if (!g) throw new Error(`tables.glb has no stool_${name} (run art/tables/build_tables.py)`);
  return g;
}

/** A game piece's geometry, shared (an InstancedMesh's: don't dispose it). */
export function propPart(name: PropName): BufferGeometry {
  const g = props.get(name);
  if (!g) throw new Error(`props.glb has no piece "${name}" (run art/props/build_props.py)`);
  return g;
}

/** A room part: position, normal and uv only, the layout of the code's own shapes (mergeByMaterial needs it). */
function tidyTextured(g: BufferGeometry): BufferGeometry {
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** Every part the same layout (a BatchedMesh needs it): position, normal, an RGB float color; indexed. */
function tidyMasked(g: BufferGeometry): BufferGeometry {
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
