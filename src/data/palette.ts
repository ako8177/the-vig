// The palettes. Everything the player sees snaps to one of these: textures are painted in it,
// the HUD and the table panels draw in it, and the pixel pass (src/render3d/pixelpass.ts)
// quantizes the bloomed frame to it. Two candidates until the Milestone 0 neon test picks one
// (DECISIONS #7, STYLE.md once written). Both are published Lospec palettes; no colors are
// borrowed from another game.
//
// UI and textures never name a hex directly: they name a *role* (C.ink, C.low, ...) and the
// active palette says which of its colors plays it. Tier colors are roles too, so the four tier
// colors are the same everywhere a tier appears (felt trim, sign, panel badge, HUD).

export type PaletteId = 'r64' | 'r64teal' | 'tano48';

/** Resurrect 64 by Kerrie Lake (lospec.com/palette-list/resurrect-64): warm, muted, a true violet. */
const R64 = [
  '2e222f', '3e3546', '625565', '966c6c', 'ab947a', '694f62', '7f708a', '9babb2', 'c7dcd0', 'ffffff',
  '6e2727', 'b33831', 'ea4f36', 'f57d4a', 'ae2334', 'e83b3b', 'fb6b1d', 'f79617', 'f9c22b', '7a3045',
  '9e4539', 'cd683d', 'e6904e', 'fbb954', '4c3e24', '676633', 'a2a947', 'd5e04b', 'fbff86', '165a4c',
  '239063', '1ebc73', '91db69', 'cddf6c', '313638', '374e4a', '547e64', '92a984', 'b2ba90', '0b5e65',
  '0b8a8f', '0eaf9b', '30e1b9', '8ff8e2', '323353', '484a77', '4d65b4', '4d9be6', '8fd3ff', '45293f',
  '6b3e75', '905ea9', 'a884f3', 'eaaded', '753c54', 'a24b6f', 'cf657f', 'ed8099', '831c5d', 'c32454',
  'f04f78', 'f68181', 'fca790', 'fdcbb0',
];

/** TanoPal 48 (lospec.com/palette-list/tanopal-48): saturated, hot neons, near-black darks. */
const TANO48 = [
  '000000', '303232', '8c9687', 'ffffff', '1f1d1e', '645c5a', '96918c', 'c8c8b5', 'ac0a48', 'd7198c',
  'fa5adc', 'ffb6f5', 'af000a', 'f5320a', 'f5916e', 'f7c3a0', '511806', 'ff6e14', 'f8a004', 'f8d280',
  '642808', 'c86900', 'f0ff00', 'ffff8e', '287d08', '6cc20e', '84f408', 'c4ff82', '005a20', '08b428',
  '00e60f', 'c4ff91', '024637', '05826c', '2adc87', 'a8ffb9', '1a0070', '142ad0', '0dc8d9', '32fad2',
  '3c1e8e', '5555e6', '6e8ef0', 'aac0fc', '410966', '801cc0', 'be5aff', 'e1b6ff',
];

/** The roles, in a fixed order. `C.x` is a role's index. */
const ROLES = [
  'ink', 'night', 'smoke', 'ash', 'dust', 'bone', 'white',
  'low', 'lowHi', 'lowLo', 'mid', 'midHi', 'midLo', 'high', 'highHi', 'highLo', 'coll', 'collHi', 'collLo',
  'felt', 'feltLo', 'wood', 'woodHi', 'woodLo', 'brass', 'brassLo', 'gold', 'blood',
  'soul', 'soulLo', 'marker', 'markerLo', 'carpet', 'carpetLo', 'wall', 'wallHi',
] as const;
export type Role = (typeof ROLES)[number];
export const C = Object.fromEntries(ROLES.map((r, i) => [r, i])) as Record<Role, number>;

const CAST: Record<PaletteId, Record<Role, string>> = {
  r64: {
    ink: '2e222f', night: '3e3546', smoke: '625565', ash: '7f708a', dust: '9babb2', bone: 'c7dcd0', white: 'ffffff',
    low: '1ebc73', lowHi: '91db69', lowLo: '239063',
    mid: 'f9c22b', midHi: 'fbff86', midLo: 'f79617',
    high: 'e83b3b', highHi: 'f68181', highLo: 'ae2334',
    coll: 'a884f3', collHi: 'eaaded', collLo: '6b3e75',
    felt: '165a4c', feltLo: '313638', wood: '6e2727', woodHi: '9e4539', woodLo: '45293f',
    brass: 'fbb954', brassLo: 'cd683d', gold: 'fbb954', blood: 'ae2334',
    soul: '8ff8e2', soulLo: '30e1b9', marker: '8fd3ff', markerLo: '4d9be6',
    carpet: '7a3045', carpetLo: '45293f', wall: '3e3546', wallHi: '625565',
  },
  // Resurrect 64 again, with the low tier cast teal: under bloom R64's green drifts to lime and
  // reads as amber from 10 m; teal blooms toward cyan and can't be mistaken for mid. Souls move
  // to pale bone (teal is taken), markers to the deeper blue.
  r64teal: {
    ink: '2e222f', night: '3e3546', smoke: '625565', ash: '7f708a', dust: '9babb2', bone: 'c7dcd0', white: 'ffffff',
    low: '30e1b9', lowHi: '8ff8e2', lowLo: '0eaf9b',
    mid: 'f9c22b', midHi: 'fbff86', midLo: 'f79617',
    high: 'e83b3b', highHi: 'f68181', highLo: 'ae2334',
    coll: 'a884f3', collHi: 'eaaded', collLo: '6b3e75',
    felt: '165a4c', feltLo: '313638', wood: '6e2727', woodHi: '9e4539', woodLo: '45293f',
    brass: 'fbb954', brassLo: 'cd683d', gold: 'fbb954', blood: 'ae2334',
    soul: 'c7dcd0', soulLo: '9babb2', marker: '8fd3ff', markerLo: '4d65b4',
    carpet: '7a3045', carpetLo: '45293f', wall: '3e3546', wallHi: '625565',
  },
  tano48: {
    ink: '1f1d1e', night: '303232', smoke: '645c5a', ash: '8c9687', dust: '96918c', bone: 'c8c8b5', white: 'ffffff',
    low: '00e60f', lowHi: 'c4ff91', lowLo: '08b428',
    mid: 'f8a004', midHi: 'f8d280', midLo: 'c86900',
    high: 'f5320a', highHi: 'f5916e', highLo: 'af000a',
    coll: 'be5aff', collHi: 'e1b6ff', collLo: '801cc0',
    felt: '005a20', feltLo: '024637', wood: '642808', woodHi: 'c86900', woodLo: '511806',
    brass: 'f8d280', brassLo: 'c86900', gold: 'f8d280', blood: 'ac0a48',
    soul: '32fad2', soulLo: '0dc8d9', marker: '6e8ef0', markerLo: '5555e6',
    carpet: '410966', carpetLo: '1f1d1e', wall: '303232', wallHi: '645c5a',
  },
};

export const PALETTES: Record<PaletteId, { name: string; colors: string[] }> = {
  r64: { name: 'Resurrect 64', colors: R64 },
  r64teal: { name: 'Resurrect 64, teal low tier', colors: R64 },
  tano48: { name: 'TanoPal 48', colors: TANO48 },
};

/** The palette in play. Swapped by setPalette (the neon test); STYLE.md will fix it. */
export let activePalette: PaletteId = 'r64';
/** role index -> '#rrggbb' in the active palette */
export const PALETTE: string[] = ROLES.map((r) => '#' + CAST[activePalette][r]);

export function setPalette(id: PaletteId) {
  activePalette = id;
  ROLES.forEach((r, i) => (PALETTE[i] = '#' + CAST[id][r]));
  rgbaCache.clear();
}

/** The active palette's colors as [r, g, b] 0..255 (for the pixel pass's lookup table). */
export function paletteRGB(id: PaletteId = activePalette): [number, number, number][] {
  return PALETTES[id].colors.map((h) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]);
}

/** A role's color as a 0xrrggbb number (for three.js materials). */
export function hexOf(role: number): number {
  return parseInt(PALETTE[role].slice(1), 16);
}

const rgbaCache = new Map<string, string>();
export function rgba(role: number, a: number): string {
  const k = role + ':' + a;
  let s = rgbaCache.get(k);
  if (!s) {
    const h = PALETTE[role];
    s = `rgba(${parseInt(h.slice(1, 3), 16)},${parseInt(h.slice(3, 5), 16)},${parseInt(h.slice(5, 7), 16)},${a})`;
    rgbaCache.set(k, s);
  }
  return s;
}

/** The four tiers and their color roles (THREEJS-NOTES rule 6; PLAN pillar 5). */
export type Tier = 'low' | 'mid' | 'high' | 'coll';
export const TIER_ROLE: Record<Tier, { base: number; hi: number; lo: number }> = {
  low: { base: C.low, hi: C.lowHi, lo: C.lowLo },
  mid: { base: C.mid, hi: C.midHi, lo: C.midLo },
  high: { base: C.high, hi: C.highHi, lo: C.highLo },
  coll: { base: C.coll, hi: C.collHi, lo: C.collLo },
};
export const TIER_NAME: Record<Tier, string> = { low: 'LOW', mid: 'MID', high: 'HIGH', coll: 'COLLECTOR' };
