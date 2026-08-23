/**
 * Trust guardrails.
 *
 * These are the tests that keep the product's central promise honest: Publish
 * never tells a creator their video is guaranteed to be monetized, and never
 * hands back the kind of vague coaching ("make it more engaging") that a working
 * creator cannot act on. Both rules are enforced in code rather than trusted to
 * a prompt, so both are asserted here.
 */
import { describe, it, expect } from 'vitest';
import {
  scrubForbidden,
  toDisplayString,
  conservativeScore,
  riskBand,
  flagGeneric,
  TRUST_SYSTEM_PREAMBLE,
} from './guardrails';

describe('scrubForbidden', () => {
  it('replaces a guarantee with a probability claim', () => {
    const { clean, replaced } = scrubForbidden(
      'This video has guaranteed monetization on YouTube.',
    );
    expect(replaced).toBe(true);
    expect(clean).toContain('high monetization probability');
    expect(clean.toLowerCase()).not.toContain('guaranteed monetization');
  });

  it('softens "will be monetized" into a likelihood', () => {
    const { clean, replaced } = scrubForbidden('Your upload will be monetized.');
    expect(replaced).toBe(true);
    expect(clean).toBe('Your upload is likely to be monetized.');
  });

  it('rewrites a platform-approval claim into an alignment claim', () => {
    const { clean, replaced } = scrubForbidden('This script is approved by YouTube.');
    expect(replaced).toBe(true);
    // The platform name is preserved via the capture group, so the sentence
    // still tells the creator which guidelines were considered.
    expect(clean).toBe('This script is aligned with YouTube published guidelines.');
  });

  it('neutralizes "100% safe" and "completely risk-free"', () => {
    expect(scrubForbidden('It is 100% safe.').clean).toBe('It is low predicted risk.');
    expect(scrubForbidden('Completely risk-free upload.').clean).toBe(
      'low predicted risk upload.',
    );
  });

  it('catches absolute claims that no targeted replacement covers', () => {
    const { clean, replaced } = scrubForbidden('There is no risk of demonetization here.');
    expect(replaced).toBe(true);
    expect(clean).not.toMatch(/no risk of demonetization/i);
  });

  it('leaves honest text untouched and reports that nothing fired', () => {
    const honest =
      'Line 4 names a prescription brand, which triggers the regulated-goods policy. ' +
      'Cut the brand name and describe the category instead.';
    const { clean, replaced } = scrubForbidden(honest);
    expect(replaced).toBe(false);
    expect(clean).toBe(honest);
  });

  it('is idempotent — scrubbing already-clean output changes nothing', () => {
    const once = scrubForbidden('Guaranteed monetization, 100% safe.').clean;
    const twice = scrubForbidden(once);
    expect(twice.replaced).toBe(false);
    expect(twice.clean).toBe(once);
  });

  it('scrubs every occurrence, not just the first', () => {
    const { clean } = scrubForbidden('100% safe today, and 100% safe tomorrow.');
    expect(clean).toBe('low predicted risk today, and low predicted risk tomorrow.');
  });
});

describe('toDisplayString', () => {
  it('passes plain strings through unchanged', () => {
    expect(toDisplayString('A paste-ready hook.')).toBe('A paste-ready hook.');
  });

  it('extracts the payload field when the model returned an object in a string[] slot', () => {
    // Regression: NVIDIA NIM returned { why, hook, expectedImpact } where the
    // schema asked for a string; rendering the object crashed React with
    // "Objects are not valid as a React child".
    const obj = {
      why: 'The greeting spends the AVD-weighted first 3s.',
      hook: 'If your first 5 seconds sound like this, you lose half your viewers.',
      expectedImpact: 'Typically recovers 3-8% of first-30s retention.',
    };
    expect(toDisplayString(obj)).toBe(obj.hook);
  });

  it('falls back to joined prose when no payload field exists', () => {
    expect(toDisplayString({ a: 'one', b: 'two' })).toBe('one — two');
  });

  it('never returns an object — scrubbing an object always yields a string', () => {
    const { clean } = scrubForbidden({ hook: 'A safe hook.', why: 'Because.' });
    expect(typeof clean).toBe('string');
    expect(clean).toContain('A safe hook.');
  });

  it('handles null, numbers, and booleans without throwing', () => {
    expect(toDisplayString(null)).toBe('');
    expect(toDisplayString(42)).toBe('42');
    expect(toDisplayString(true)).toBe('true');
  });
});

describe('conservativeScore', () => {
  it('leaves clearly-safe scores alone', () => {
    expect(conservativeScore(90)).toBe(90);
    expect(conservativeScore(97)).toBe(97);
    expect(conservativeScore(100)).toBe(100);
  });

  it('nudges borderline scores down by band', () => {
    expect(conservativeScore(87)).toBe(84);
    expect(conservativeScore(82)).toBe(80);
    expect(conservativeScore(75)).toBe(71);
    expect(conservativeScore(64)).toBe(60);
  });

  it('never pushes a score below the floor of its own band', () => {
    expect(conservativeScore(80)).toBe(80);
    expect(conservativeScore(70)).toBe(70);
    expect(conservativeScore(60)).toBe(60);
  });

  it('never returns below 30, so a bad review does not read as a total loss', () => {
    expect(conservativeScore(0)).toBe(30);
    expect(conservativeScore(31)).toBe(30);
    expect(conservativeScore(-50)).toBe(30);
  });

  it('clamps and rounds out-of-range input', () => {
    expect(conservativeScore(140)).toBe(100);
    expect(conservativeScore(86.6)).toBe(84); // rounds to 87, then -3
  });

  it('is monotonic — a better raw score never yields a worse result', () => {
    let previous = -1;
    for (let raw = 0; raw <= 100; raw += 1) {
      const scored = conservativeScore(raw);
      expect(scored).toBeGreaterThanOrEqual(previous);
      previous = scored;
    }
  });

  it('never scores higher than the raw input', () => {
    for (let raw = 0; raw <= 100; raw += 1) {
      expect(conservativeScore(raw)).toBeLessThanOrEqual(Math.max(raw, 30));
    }
  });
});

describe('riskBand', () => {
  it('maps the documented thresholds', () => {
    expect(riskBand(100)).toBe('LOW');
    expect(riskBand(85)).toBe('LOW');
    expect(riskBand(84)).toBe('MEDIUM');
    expect(riskBand(65)).toBe('MEDIUM');
    expect(riskBand(64)).toBe('HIGH');
    expect(riskBand(0)).toBe('HIGH');
  });
});

describe('flagGeneric', () => {
  const slop = [
    'Improve your thumbnail for better results.',
    'Optimize your title to rank higher.',
    'Make it more engaging.',
    'Try to be more authentic on camera.',
    'Sound more natural when you read this.',
    'Add emotion to the intro.',
    'Vary your tone throughout.',
    'You need to grab attention in the first second.',
    'Sharpened the hook.',
    'Adjusted the tone for the platform.',
    'Shortened sentences for flow.',
    'Here is the full breakdown.',
    'This is a game-changer.',
    'You won\'t believe what happens next.',
    'We found a loophole in the algorithm.',
    '90% of creators miss this.',
    'Studies show that shorter intros win.',
    'This will get you monetized.',
  ];

  it.each(slop)('flags generic advice: %s', (text) => {
    expect(flagGeneric(text).length).toBeGreaterThan(0);
  });

  const specific = [
    'Line 3 says "prescription-strength" — that phrase triggers YouTube\'s regulated-goods ' +
      'policy. Replace it with "over-the-counter option" to keep the same meaning.',
    'The 0:00–0:04 window opens on a logo sting. Swipe-away happens in the first 3-5 seconds, ' +
      'so cut straight to "I lost $4,000 on this" instead.',
    'Your background track matches "Sunset Drive" in Content ID\'s waveform index. Swap it for ' +
      'a track from the YouTube Audio Library to avoid a claim.',
    'The thumbnail text runs 18px at mobile scale, below the ~24px needed to stay legible in ' +
      'the feed. Raise it and drop the third line.',
  ];

  it.each(specific)('accepts specific, mechanism-driven advice', (text) => {
    expect(flagGeneric(text)).toEqual([]);
  });

  it('returns every distinct phrase it tripped, not just the first', () => {
    const hits = flagGeneric('Improve your thumbnail and make it more engaging.');
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });

  it('does not flag ordinary prose', () => {
    expect(flagGeneric('')).toEqual([]);
    expect(flagGeneric('The report covers four platforms.')).toEqual([]);
  });
});

describe('TRUST_SYSTEM_PREAMBLE', () => {
  it('forbids the absolute claims the scrubber also catches', () => {
    expect(TRUST_SYSTEM_PREAMBLE).toMatch(/do NOT guarantee monetization/);
    expect(TRUST_SYSTEM_PREAMBLE).toMatch(/100% safe/);
  });

  it('instructs the model to state unmeasured layers as unavailable', () => {
    expect(TRUST_SYSTEM_PREAMBLE).toMatch(/UNAVAILABLE, not PASSING/);
  });

  it('tells the model to err toward flagging risk', () => {
    expect(TRUST_SYSTEM_PREAMBLE).toMatch(/err on the side of flagging the risk/);
  });

  it('is a single self-contained instruction block with no unfilled slots', () => {
    // A stray template placeholder here would ship literal "${...}" to the model.
    expect(TRUST_SYSTEM_PREAMBLE).not.toMatch(/\$\{/);
    expect(TRUST_SYSTEM_PREAMBLE).not.toMatch(/TODO|TBD|FIXME/);
  });
});
