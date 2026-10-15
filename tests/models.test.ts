// The Blender-built models against the data and the budgets (STYLE.md, "Pipeline"; THREEJS-NOTES
// rule 11): every game table in floors.ts has a model that fits its footprint (what you bump into is
// what you see), every part names a material room.ts knows, and each table stays under 1.5k triangles.
// Reads the .glb's JSON chunk only (positions' bounds and index counts), so no loader is needed.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FLOOR_1 } from '../src/data/floors';
import { TABLE_MATS } from '../src/render3d/models';

interface Gltf {
  nodes: { name: string; mesh?: number; rotation?: number[]; translation?: number[]; scale?: number[] }[];
  meshes: { primitives: { attributes: Record<string, number>; indices?: number }[] }[];
  accessors: { count: number; min?: number[]; max?: number[] }[];
}

function glb(file: string): Map<string, { min: number[]; max: number[]; tris: number; attrs: string[] }> {
  const buf = readFileSync(`public/models/${file}`);
  const len = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + len).toString('utf8')) as Gltf;
  const out = new Map<string, { min: number[]; max: number[]; tris: number; attrs: string[] }>();
  for (const n of json.nodes) {
    if (n.mesh === undefined) continue;
    // parts are modelled in place: no node transform to undo
    expect(n.rotation ?? [0, 0, 0, 1], n.name).toEqual([0, 0, 0, 1]);
    expect(n.translation ?? [0, 0, 0], n.name).toEqual([0, 0, 0]);
    const pr = json.meshes[n.mesh].primitives;
    const pos = pr.map((p) => json.accessors[p.attributes.POSITION]);
    out.set(n.name, {
      min: [0, 1, 2].map((k) => Math.min(...pos.map((a) => a.min![k]))),
      max: [0, 1, 2].map((k) => Math.max(...pos.map((a) => a.max![k]))),
      tris: pr.reduce((s, p) => s + (p.indices !== undefined ? json.accessors[p.indices].count : json.accessors[p.attributes.POSITION].count) / 3, 0),
      attrs: Object.keys(pr[0].attributes).sort(),
    });
  }
  return out;
}

describe('tables.glb', () => {
  const parts = glb('tables.glb');

  it('names only materials room.ts maps, and carries the attributes the merge needs', () => {
    for (const [name, p] of parts) {
      const mat = name.slice(name.indexOf('_') + 1);
      if (!name.startsWith('stool_')) expect(TABLE_MATS as readonly string[], name).toContain(mat);
      expect(p.attrs, name).toEqual(['NORMAL', 'POSITION', 'TEXCOORD_0']);
    }
    expect(parts.has('stool_seat') && parts.has('stool_post')).toBe(true);
  });

  for (const t of FLOOR_1.tables) {
    it(`${t.table}: fits its footprint and its budget`, () => {
      const mine = [...parts].filter(([n]) => n.startsWith(`${t.table}_`)).map(([, p]) => p);
      expect(mine.length).toBeGreaterThan(0);
      const minX = Math.min(...mine.map((p) => p.min[0])), maxX = Math.max(...mine.map((p) => p.max[0]));
      const minZ = Math.min(...mine.map((p) => p.min[2])), maxZ = Math.max(...mine.map((p) => p.max[2]));
      // within 5 cm of the collider (a cabinet's cheeks stand 5 cm proud of its face)
      expect(maxX).toBeLessThanOrEqual(t.w / 2 + 0.05);
      expect(minX).toBeGreaterThanOrEqual(-t.w / 2 - 0.05);
      expect(maxZ).toBeLessThanOrEqual(t.d / 2 + 0.05);
      expect(minZ).toBeGreaterThanOrEqual(-t.d / 2 - 0.05);
      // and fills it: no table shrank inside its collider
      expect(maxX - minX).toBeGreaterThan(t.w - 0.1);
      expect(maxZ - minZ).toBeGreaterThan(t.d - 0.1);
      // on the floor, its felt at the table's height
      expect(Math.min(...mine.map((p) => p.min[1]))).toBeCloseTo(0, 3);
      if (t.table !== 'bandit') expect(Math.max(...mine.map((p) => p.max[1]))).toBeLessThan(t.h + 0.15);
      expect(mine.reduce((s, p) => s + p.tris, 0) + parts.get('stool_seat')!.tris + parts.get('stool_post')!.tris).toBeLessThanOrEqual(1500);
    });
  }
});

describe('props.glb', () => {
  const parts = glb('props.glb');
  it('has the crowd\'s pieces, masked, and none dearer than the shapes they replaced', () => {
    // the code's own: an 8-sided cylinder (32 triangles), a box (12) for a card; a die was a box
    // too and its pips cost 42 more (eight dice on the whole floor at most)
    const was = { chip: 32, card: 12, die: 60 };
    for (const [name, max] of Object.entries(was)) {
      const p = parts.get(name);
      expect(p, name).toBeDefined();
      expect(p!.attrs, name).toContain('COLOR_0');
      expect(p!.tris, name).toBeLessThanOrEqual(max);
    }
  });
});
