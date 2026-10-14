// The playlist compiles (the notation is checked bar by bar) and every song has notes in it.
import { describe, expect, it } from 'vitest';
import { SONGS } from '../src/engine/audio/songs';

describe('music', () => {
  it('every song compiles and plays something', () => {
    expect(SONGS.length).toBeGreaterThan(0);
    for (const s of SONGS) {
      expect(s.events.length, s.id).toBeGreaterThan(50);
      expect(s.length, s.id).toBeGreaterThan(0);
    }
  });
});
