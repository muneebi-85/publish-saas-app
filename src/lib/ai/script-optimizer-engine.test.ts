import { describe, it, expect } from 'vitest';
import { analyzeScriptText } from './script-optimizer-engine';

const signal = (report: ReturnType<typeof analyzeScriptText>, key: string) =>
  report.signals.find((s) => s.key === key)!;

const BASE =
  'Welcome back to the channel. Today we break down a topic step by step, because the details matter. ' +
  'But first, here is the context you need. So let me walk you through the setup, then the result. ' +
  'That is when everything changed. Imagine the difference this makes for your workflow and your results. ';

describe('MONEY_RISK root matching (regression: inflections must count)', () => {
  it('scores "killing"/"suicides" as advertiser-risk (old whole-word matcher saw 0 hits)', () => {
    const violent = analyzeScriptText({
      scriptText: `${BASE}There were three killings in the report and multiple suicides mentioned in the data.`,
    });
    const safe = analyzeScriptText({ scriptText: BASE });
    const riskSig = signal(violent, 'monetization-risk');
    const safeSig = signal(safe, 'monetization-risk');
    expect(riskSig.score ?? 100).toBeLessThan(safeSig.score ?? 0);
    expect(riskSig.finding).toContain('sensitive topic terms');
  });

  it('does not root-fire on mid-word false positives (Essex stays clean)', () => {
    // \bsex does not match "Essex" (the 's' is mid-word, no boundary before it).
    const essex = analyzeScriptText({ scriptText: `${BASE}We traveled through Essex last summer and filmed everything.` });
    const base = analyzeScriptText({ scriptText: BASE });
    expect(signal(essex, 'monetization-risk').score ?? 0).toBe(signal(base, 'monetization-risk').score ?? 0);
  });
});

describe('CTA window agrees with its copy (regression: 30% window, "final 30%" text)', () => {
  const tail = 'If this helped, subscribe so the next breakdown finds you.';
  // Real words, not spaces — analyzeScriptText trims the input, so space
  // padding vanishes and moves the cut. This sentence carries no CTA markers.
  const filler =
    'Welcome back to the channel. Today we break down one topic step by step, because the details matter. ' +
    'But first, here is the context you need to follow along with every part of this breakdown. ' +
    'So let me walk you through the setup, then the middle, then the result of the whole thing. ';

  it('a CTA just before the final 30% is excluded and the finding names the final 30%', () => {
    // The CTA sits BEFORE the final-30% window — the old copy told the
    // creator to move it into the "final third" where it already was.
    const early = analyzeScriptText({ scriptText: tail + filler });
    const sig = signal(early, 'cta');
    expect(sig.finding).toContain('none in the final 30%');
  });

  it('a CTA inside the final 30% counts as in the final stretch', () => {
    const late = analyzeScriptText({ scriptText: filler + tail });
    const sig = signal(late, 'cta');
    expect(sig.finding).not.toContain('none in the final 30%');
    expect(sig.finding).toContain('final stretch');
  });
});
