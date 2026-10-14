// The palette. Everything the player sees snaps to it: textures are painted in it, the HUD and
// the table panels draw in it, and the pixel pass (src/render3d/pixelpass.ts) quantizes the
// bloomed frame to it. TanoPal 48, picked by the owner after the Milestone 0 neon test
// (DECISIONS #7, #21, #29; STYLE.md). A published Lospec palette; no colors borrowed from a game.
//
// UI and textures never name a hex directly: they name a *role* (C.ink, C.low, ...) and the
// active palette says which of its colors plays it. Tier colors are roles too, so the four tier
// colors are the same everywhere a tier appears (felt trim, sign, panel badge, HUD).

export type PaletteId = 'tano48';

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
  'felt', 'feltLo', 'baize', 'baizeHi', 'baizeLo', 'cream', 'indigo', 'indigoHi', 'pink', 'pinkHi', 'teal', 'wood', 'woodHi', 'woodLo', 'brass', 'brassLo', 'gold', 'blood',
  'soul', 'soulLo', 'marker', 'markerLo', 'carpet', 'carpetLo', 'wall', 'wallHi',
] as const;
export type Role = (typeof ROLES)[number];
export const C = Object.fromEntries(ROLES.map((r, i) => [r, i])) as Record<Role, number>;

const CAST: Record<PaletteId, Record<Role, string>> = {
  tano48: {
    ink: '1f1d1e', night: '303232', smoke: '645c5a', ash: '8c9687', dust: '96918c', bone: 'c8c8b5', white: 'ffffff',
    low: '00e60f', lowHi: 'c4ff91', lowLo: '08b428',
    // mid is cast yellow, not TanoPal's amber f8a004: from 10 m that amber and the high tier's
    // f5320a both read orange (DECISIONS #29)
    mid: 'f0ff00', midHi: 'ffff8e', midLo: 'f8a004',
    high: 'f5320a', highHi: 'f5916e', highLo: 'af000a',
    coll: 'be5aff', collHi: 'e1b6ff', collLo: '801cc0',
    // charcoal felt: TanoPal's felt green lit by a lamp snaps to the low tier's neon green (STYLE.md)
    // the dice tables' tray: a dark baize the owner asked for (DECISIONS #60), far darker than the
    // low tier's neon 00e60f, drawn unlit in the 2D panels so no lamp can push it toward the neon
    baize: '005a20', baizeHi: '287d08', baizeLo: '024637',
    // the main floor's look (DECISIONS #65): cream damask, an indigo carpet with gold and pink,
    // teal accents; none of them a tier's hue
    cream: 'f7c3a0', indigo: '1a0070', indigoHi: '3c1e8e', pink: 'd7198c', pinkHi: 'fa5adc', teal: '05826c',
    felt: '303232', feltLo: '1f1d1e', wood: '642808', woodHi: 'c86900', woodLo: '511806',
    brass: 'f8d280', brassLo: 'c86900', gold: 'f8d280', blood: 'ac0a48',
    soul: '32fad2', soulLo: '0dc8d9', marker: '6e8ef0', markerLo: '5555e6',
    carpet: '410966', carpetLo: '1f1d1e', wall: '303232', wallHi: '645c5a',
  },
};

export const PALETTES: Record<PaletteId, { name: string; colors: string[] }> = {
  tano48: { name: 'TanoPal 48', colors: TANO48 },
};

/** The palette in play (one since the Milestone 0 pick; setPalette stays for a future cast). */
export let activePalette: PaletteId = 'tano48';
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
