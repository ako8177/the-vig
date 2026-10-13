import { describe, expect, it } from 'vitest';
import { findIssues, AuditRec } from '../src/ui/audit';

let seq = 0;
const text = (s: string, x: number, y: number, w: number, extra: Partial<AuditRec> = {}): AuditRec => ({ kind: 'text', s, x, y, w, h: 9, layer: 'ui', seq: seq++, ...extra });
const box = (kind: AuditRec['kind'], x: number, y: number, w: number, h: number, extra: Partial<AuditRec> = {}): AuditRec => ({ kind, x, y, w, h, layer: 'ui', seq: seq++, ...extra });
const screen = { w: 640, h: 360 };
const types = (recs: AuditRec[]) => findIssues(recs, screen).map((i) => i.type);

describe('ui audit', () => {
  it('passes a clean layout', () => {
    const recs = [box('panel', 10, 10, 200, 100), text('Hello', 20, 20, 30), text('World', 20, 30, 30), box('button', 20, 50, 80, 20), text('OK', 50, 56, 12)];
    expect(findIssues(recs, screen)).toEqual([]);
  });

  it('finds texts drawn on top of each other', () => {
    expect(types([text('The Vig', 100, 20, 60), text('$', 150, 24, 8)])).toEqual(['clash']);
  });

  it('ignores lines that only touch, and the same text drawn twice', () => {
    expect(types([text('one', 10, 10, 30), text('two', 10, 19, 30), text('dup', 50, 50, 20), text('dup', 50, 50, 20)])).toEqual([]);
  });

  it('finds text running out of its button', () => {
    const issues = findIssues([box('button', 10, 10, 40, 16), text('Place a bet of $300', 12, 14, 90)], screen);
    expect(issues.map((i) => i.type)).toEqual(['overflow']);
    expect(issues[0].other).toBe('button 40x16');
  });

  it('uses the topmost container under the text', () => {
    const recs = [box('panel', 0, 0, 300, 200), box('panel', 10, 10, 50, 20), text('too long for the inner box', 12, 14, 120)];
    expect(types(recs)).toEqual(['overflow']);
    // a small panel drawn earlier and then covered by a window is not the text's container
    const recs2 = [box('panel', 100, 20, 200, 20), box('panel', 50, 30, 300, 200), text('window text', 120, 34, 60)];
    expect(types(recs2)).toEqual([]);
  });

  it('does not call text hidden under a later panel a clash with text on that panel', () => {
    const issues = findIssues([text('a toast under the panel', 100, 30, 150), box('panel', 50, 25, 300, 200), text('Hi-Lo', 150, 30, 40)], screen);
    expect(issues.map((i) => i.type)).toEqual(['covered']);
  });

  it('finds text painted over by something drawn later', () => {
    expect(types([text('Tip: E to sit at a table', 200, 30, 140), box('panel', 270, 25, 100, 20)])).toEqual(['covered']);
  });

  it('ignores hover tooltips and the parts of text hidden by a clip', () => {
    const recs = [
      text('bet label', 10, 10, 50),
      box('fill', 0, 0, 100, 40, { layer: 'tip' }),
      text('tooltip line', 10, 10, 60, { layer: 'tip' }),
      text('scrolled away', 10, 100, 60, { clip: { x: 0, y: 0, w: 100, h: 50 } }),
      text('scrolled away too', 10, 100, 60, { clip: { x: 0, y: 0, w: 100, h: 50 } }),
    ];
    expect(findIssues(recs, screen)).toEqual([]);
  });
});
