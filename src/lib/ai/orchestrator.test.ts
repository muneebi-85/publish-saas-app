import { describe, it, expect } from 'vitest';
import { headlineWeightedScore } from './orchestrator';

/**
 * Regression tests for the null-aware headline weighting.
 *
 * The historical bug: the divisor was inverted between the two branches. With
 * the hook MEASURED the divisor was 0.85 (inflating every fully-scored report
 * by ~18%: five 80s printed 94/Excellent while every layer tile showed 80);
 * with the hook unmeasured the divisor was 1.0 (capping a perfect video at 85).
 * Both fixed by dividing by the sum of the coefficients actually used.
 */
describe('headlineWeightedScore', () => {
  const layers = (over: Partial<Parameters<typeof headlineWeightedScore>[0]> = {}) => ({
    monetization: 80,
    copyright: 80,
    hook: 80,
    authenticity: 80,
    seo: 80,
    brandSafety: 80,
    ...over,
  });

  it('returns the plain weighted average when every layer is measured', () => {
    expect(headlineWeightedScore(layers())).toBe(80);
  });

  it('does not inflate a fully-measured report (the old bug printed 94 for all-80)', () => {
    const s = headlineWeightedScore(layers());
    expect(s).toBe(80);
    expect(s).toBeLessThan(88); // the inflated value was 80/0.85 = 94
  });

  it('redistributes the hook weight across remaining layers when the hook is null', () => {
    // Five layers all 80: (80*.30 + 80*.20 + 0 + 80*.15 + 80*.10 + 80*.10) / 0.85 = 80
    const s = headlineWeightedScore(layers({ hook: null }));
    expect(s).toBe(80);
  });

  it('does not cap a perfect hookless report below 100 (the old bug capped it at 85)', () => {
    const perfect = layers({ hook: null, monetization: 100, copyright: 100, authenticity: 100, seo: 100, brandSafety: 100 });
    expect(headlineWeightedScore(perfect)).toBe(100);
  });

  it('a null hook neither drags the score down nor inflates it', () => {
    // Hook 0 (measured, terrible) vs hook null (unmeasured) must differ: the
    // measured 0 costs real points, the null is simply excluded.
    const withZeroHook = headlineWeightedScore(layers({ hook: 0 }));
    const withNullHook = headlineWeightedScore(layers({ hook: null }));
    expect(withZeroHook).toBeLessThan(withNullHook);
    expect(withZeroHook).toBe(Math.round((80 * 0.85) / 1)); // 68
    expect(withNullHook).toBe(80);
  });

  it('weights are the documented ones (30/20/15/15/10/10)', () => {
    const s = headlineWeightedScore({
      monetization: 100,
      copyright: 0,
      hook: 0,
      authenticity: 0,
      seo: 0,
      brandSafety: 0,
    });
    expect(s).toBe(Math.round(100 * 0.3));
  });

  it('scorePotential path: a lifted layer can raise the projected headline', () => {
    // Same shape the scorePotential projection feeds in: fixable layers lifted to 88.
    const now = headlineWeightedScore(layers({ monetization: 50 }));
    const projected = headlineWeightedScore(layers({ monetization: 88 }));
    expect(projected).toBeGreaterThan(now);
  });
});
