/**
 * Brand kit reader.
 *
 * `user.brandKit` is a Prisma `Json` column, so its contents are whatever was
 * last written there — including values from an older shape of the app, or a
 * partially-saved record. The rewrite path feeds `tones` and `banned` straight
 * into the humanizer's system prompt, so a malformed field must degrade to a
 * known-safe default rather than reaching the model as garbage.
 *
 * The empty-list cases matter most: a creator who deliberately cleared their
 * banned words must get an empty list back, not the defaults quietly reinstated.
 */
import { describe, it, expect } from 'vitest';
import { parseBrandKit, DEFAULT_KIT } from './brand-kit';

describe('DEFAULT_KIT', () => {
  it('invents no brand voice', () => {
    // Seeded tones or banned words would steer a rewrite the user never asked
    // for, and would be indistinguishable from their own choices in the UI.
    expect(DEFAULT_KIT.tones).toEqual([]);
    expect(DEFAULT_KIT.banned).toEqual([]);
    expect(DEFAULT_KIT.description).toBe('');
    expect(DEFAULT_KIT.colors).toEqual([]);
    expect(DEFAULT_KIT.logoUrl).toBeNull();
  });

  it('still names concrete fonts, which a picker needs to render', () => {
    expect(DEFAULT_KIT.headingFont).toBeTruthy();
    expect(DEFAULT_KIT.bodyFont).toBeTruthy();
  });
});

describe('parseBrandKit', () => {
  it('returns the defaults for an account that has never saved', () => {
    expect(parseBrandKit(null)).toEqual(DEFAULT_KIT);
    expect(parseBrandKit(undefined)).toEqual(DEFAULT_KIT);
  });

  it('returns the defaults for values that are not an object', () => {
    expect(parseBrandKit('not a kit')).toEqual(DEFAULT_KIT);
    expect(parseBrandKit(42)).toEqual(DEFAULT_KIT);
    expect(parseBrandKit(true)).toEqual(DEFAULT_KIT);
    // An array is an object but never a valid kit.
    expect(parseBrandKit([])).toEqual(DEFAULT_KIT);
    expect(parseBrandKit([{ tones: ['warm'] }])).toEqual(DEFAULT_KIT);
  });

  it('round-trips a fully populated kit', () => {
    const saved = {
      colors: [{ name: 'Ink', hex: '#101014' }],
      headingFont: 'Satoshi',
      bodyFont: 'Sohne',
      tones: ['warm', 'direct'],
      description: 'Plain-spoken, no hype.',
      banned: ['game-changer', 'unlock'],
      logoUrl: 'https://cdn.example.com/logo.png',
    };
    expect(parseBrandKit(saved)).toEqual(saved);
  });

  it('preserves a deliberately emptied list instead of restoring defaults', () => {
    const kit = parseBrandKit({ colors: [], tones: [], banned: [] });
    expect(kit.colors).toEqual([]);
    expect(kit.tones).toEqual([]);
    expect(kit.banned).toEqual([]);
  });

  it('fills in only the fields that are missing', () => {
    const kit = parseBrandKit({ tones: ['authoritative'] });
    expect(kit.tones).toEqual(['authoritative']);
    expect(kit.headingFont).toBe(DEFAULT_KIT.headingFont);
    expect(kit.banned).toEqual([]);
  });

  it('rejects a colour list where any entry is malformed', () => {
    // Partial acceptance would put a colour with no hex into the palette UI.
    expect(parseBrandKit({ colors: [{ name: 'Ink' }] }).colors).toEqual([]);
    expect(parseBrandKit({ colors: [{ hex: '#fff' }] }).colors).toEqual([]);
    expect(parseBrandKit({ colors: ['#fff'] }).colors).toEqual([]);
    expect(
      parseBrandKit({
        colors: [{ name: 'Ink', hex: '#101014' }, null],
      }).colors,
    ).toEqual([]);
  });

  it('rejects a string list containing non-strings', () => {
    expect(parseBrandKit({ tones: ['warm', 7] }).tones).toEqual([]);
    expect(parseBrandKit({ banned: [{ word: 'hype' }] }).banned).toEqual([]);
    expect(parseBrandKit({ tones: 'warm' }).tones).toEqual([]);
  });

  it('treats a blank logo url as no logo', () => {
    // The UI branches on null to show its empty state; '' would render a broken
    // image instead.
    expect(parseBrandKit({ logoUrl: '' }).logoUrl).toBeNull();
    expect(parseBrandKit({ logoUrl: null }).logoUrl).toBeNull();
    expect(parseBrandKit({ logoUrl: 12345 }).logoUrl).toBeNull();
  });

  it('always returns every field, whatever the input', () => {
    const inputs: unknown[] = [null, {}, { tones: null }, 'x', [], { colors: 'red' }];
    for (const input of inputs) {
      const kit = parseBrandKit(input);
      expect(Object.keys(kit).sort()).toEqual(Object.keys(DEFAULT_KIT).sort());
      expect(Array.isArray(kit.colors)).toBe(true);
      expect(Array.isArray(kit.tones)).toBe(true);
      expect(Array.isArray(kit.banned)).toBe(true);
      expect(typeof kit.description).toBe('string');
      expect(typeof kit.headingFont).toBe('string');
      expect(typeof kit.bodyFont).toBe('string');
    }
  });

  it('does not alias the defaults, so a caller mutating the result cannot corrupt them', () => {
    const kit = parseBrandKit(null);
    kit.tones.push('injected');
    expect(DEFAULT_KIT.tones).toEqual([]);
    expect(parseBrandKit(null).tones).toEqual([]);
  });
});
