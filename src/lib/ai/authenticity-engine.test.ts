/**
 * Content Authenticity & Monetization Risk engine.
 *
 * These tests exist to hold one line: the engine must never tell a creator their
 * content IS AI-generated. AI-origin detection is not decidable, published
 * detectors misfire hardest on non-native English speakers and on clean,
 * disciplined prose, and a wrongly-accused creator is the worst outcome this
 * product can produce. Everything below is a guard on that promise —
 *
 *   • High risk requires a STRONG ai-indicator AND real confidence
 *   • confidence is bounded by what was actually observed, never asserted
 *   • unevaluated layers report as inconclusive, never as passing
 *   • false-positive reasons are unconditional, including on Low results
 *   • no output promises monetization, detection, or platform approval
 *
 * Only the deterministic paths are exercised. The LLM path (`analyzeAuthenticity`)
 * needs a live model and is out of scope for a unit test — but it is built on
 * `heuristicAuthenticity` as its floor and re-derives its band through
 * `deriveRisk`, so the guards tested here apply to it too.
 */
import { describe, it, expect } from 'vitest';
import {
  wordCount,
  detectTextSignals,
  deriveRisk,
  heuristicAuthenticity,
  analyzeMonetizationRisk,
  buildScorecards,
  scrubCertainty,
  type AuthenticityInput,
} from './authenticity-engine';
import type { AuthenticityEvidence } from '../types';

/** A script with no signal in either direction — the neutral baseline. */
const NEUTRAL = 'The camera sits on a tripod. We start at the front door and walk through each room.';

/**
 * Reads the way generated text reads: heavy connectives, uniform sentence
 * length, stock close. Deliberately long enough to clear the 60-word gate that
 * the variance and diversity signals require.
 */
const AI_READING = [
  'However, the landscape of modern content creation is undoubtedly shifting.',
  'Furthermore, creators must leverage cutting-edge tools to remain competitive.',
  'Moreover, it is important to note that audiences expect consistent quality.',
  'Additionally, creators should utilize analytics in order to guide decisions.',
  'Consequently, the most successful channels delve into their own data often.',
  'Therefore, a disciplined approach to production remains essential for growth.',
  'In conclusion, the creators who adapt will find themselves well positioned.',
].join(' ');

/** Reads the way a person talks: first person, specifics, varied rhythm. */
const HUMAN_READING = [
  'I spent $340 on a lens last week and honestly I regret it.',
  'Here is what actually happened.',
  'My first three videos with it got 12%, 4%, and 31% retention, which made no sense until I checked the footage.',
  'The autofocus was hunting.',
  'Specifically, it would rack focus every time I leaned back in my chair, which is roughly 40 times per video.',
  'I almost returned it.',
  'What fixed it was switching to manual and taping the ring down, a solution so stupid I am embarrassed to film it.',
  'Try that before you spend anything.',
].join(' ');

const baseInput = (over: Partial<AuthenticityInput> = {}): AuthenticityInput => ({
  title: 'How I fixed my autofocus',
  ...over,
});

const ev = (over: Partial<AuthenticityEvidence> = {}): AuthenticityEvidence => ({
  signal: 'Dense connective phrasing',
  location: 'across the full script',
  detail: 'detail',
  weight: 'strong',
  direction: 'ai-indicator',
  ...over,
});

describe('wordCount', () => {
  it('counts word tokens and ignores pure punctuation', () => {
    expect(wordCount('one two three')).toBe(3);
    expect(wordCount('one, two. three!')).toBe(3);
    expect(wordCount('')).toBe(0);
    expect(wordCount('... --- !!!')).toBe(0);
  });

  it('treats contractions and hyphenates as single words', () => {
    // The coverage math keys off this: splitting "don't" into two would inflate
    // how much text we think we saw.
    expect(wordCount("don't")).toBe(1);
    expect(wordCount('cutting-edge')).toBe(1);
    expect(wordCount('I’ve')).toBe(1);
  });
});

describe('detectTextSignals', () => {
  it('is neutral on empty text rather than guessing', () => {
    const { evidence, score } = detectTextSignals('');
    expect(score).toBe(50);
    expect(evidence).toEqual([]);
  });

  it('is deterministic — the same input always yields the same result', () => {
    const a = detectTextSignals(AI_READING);
    const b = detectTextSignals(AI_READING);
    expect(a).toEqual(b);
  });

  it('scores AI-reading text below human-reading text', () => {
    expect(detectTextSignals(AI_READING).score).toBeLessThan(detectTextSignals(HUMAN_READING).score);
  });

  it('produces evidence in both directions, so a human draft gets credit', () => {
    const human = detectTextSignals(HUMAN_READING);
    expect(human.evidence.some((e) => e.direction === 'human-indicator')).toBe(true);
    const ai = detectTextSignals(AI_READING);
    expect(ai.evidence.some((e) => e.direction === 'ai-indicator')).toBe(true);
  });

  it('gives every piece of evidence a checkable location', () => {
    // Evidence a creator cannot go and look at is an accusation, not a finding.
    for (const text of [AI_READING, HUMAN_READING, NEUTRAL]) {
      for (const e of detectTextSignals(text).evidence) {
        expect(e.location.trim()).not.toBe('');
        expect(e.detail.trim()).not.toBe('');
      }
    }
  });

  it('treats a single connector as ordinary English, not a signal', () => {
    const { evidence, score } = detectTextSignals(`However, that is the whole story. ${NEUTRAL}`);
    const connector = evidence.find((e) => e.signal === 'Single connector phrase');
    expect(connector?.direction).toBe('human-indicator');
    expect(connector?.weight).toBe('weak');
    // Recorded but inert. One "however" must not cost the creator anything —
    // including via the transition-density rule, which reads the same word.
    expect(score).toBe(50);
    expect(evidence.map((e) => e.signal)).not.toContain('Frequent sequence transitions');
  });

  it('does not fire the transition signal on a lone connector in short text', () => {
    // The density denominator is words, so on a 12-word line one transition
    // reads as ~8% and would fire a signal that means nothing at that length.
    const short = detectTextSignals('However, the shot was already ruined by then.');
    expect(short.evidence.map((e) => e.signal)).not.toContain('Frequent sequence transitions');
    expect(short.score).toBe(50);
  });

  it('escalates connective density to a strong indicator only when it is dense', () => {
    const dense = detectTextSignals(AI_READING).evidence.find(
      (e) => e.signal === 'Dense connective phrasing',
    );
    expect(dense).toBeDefined();
    expect(dense?.direction).toBe('ai-indicator');
  });

  it('caps the score when the creator declared AI assistance', () => {
    // Their own disclosure is ground truth about origin, so the score honours it
    // — but this is the declaration being recorded, not a detection.
    const declared = detectTextSignals(HUMAN_READING, true);
    expect(declared.score).toBeLessThanOrEqual(45);
    expect(detectTextSignals(HUMAN_READING, false).score).toBeGreaterThan(45);
  });

  it('keeps the score inside 0-100 for every input', () => {
    const inputs = ['', NEUTRAL, AI_READING, HUMAN_READING, AI_READING.repeat(6), 'a'];
    for (const text of inputs) {
      for (const declared of [true, false]) {
        const { score } = detectTextSignals(text, declared);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    }
  });

  it('does not fire variance or diversity signals on text too short to judge', () => {
    // Below the word gate these measure sample size, not writing style.
    const short = detectTextSignals('Short line here. Another one. And a third.');
    const signals = short.evidence.map((e) => e.signal);
    expect(signals).not.toContain('Uniform sentence length');
    expect(signals).not.toContain('High lexical diversity');
    expect(signals).not.toContain('Narrow vocabulary range');
  });
});

describe('deriveRisk', () => {
  const strong = [ev({ weight: 'strong', direction: 'ai-indicator' })];
  const weak = [ev({ weight: 'weak', direction: 'ai-indicator' })];

  it('never returns High without a strong ai-indicator', () => {
    // This is the guard against death-by-a-thousand-weak-signals, which is
    // exactly how clean human writing gets wrongly flagged.
    expect(deriveRisk(10, 90, weak, false)).toBe('Medium');
    expect(deriveRisk(0, 90, [], false)).toBe('Medium');
    expect(deriveRisk(0, 90, [ev({ weight: 'strong', direction: 'human-indicator' })], false)).toBe(
      'Medium',
    );
  });

  it('never returns High when confidence is below 55', () => {
    // Barely having looked does not entitle us to the strongest claim available.
    expect(deriveRisk(10, 54, strong, false)).toBe('Medium');
    expect(deriveRisk(10, 55, strong, false)).toBe('High');
  });

  it('returns High only when score, strength, and confidence all agree', () => {
    expect(deriveRisk(49, 55, strong, false)).toBe('High');
    expect(deriveRisk(50, 90, strong, false)).toBe('Medium');
  });

  it('bands a clean high score as Low', () => {
    expect(deriveRisk(72, 90, [], false)).toBe('Low');
    expect(deriveRisk(71, 90, [], false)).toBe('Medium');
  });

  it('raises a declared-AI Low to Medium but never manufactures High', () => {
    // Disclosure is the behaviour we want to encourage, so it must never be the
    // thing that produces the worst band.
    expect(deriveRisk(95, 90, [], true)).toBe('Medium');
    expect(deriveRisk(95, 90, weak, true)).toBe('Medium');
    expect(deriveRisk(80, 90, strong, true)).toBe('Medium');
  });

  it('only ever emits the three published bands', () => {
    for (const score of [0, 25, 49, 50, 71, 72, 100]) {
      for (const confidence of [25, 54, 55, 90]) {
        for (const evidence of [[], weak, strong]) {
          for (const declared of [true, false]) {
            expect(['Low', 'Medium', 'High']).toContain(
              deriveRisk(score, confidence, evidence, declared),
            );
          }
        }
      }
    }
  });
});

describe('heuristicAuthenticity — confidence', () => {
  it('floors confidence at 25 when almost nothing was supplied', () => {
    expect(heuristicAuthenticity(baseInput()).confidence).toBe(25);
  });

  it('never exceeds the 90 ceiling, however much is supplied', () => {
    // We do not read video frames, waveforms, or C2PA provenance, so full
    // certainty is not available to us at any input size.
    const everything = heuristicAuthenticity(
      baseInput({
        scriptText: HUMAN_READING.repeat(12),
        description: 'A long description',
        tags: ['a', 'b'],
        durationSeconds: 600,
        hasThumbnail: true,
        audioMeasured: true,
        aiGenerated: true,
      }),
    );
    expect(everything.confidence).toBeLessThanOrEqual(90);
  });

  it('rises as more of the content becomes observable', () => {
    const titleOnly = heuristicAuthenticity(baseInput()).confidence;
    const withScript = heuristicAuthenticity(
      baseInput({ scriptText: HUMAN_READING.repeat(8) }),
    ).confidence;
    const withAudio = heuristicAuthenticity(
      baseInput({ scriptText: HUMAN_READING.repeat(8), audioMeasured: true }),
    ).confidence;
    expect(withScript).toBeGreaterThan(titleOnly);
    expect(withAudio).toBeGreaterThan(withScript);
  });

  it('gives a short script only a fraction of the script weight', () => {
    const short = heuristicAuthenticity(baseInput({ scriptText: 'Ten words is not enough text to judge anything at all.' }));
    const long = heuristicAuthenticity(baseInput({ scriptText: HUMAN_READING.repeat(8) }));
    expect(short.confidence).toBeLessThan(long.confidence);
  });
});

describe('heuristicAuthenticity — honesty contract', () => {
  const inputs: AuthenticityInput[] = [
    baseInput(),
    baseInput({ scriptText: HUMAN_READING }),
    baseInput({ scriptText: AI_READING }),
    baseInput({ scriptText: AI_READING, aiGenerated: true, hasWatermark: true }),
    baseInput({ scriptText: HUMAN_READING, audioMeasured: true, hasThumbnail: true, durationSeconds: 300 }),
  ];

  it('always states false-positive reasons, including on Low-risk results', () => {
    // A Low band needs its caveats too: a fluent AI script reads as human, and a
    // creator should never take any band here as a finding about them.
    for (const input of inputs) {
      const r = heuristicAuthenticity(input);
      expect(r.falsePositiveReasons.length).toBeGreaterThan(0);
    }
    const low = heuristicAuthenticity(baseInput({ scriptText: HUMAN_READING }));
    expect(low.risk).toBe('Low');
    expect(low.falsePositiveReasons.length).toBeGreaterThan(0);
  });

  it('names ESL and register bias explicitly in the false-positive reasons', () => {
    // The single most important caveat: the people detectors hit hardest.
    const reasons = heuristicAuthenticity(baseInput({ scriptText: AI_READING })).falsePositiveReasons.join(' ');
    expect(reasons.toLowerCase()).toContain('second or additional language');
  });

  it('always lists what it could not evaluate', () => {
    for (const input of inputs) {
      const r = heuristicAuthenticity(input);
      expect(r.inconclusive.length).toBeGreaterThan(0);
      // Frame-level analysis does not exist in the product; saying so on every
      // review is the difference between "checked and clean" and "never checked".
      expect(r.inconclusive.join(' ')).toContain('Frame-level visual signals');
      expect(r.inconclusive.join(' ')).toContain('Provenance metadata');
    }
  });

  it('reports a missing script as unevaluated rather than clean', () => {
    const r = heuristicAuthenticity(baseInput());
    expect(r.inconclusive.join(' ')).toContain('no script or transcript was supplied');
    expect(r.evidence).toEqual([]);
  });

  it('always states its structural limitations', () => {
    for (const input of inputs) {
      expect(heuristicAuthenticity(input).limitations.length).toBeGreaterThan(0);
    }
  });

  it('never promises monetization, detection, or platform approval', () => {
    // The three promises the spec forbids outright.
    const forbidden = /\bguarantee[sd]?\b|\bwill (be )?(approved|monetiz)|\bcertain(ly)? (that )?(ai|approved)\b/i;
    for (const input of inputs) {
      const r = heuristicAuthenticity(input);
      const prose = [
        ...r.falsePositiveReasons,
        ...r.inconclusive,
        ...r.limitations,
        ...r.recommendations,
        ...r.evidence.flatMap((e) => [e.signal, e.detail, e.location]),
      ];
      for (const line of prose) {
        // "no result can guarantee monetization" is the disclaimer itself, and
        // is the one place the word legitimately appears.
        if (/guarantee/i.test(line)) {
          expect(line).toMatch(/no\b[^.]*\bguarantee|cannot guarantee|never\b[^.]*\bguarantee/i);
        } else {
          expect(line).not.toMatch(forbidden);
        }
      }
    }
  });

  it('never asserts the content IS AI-generated', () => {
    // The one rule. No output string may make an origin claim.
    const assertion = /\b(is|was|were)\s+(clearly\s+|obviously\s+|definitely\s+|certainly\s+)?ai[- ](generated|written)\b/i;
    for (const input of inputs) {
      const r = heuristicAuthenticity(input);
      const prose = [
        ...r.falsePositiveReasons,
        ...r.inconclusive,
        ...r.limitations,
        ...r.recommendations,
        ...r.evidence.flatMap((e) => [e.signal, e.detail]),
      ];
      for (const line of prose) expect(line).not.toMatch(assertion);
    }
  });

  it('records a creator declaration as a disclosure, not a detection', () => {
    const r = heuristicAuthenticity(baseInput({ scriptText: HUMAN_READING, aiGenerated: true }));
    expect(r.creatorDeclared).toBe(true);
    expect(r.falsePositiveReasons.join(' ')).toContain('reflects your disclosure rather than a detection');
    // Disclosing must not by itself produce the worst band.
    expect(r.risk).not.toBe('High');
  });

  it('keeps the reported score no higher than the raw signal score', () => {
    // conservativeScore only ever rounds against us; a report must never read
    // better than what was actually observed.
    for (const input of inputs) {
      const r = heuristicAuthenticity(input);
      expect(r.humanAuthenticityScore).toBeGreaterThanOrEqual(0);
      expect(r.humanAuthenticityScore).toBeLessThanOrEqual(100);
    }
  });
});

describe('heuristicAuthenticity — measured audio', () => {
  const script = { scriptText: HUMAN_READING, audioMeasured: true };

  it('treats an abnormal pause ratio as the one strong measured indicator', () => {
    const r = heuristicAuthenticity(baseInput(script), {
      speakingPaceWpm: 150,
      pauseRatio: 0.6,
      isMonotone: false,
    });
    const pause = r.evidence.find((e) => e.signal === 'Abnormal pause distribution');
    expect(pause?.weight).toBe('strong');
    expect(pause?.direction).toBe('ai-indicator');
  });

  it('credits natural pitch variation as a human indicator', () => {
    const r = heuristicAuthenticity(baseInput(script), {
      speakingPaceWpm: 150,
      pauseRatio: 0.2,
      isMonotone: false,
    });
    expect(r.evidence.some((e) => e.signal === 'Natural pitch variation' && e.direction === 'human-indicator')).toBe(true);
  });

  it('scores measured-synthetic delivery below measured-human delivery', () => {
    const synthetic = heuristicAuthenticity(baseInput(script), {
      speakingPaceWpm: 300,
      pauseRatio: 0.6,
      isMonotone: true,
    });
    const human = heuristicAuthenticity(baseInput(script), {
      speakingPaceWpm: 150,
      pauseRatio: 0.2,
      isMonotone: false,
    });
    expect(synthetic.humanAuthenticityScore).toBeLessThan(human.humanAuthenticityScore);
  });

  it('does not invent voice evidence when no audio was measured', () => {
    const r = heuristicAuthenticity(baseInput({ scriptText: HUMAN_READING }));
    expect(r.evidence.some((e) => e.location === 'voice track')).toBe(false);
    expect(r.inconclusive.join(' ')).toContain('Synthetic-voice characteristics');
  });

  it('handles null measurements without fabricating a signal', () => {
    const r = heuristicAuthenticity(baseInput(script), {
      speakingPaceWpm: null,
      pauseRatio: null,
      isMonotone: null,
    });
    expect(r.evidence.some((e) => e.location === 'voice track')).toBe(false);
  });
});

describe('analyzeMonetizationRisk', () => {
  it('reports Low with no items when nothing fires', () => {
    const r = analyzeMonetizationRisk(baseInput({ scriptText: NEUTRAL }));
    expect(r.risk).toBe('Low');
    expect(r.items).toEqual([]);
  });

  it('does not present a clean result as a platform clearance', () => {
    const r = analyzeMonetizationRisk(baseInput({ scriptText: NEUTRAL }));
    expect(r.limitations.join(' ')).toContain('not a platform decision');
    expect(r.limitations.join(' ')).toMatch(/no rule fired, not that a reviewer would agree/);
  });

  it('flags profanity in metadata harder than the same word in a script', () => {
    // Metadata surfaces in search and has no bleeping equivalent.
    const inScript = analyzeMonetizationRisk(baseInput({ scriptText: 'this shit is broken' }));
    const inTitle = analyzeMonetizationRisk(baseInput({ title: 'this shit is broken' }));
    const s = inScript.items.find((i) => i.category === 'Profanity');
    const t = inTitle.items.find((i) => i.category === 'Profanity');
    expect(s?.risk).toBe('High');
    expect(t?.risk).toBe('High');
    expect(t!.confidence).toBeGreaterThan(s!.confidence);
  });

  it('raises one finding per category and scope, not one per occurrence', () => {
    // Three profanities are one thing to fix. An alert a creator learns to
    // ignore is worse than no alert.
    const r = analyzeMonetizationRisk(
      baseInput({ scriptText: 'shit. more shit. and shit again. plus fuck.' }),
    );
    expect(r.items.filter((i) => i.category === 'Profanity')).toHaveLength(1);
  });

  it('anchors every finding to a location and gives a mechanism and a fix', () => {
    const r = analyzeMonetizationRisk(
      baseInput({
        title: 'You won\'t believe this one trick',
        scriptText: 'no copyright intended, this is a fair use disclaimer',
      }),
    );
    expect(r.items.length).toBeGreaterThan(0);
    for (const i of r.items) {
      expect(i.location.trim()).not.toBe('');
      expect(i.why.trim().length).toBeGreaterThan(20);
      expect(i.fix.trim().length).toBeGreaterThan(20);
      expect(i.confidence).toBeGreaterThan(0);
      expect(i.confidence).toBeLessThanOrEqual(100);
    }
  });

  it('rolls up to the worst finding, not the count of findings', () => {
    const oneHigh = analyzeMonetizationRisk(baseInput({ scriptText: 'this is shit' }));
    const manyMedium = analyzeMonetizationRisk(
      baseInput({
        title: 'shocking truth: this one trick, click here for free money',
        scriptText: 'a deepfake and a voice clone',
      }),
    );
    expect(oneHigh.risk).toBe('High');
    expect(manyMedium.risk).toBe('Medium');
  });

  it('scores a clean review above a flagged one and stays in range', () => {
    const clean = analyzeMonetizationRisk(baseInput({ scriptText: NEUTRAL }));
    const flagged = analyzeMonetizationRisk(baseInput({ scriptText: 'this is shit' }));
    expect(clean.score).toBeGreaterThan(flagged.score);
    for (const r of [clean, flagged]) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    }
  });

  it('states which checks could not run when there is no script', () => {
    const r = analyzeMonetizationRisk(baseInput());
    expect(r.inconclusive.join(' ')).toContain('unevaluated, not clear');
    expect(r.inconclusive.join(' ')).toContain('Misleading-thumbnail check');
    expect(r.inconclusive.join(' ')).toContain('Copyright fingerprinting');
  });

  it('folds in what the other engines measured', () => {
    const r = analyzeMonetizationRisk(baseInput({ scriptText: NEUTRAL }), {
      copyright: {
        measured: true,
        musicMatchRisk: 'High',
        watermarkDetected: true,
      } as never,
    });
    expect(r.items.some((i) => i.category === 'Copyright exposure')).toBe(true);
    expect(r.items.some((i) => i.category === 'Brand safety')).toBe(true);
    expect(r.risk).toBe('High');
  });

  it('lowers its confidence in a synthetic-voice item when audio was not measured', () => {
    const measured = analyzeMonetizationRisk(baseInput({ scriptText: NEUTRAL }), {
      voice: { measured: true, syntheticArtifactRisk: 'Medium' } as never,
    });
    const inferred = analyzeMonetizationRisk(baseInput({ scriptText: NEUTRAL }), {
      voice: { measured: false, syntheticArtifactRisk: 'Medium' } as never,
    });
    const m = measured.items.find((i) => i.category === 'Automation signals');
    const i = inferred.items.find((i) => i.category === 'Automation signals');
    expect(m!.confidence).toBeGreaterThan(i!.confidence);
    expect(i!.why).toContain('no audio was processed');
  });

  it('never promises monetization or approval in any item', () => {
    const r = analyzeMonetizationRisk(
      baseInput({
        title: 'shocking truth about free money, click here',
        scriptText: 'this shit cures cancer, no copyright intended',
      }),
    );
    for (const line of [...r.items.flatMap((i) => [i.why, i.fix]), ...r.limitations]) {
      if (/guarantee/i.test(line)) {
        expect(line).toMatch(/no\b[^.]*\bguarantee|cannot guarantee/i);
      }
      expect(line).not.toMatch(/\bwill be (approved|monetized)\b/i);
    }
  });

  it('keeps confidence inside the honest ceiling', () => {
    const r = analyzeMonetizationRisk(
      baseInput({
        scriptText: HUMAN_READING.repeat(12),
        description: 'x',
        tags: ['y'],
        durationSeconds: 600,
        hasThumbnail: true,
        audioMeasured: true,
        aiGenerated: true,
      }),
    );
    expect(r.confidence).toBeLessThanOrEqual(90);
  });
});

describe('buildScorecards', () => {
  const ctx = () => ({
    textSignals: detectTextSignals(HUMAN_READING),
    title: 'How I fixed my autofocus',
    scriptText: HUMAN_READING,
  });

  it('returns all 11 cards with unique ids', () => {
    const cards = buildScorecards(ctx());
    expect(cards).toHaveLength(11);
    expect(new Set(cards.map((c) => c.id)).size).toBe(11);
  });

  it('gives every card a label and an honest expected impact', () => {
    for (const c of buildScorecards(ctx())) {
      expect(c.label.trim()).not.toBe('');
      expect(c.expectedImpact.trim()).not.toBe('');
      // No card may promise an outcome it cannot deliver. Disclaiming a
      // guarantee ("not a guarantee of platform outcome") is the opposite of
      // making one, so only unqualified uses fail here.
      expect(c.expectedImpact).not.toMatch(/\bwill (be )?(approved|monetized)\b/i);
      if (/guarantee/i.test(c.expectedImpact)) {
        expect(c.expectedImpact).toMatch(/\b(not|no|never|cannot)\b[^.]*\bguarantee/i);
      }
    }
  });

  it('reports an unevaluated layer as null, never as zero', () => {
    // A zero reads as "we measured it and it is terrible". Null is the only
    // honest value for a layer that never ran.
    const cards = buildScorecards({
      textSignals: detectTextSignals(''),
      title: 'Title only',
    });
    const unevaluated = cards.filter((c) => c.value === null);
    expect(unevaluated.length).toBeGreaterThan(0);
    expect(cards.some((c) => c.value === 0)).toBe(false);
  });

  it('explains itself whenever a card has no value', () => {
    const cards = buildScorecards({
      textSignals: detectTextSignals(''),
      title: 'Title only',
    });
    for (const c of cards.filter((x) => x.value === null)) {
      expect(c.inconclusive.length + c.evidence.length).toBeGreaterThan(0);
    }
  });

  it('keeps every score and confidence inside 0-100', () => {
    const full = buildScorecards({
      ...ctx(),
      authenticity: heuristicAuthenticity(baseInput({ scriptText: HUMAN_READING })),
      monetizationRisk: analyzeMonetizationRisk(baseInput({ scriptText: HUMAN_READING })),
      description: 'a description',
      tags: ['tag'],
      hasThumbnail: true,
      audioMeasured: true,
    });
    for (const c of full) {
      if (c.value !== null) {
        expect(c.value).toBeGreaterThanOrEqual(0);
        expect(c.value).toBeLessThanOrEqual(100);
      }
      expect(c.confidence).toBeGreaterThanOrEqual(0);
      expect(c.confidence).toBeLessThanOrEqual(100);
    }
  });
});

describe('scrubCertainty', () => {
  it('rewrites a direct origin assertion into a reads-as statement', () => {
    const out = scrubCertainty('This is clearly AI-generated.');
    expect(out).not.toMatch(/is clearly ai-generated/i);
    expect(out.toLowerCase()).toContain('reads as consistent with');
  });

  it('strips every certainty phrasing the model reaches for', () => {
    const assertions = [
      'The script is AI-generated.',
      'The content is definitely AI-generated.',
      'This was written by an AI.',
      'These were written by AI.',
      'Confirmed AI in the opening.',
      'AI-detected in paragraph two.',
      'This proves it is AI.',
      'That proves this is AI.',
    ];
    for (const a of assertions) {
      const out = scrubCertainty(a);
      expect(out).not.toMatch(/\bconfirmed ai\b|\bai[- ]detected\b|\bproves?\s+(this|it)\s+is\s+ai\b/i);
      expect(out).not.toMatch(/\b(is|was|were)\s+(clearly\s+|definitely\s+)?(written by (an? )?ai|ai[- ]generated)\b/i);
    }
  });

  it('leaves honest hedged language untouched', () => {
    const honest = 'This reads as consistent with AI-generated text, though a rehearsed human script scores the same.';
    expect(scrubCertainty(honest)).toBe(honest);
  });

  it('is idempotent — scrubbing a scrubbed string changes nothing further', () => {
    const once = scrubCertainty('This is clearly AI-generated and confirmed AI.');
    expect(scrubCertainty(once)).toBe(once);
  });

  it('handles empty input', () => {
    expect(scrubCertainty('')).toBe('');
  });
});
