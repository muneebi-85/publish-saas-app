/**
 * Keyword-gap analysis tests.
 *
 * The gap computation is the SEO layer's one deterministic measurement —
 * everything else in that panel is a model opinion. These tests pin the
 * behavior that makes it trustworthy: real terms from the script, honest
 * nulls when there is nothing to measure, and no false coverage.
 */
import { describe, it, expect } from 'vitest';
import { computeKeywordGaps } from './seo-engine';

/** Repeat a term `n` times inside filler so it clears the min-count bar. */
const scriptWith = (term: string, n: number) =>
  Array.from({ length: n }, (_, i) => `Segment ${i}: the ${term} matters here because the ${term} decides the outcome.`).join(' ');

describe('computeKeywordGaps', () => {
  it('flags a term the script repeats but the title never names', () => {
    const gaps = computeKeywordGaps({
      scriptText: scriptWith('thumbnail testing', 6),
      title: 'My video about design',
      description: '',
      tags: [],
    });
    expect(gaps).not.toBeNull();
    expect(gaps!.length).toBeGreaterThan(0);
    const term = gaps!.find((g) => g.term.includes('thumbnail'));
    expect(term).toBeDefined();
    expect(term!.inTitle).toBe(false);
    expect(term!.scriptCount).toBeGreaterThanOrEqual(6);
  });

  it('skips a term the title already covers verbatim', () => {
    const gaps = computeKeywordGaps({
      scriptText: scriptWith('retention curve', 6),
      title: 'Fixing your retention curve',
      description: '',
      tags: [],
    });
    // The exact term is fully covered by the title, so it is not a gap —
    // anything left in the list is a *different* term the title missed.
    expect(gaps!.some((g) => g.term === 'retention curve')).toBe(false);
  });

  it('counts description coverage separately from title coverage', () => {
    const gaps = computeKeywordGaps({
      scriptText: scriptWith('audience retention', 6),
      title: 'Something else entirely',
      description: 'Notes about audience retention.',
      tags: [],
    });
    // Whichever term surfaces, the point under test: not in the title,
    // covered by the description.
    const descCovered = gaps!.find((g) => g.inDescription && !g.inTitle);
    expect(descCovered).toBeDefined();
    expect(['audience', 'retention', 'audience retention']).toContain(descCovered!.term);
  });

  it('returns null for a short script — not measured, never zero', () => {
    expect(
      computeKeywordGaps({
        scriptText: 'too short',
        title: 'Any title',
        description: '',
        tags: [],
      }),
    ).toBeNull();
  });

  it('returns null when no script was supplied', () => {
    expect(
      computeKeywordGaps({ scriptText: '', title: 'Any title', description: '', tags: [] }),
    ).toBeNull();
  });

  it('drops filler words — a script of connectives and hedges surfaces nothing', () => {
    const filler = Array.from({ length: 10 }, (_, i) => `Basically gonna really actually thing segment ${i}`).join('. ');
    const gaps = computeKeywordGaps({
      scriptText: filler,
      title: 'Any',
      description: '',
      tags: [],
    });
    expect(gaps).toBeNull();
  });

  it('respects the limit', () => {
    const many = Array.from({ length: 12 }, (_, i) => `Topic number ${i} topic number ${i} topic number ${i} topic number ${i}.`).join(' ');
    const gaps = computeKeywordGaps({
      scriptText: many,
      title: 'none of these',
      description: '',
      tags: [],
      limit: 3,
    });
    expect(gaps!.length).toBeLessThanOrEqual(3);
  });
});
