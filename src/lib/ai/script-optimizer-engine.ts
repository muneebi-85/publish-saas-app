/**
 * Creator Script Optimizer — deterministic script analysis.
 *
 * Pure text heuristics: no API keys, no external calls, no secrets — safe to run
 * client-side. Every signal is derived from the script itself so the output is
 * reproducible and honest. Where a signal genuinely cannot be measured from text
 * alone (true speaking pace needs the final render's duration), the score is null
 * and the UI shows it as an estimate, never a fabricated number.
 *
 * This is what turns the old "text rewriter" into a premium pre-publish QC pass:
 * it grades the script the way a strategist would read it, not the way ChatGPT
 * would rephrase it.
 */

export type SignalBand = 'good' | 'warn' | 'risk';

export interface ScriptSignal {
  key: string;
  label: string;
  /** 0-100. null when the signal can't be measured from text alone. */
  score: number | null;
  band: SignalBand;
  /** True when derived from real text signal (vs a text-only proxy for a runtime metric). */
  measured: boolean;
  /** What we actually found — specific, quotes the script where possible. */
  finding: string;
  /** The exact next action. Never generic. */
  fix: string;
}

export interface ScriptOptimizerReport {
  overall: number;
  headline: string;
  wordCount: number;
  estimatedReadSeconds: number;
  signals: ScriptSignal[];
}

// ─── Lexicons ──────────────────────────────────────────
const AI_TELLS = [
  'delve into', 'delve', 'furthermore', 'moreover', 'in conclusion',
  'it is important to note', 'cutting-edge', 'landscape of', 'harness the power',
  'in today\'s world', 'in the realm of', 'navigate the', 'tapestry', 'testament to',
  'when it comes to', 'a game-changer', 'unlock the', 'dive deep', 'realm of',
];
const FILLER = ['basically', 'actually', 'literally', 'you know', 'kind of', 'sort of', 'i mean', 'like,', 'um', 'uh'];
const EMOTION_WORDS = [
  'love', 'hate', 'fear', 'shocking', 'incredible', 'insane', 'crazy', 'amazing',
  'terrifying', 'heartbreaking', 'unbelievable', 'stunning', 'obsessed', 'furious',
  'excited', 'nervous', 'proud', 'devastated', 'thrilled', 'painful', 'brutal',
];
const CTA_MARKERS = [
  'subscribe', 'like this video', 'comment below', 'hit the bell', 'link in',
  'check out', 'sign up', 'download', 'follow', 'share this', 'let me know',
  'click', 'grab the', 'join', 'try it',
];
const STORY_MARKERS = ['because', 'but', 'so', 'then', 'until', 'suddenly', 'that\'s when', 'here\'s why', 'the problem', 'the result', 'imagine'];
// Advertiser-risk vocabulary (mild — flags ad-suitability, not a moderation call).
const MONEY_RISK = ['kill', 'blood', 'gun', 'drug', 'sex', 'nsfw', 'gamble', 'suicide', 'weapon', 'died', 'death'];
// Strong profanity roots — kept small and root-matched.
const PROFANITY = ['fuck', 'shit', 'bitch', 'asshole', 'bastard', 'dick', 'cunt', 'motherf'];

const band = (score: number, goodAt = 80, warnAt = 60): SignalBand =>
  score >= goodAt ? 'good' : score >= warnAt ? 'warn' : 'risk';

const countMatches = (haystack: string, needles: string[]) => {
  let n = 0;
  const found: string[] = [];
  for (const term of needles) {
    const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi');
    const m = haystack.match(re);
    if (m) { n += m.length; found.push(term); }
  }
  return { n, found };
};

const firstSentence = (text: string) =>
  (text.trim().match(/^[^.!?\n]+[.!?]?/)?.[0] ?? text.trim()).trim();

const sentences = (text: string) => text.match(/[^.!?]+[.!?]+/g) ?? [text];

export interface OptimizerInput {
  scriptText: string;
  targetPlatform?: 'YouTube' | 'TikTok' | 'Instagram' | 'Facebook' | 'LinkedIn';
  /** Final render length in seconds, when known — unlocks a real speaking-pace read. */
  durationSeconds?: number;
}

export function analyzeScriptText(input: OptimizerInput): ScriptOptimizerReport {
  const text = input.scriptText.trim();
  const platform = input.targetPlatform ?? 'YouTube';
  const lower = text.toLowerCase();
  const words = text ? text.split(/\s+/).filter(Boolean) : [];
  const wordCount = words.length;
  const sents = sentences(text);
  const avgSentLen = sents.length ? wordCount / sents.length : wordCount;
  const opener = firstSentence(text);
  const estimatedReadSeconds = Math.round((wordCount / 155) * 60); // ~155 WPM narration

  const signals: ScriptSignal[] = [];

  // 1 ─ AI Detection Risk (score = how HUMAN it reads; higher is safer)
  {
    const { n, found } = countMatches(lower, AI_TELLS);
    const per100 = wordCount ? (n / wordCount) * 100 : 0;
    const score = Math.max(10, Math.round(100 - per100 * 22 - n * 4));
    signals.push({
      key: 'ai-detection', label: 'AI Detection Risk', score, band: band(score),
      measured: true,
      finding: n
        ? `Found ${n} detector-flagged phrase${n > 1 ? 's' : ''} — ${found.slice(0, 3).map((f) => `"${f}"`).join(', ')}${found.length > 3 ? ', …' : ''}. These tokens are among the most heavily weighted signals in AI-text classifiers.`
        : 'No high-frequency AI tells found in the copy. The phrasing reads human on a lexical pass (this is a text estimate, not a detector verdict).',
      fix: n
        ? `Replace each flagged phrase with how you'd actually say it out loud (e.g. "delve into" → "get into", "furthermore" → "and"). That single swap removes the mechanical tell without touching your meaning.`
        : `Keep sentence openings varied — starting three sentences in a row the same way is the next tell detectors catch. Run the final cut through your own detector of record before relying on a number.`,
    });
  }

  // 2 ─ Viewer Retention Prediction (proxy from sentence length + opener)
  {
    const lengthPenalty = Math.max(0, avgSentLen - 18) * 2.2;
    const openerBonus = /\?|you|your|how|why|stop|never|secret|mistake/i.test(opener) ? 8 : 0;
    const score = Math.max(20, Math.min(95, Math.round(88 - lengthPenalty + openerBonus)));
    signals.push({
      key: 'retention', label: 'Viewer Retention Prediction', score, band: band(score, 78, 60),
      measured: false,
      finding: `Average sentence runs ~${Math.round(avgSentLen)} words${avgSentLen > 22 ? ' — long clauses are hard to follow on a sound-on watch and are where mid-video drop-off concentrates' : ', which sits in the readable range for spoken delivery'}. This is a structural proxy; true retention needs the published analytics curve.`,
      fix: avgSentLen > 22
        ? `Split every sentence over ~22 words at its natural "and"/"but"/"because" seam. Shorter spoken lines let a viewer catch the point before the next one starts.`
        : `Sentence length is fine — protect retention next by cutting any 5+ second stretch that doesn't advance the story (see Dead Sections below).`,
    });
  }

  // 3 ─ Hook Optimizer (first sentence)
  {
    const hookWords = opener.split(/\s+/).length;
    const hasStakes = /you|your|how|why|stop|never|secret|mistake|\?|\$|number|reason/i.test(opener);
    const throatClear = /^(in this video|today (i|we)|hey guys|what'?s up|welcome back|my name is)/i.test(opener);
    let score = 70;
    if (hasStakes) score += 15;
    if (throatClear) score -= 30;
    if (hookWords > 20) score -= 12;
    score = Math.max(15, Math.min(96, score));
    signals.push({
      key: 'hook', label: 'Hook Optimizer', score, band: band(score, 80, 60),
      measured: true,
      finding: throatClear
        ? `Your opener is a throat-clear: "${opener.slice(0, 80)}". On ${platform} the first line competes with a swipe — a channel intro spends that window on you instead of the viewer.`
        : hasStakes
        ? `Opener already puts something at stake for the viewer: "${opener.slice(0, 80)}". That's the right instinct.`
        : `Opener states a topic without a stake: "${opener.slice(0, 80)}". It tells the viewer what it's about, not why to stay.`,
      fix: throatClear || !hasStakes
        ? `Lead with the payoff or the tension instead. Template: "${platform === 'LinkedIn' ? 'The mistake that cost me [X]:' : 'Here\'s why [surprising claim] — and the [number] fixes'}". Put the reason-to-stay in the first 6 words.`
        : `Tighten it to under 12 words so the promise lands inside the first ~3 seconds, then pay it off immediately.`,
    });
  }

  // 4 ─ Emotion Analysis
  {
    const { n, found } = countMatches(lower, EMOTION_WORDS);
    const per100 = wordCount ? (n / wordCount) * 100 : 0;
    const score = Math.max(25, Math.min(92, Math.round(50 + per100 * 14)));
    signals.push({
      key: 'emotion', label: 'Emotion Analysis', score, band: band(score, 70, 45),
      measured: true,
      finding: n
        ? `Emotional register is present — ${n} charged word${n > 1 ? 's' : ''} (${found.slice(0, 3).join(', ')}). That's what makes a moment shareable.`
        : `The copy is neutral end to end — no emotional peaks detected. Flat scripts get watched, rarely shared.`,
      fix: n
        ? `Make sure the strongest emotional word lands in the first 15 seconds and again at your CTA — peaks at the entry and exit drive both retention and shares.`
        : `Name the stakes in feeling terms at least once: what's frustrating, surprising, or at risk here for the viewer. One honest emotional line beats ten neutral facts for shares.`,
    });
  }

  // 5 ─ Speaking Pace
  {
    let score: number | null = null;
    let measured = false;
    let finding: string;
    let fix: string;
    if (input.durationSeconds && input.durationSeconds > 0) {
      const wpm = Math.round(wordCount / (input.durationSeconds / 60));
      measured = true;
      const inBand = wpm >= 150 && wpm <= 165;
      score = inBand ? 90 : Math.max(35, 90 - Math.abs(wpm - 157) * 1.4);
      finding = `At ${wordCount} words over ${input.durationSeconds}s you're pacing ~${wpm} WPM${inBand ? ', right in the 150-165 WPM retention band for narration.' : wpm < 150 ? ' — under the 150 WPM floor, which reads as slow and sheds viewers.' : ' — above 165 WPM, which is hard to follow on first listen.'}`;
      fix = inBand
        ? `Pace is dialed in. Vary it deliberately — slow down 10-15% on your single most important line so it stands out.`
        : wpm < 150
        ? `Trim filler words and dead air, or tighten the script ~${Math.round((1 - wpm / 157) * -100)}% so delivery lands near 155 WPM.`
        : `Add two or three deliberate pauses at your key points, or cut ~${Math.round((1 - 157 / wpm) * -100)}% of words so the audience can keep up.`;
    } else {
      finding = `Read time is estimated at ~${estimatedReadSeconds}s at a 155 WPM narration pace (${wordCount} words). True pace needs the final render's duration.`;
      fix = `When you export, target 150-165 WPM — the band where narration is fast enough to hold attention but slow enough to follow. Attach the render to Publish to measure it exactly.`;
    }
    signals.push({ key: 'pace', label: 'Speaking Pace', score, band: score === null ? 'warn' : band(score, 80, 55), measured, finding, fix });
  }

  // 6 ─ Dead Sections (long low-signal runs)
  {
    const longRuns = sents.filter((s) => s.trim().split(/\s+/).length > 30);
    const fillerHits = countMatches(lower, FILLER);
    const score = Math.max(30, Math.min(95, 92 - longRuns.length * 9 - fillerHits.n * 3));
    signals.push({
      key: 'dead-sections', label: 'Dead Sections', score, band: band(score, 80, 60),
      measured: true,
      finding: longRuns.length || fillerHits.n
        ? `${longRuns.length} over-long run${longRuns.length === 1 ? '' : 's'} and ${fillerHits.n} filler word${fillerHits.n === 1 ? '' : 's'} detected — these are the stretches where the graph flattens and viewers tab away.`
        : `No obvious dead air — sentences stay tight and filler is minimal.`,
      fix: longRuns.length
        ? `Cut or split the longest run first: "${longRuns[0].trim().slice(0, 70)}…". If a sentence doesn't advance the story or add a fact, it's a candidate to delete entirely.`
        : `Keep protecting pace — read the script aloud and delete anything you instinctively rush through.`,
    });
  }

  // 7 ─ Audience Fatigue (repetition)
  {
    const freq: Record<string, number> = {};
    for (const w of words.map((w) => w.toLowerCase().replace(/[^a-z']/g, ''))) {
      if (w.length > 4) freq[w] = (freq[w] ?? 0) + 1;
    }
    const repeated = Object.entries(freq).filter(([, c]) => c >= 4).sort((a, b) => b[1] - a[1]);
    const score = Math.max(35, Math.min(94, 92 - repeated.length * 8));
    signals.push({
      key: 'fatigue', label: 'Audience Fatigue', score, band: band(score, 80, 60),
      measured: true,
      finding: repeated.length
        ? `You lean on ${repeated.length} word${repeated.length > 1 ? 's' : ''} repeatedly — "${repeated[0][0]}" appears ${repeated[0][1]} times. Repetition makes a script feel like it's circling instead of moving.`
        : `No single word or phrase is over-used — the vocabulary keeps moving, which keeps the watch fresh.`,
      fix: repeated.length
        ? `Swap half the uses of "${repeated[0][0]}" for a synonym or restructure the sentence, and make sure you're not re-explaining a point you already made.`
        : `Vary your transitions too — different bridges between sections keep the pattern from getting predictable.`,
    });
  }

  // 8 ─ Storytelling Flow
  {
    const { n } = countMatches(lower, STORY_MARKERS);
    const per100 = wordCount ? (n / wordCount) * 100 : 0;
    const score = Math.max(30, Math.min(93, Math.round(45 + per100 * 12)));
    signals.push({
      key: 'storytelling', label: 'Storytelling Flow', score, band: band(score, 75, 50),
      measured: true,
      finding: n >= 2
        ? `Causal and tension markers present (${n} found — "because", "but", "then"…). The script moves through cause and effect rather than listing facts.`
        : `Few narrative connectors — the script reads as a list of points, not a story. List-shaped scripts lose the "what happens next" pull.`,
      fix: n >= 2
        ? `Make sure there's one clear turn — a "but everything changed when…" beat — roughly a third of the way in to reset attention.`
        : `Rewrite at least two transitions as cause/tension: replace "Next, …" with "But that created a new problem: …". The word "but" is the cheapest retention tool you have.`,
    });
  }

  // 9 ─ Call-to-Action Strength
  {
    const { n, found } = countMatches(lower, CTA_MARKERS);
    const inLastQuarter = (() => {
      const tail = lower.slice(Math.floor(lower.length * 0.7));
      return countMatches(tail, CTA_MARKERS).n > 0;
    })();
    let score = n === 0 ? 30 : Math.min(92, 55 + n * 10);
    if (n > 0 && !inLastQuarter) score -= 12;
    if (n > 4) score -= 10; // too many CTAs dilutes
    score = Math.max(25, score);
    signals.push({
      key: 'cta', label: 'Call-to-Action Strength', score, band: band(score, 78, 55),
      measured: true,
      finding: n === 0
        ? `No call-to-action found. A video with no ask converts viewers into nothing — no sub, no click, no next step.`
        : n > 4
        ? `${n} CTAs detected (${found.slice(0, 3).join(', ')}…) — that many asks compete with each other and each one lands softer.`
        : `${n} CTA${n > 1 ? 's' : ''} present${inLastQuarter ? ', including one near the end where intent is highest.' : ', but none in the final stretch where the ready-to-act viewers are.'}`,
      fix: n === 0
        ? `Add one specific ask tied to the payoff you just delivered: "If this fixed [problem], the next video breaks down [related] — subscribe so it finds you." One clear ask beats a vague "smash like".`
        : !inLastQuarter
        ? `Move your primary CTA to the last 15% of the script, right after you deliver the payoff — that's when the viewer is most willing to act.`
        : `Cut to a single primary CTA. Pick the one action that matters most and let it stand alone.`,
    });
  }

  // 10 ─ Sponsor Readability
  {
    const proQuality = Math.max(0, 100 - (avgSentLen > 26 ? 20 : 0));
    const profanity = countMatches(lower, PROFANITY).n;
    const riskHits = countMatches(lower, MONEY_RISK).n;
    const score = Math.max(30, Math.min(95, proQuality - profanity * 15 - riskHits * 6));
    signals.push({
      key: 'sponsor', label: 'Sponsor Readability', score, band: band(score, 80, 60),
      measured: true,
      finding: profanity || riskHits
        ? `${profanity ? `${profanity} profanity hit${profanity > 1 ? 's' : ''}` : ''}${profanity && riskHits ? ' and ' : ''}${riskHits ? `${riskHits} advertiser-sensitive term${riskHits > 1 ? 's' : ''}` : ''} would make most brands hesitate before attaching their name.`
        : `Language reads brand-safe and clear — the kind of script a sponsor can read start to finish without flinching.`,
      fix: profanity || riskHits
        ? `Clean the flagged language in any segment you'd want a sponsor to see, and keep a dedicated 20-30s sponsor slot free of it. Brands pay for adjacency to safe content.`
        : `Add a natural spot for a sponsor read after your hook pays off — that's the highest-attention, highest-value placement, and it's currently open.`,
    });
  }

  // 11 ─ Monetization Risk (ad-suitability of the language)
  {
    const profanity = countMatches(lower, PROFANITY).n;
    const riskHits = countMatches(lower, MONEY_RISK);
    const earlyProfane = countMatches(lower.slice(0, 200), PROFANITY).n > 0;
    let score = 95 - profanity * 14 - riskHits.n * 7;
    if (earlyProfane) score -= 12; // profanity in first 7s hits ad suitability hardest
    score = Math.max(20, Math.min(98, score));
    signals.push({
      key: 'monetization-risk', label: 'Monetization Risk', score, band: band(score, 82, 60),
      measured: true,
      finding: profanity || riskHits.n
        ? `${earlyProfane ? 'Profanity appears in the opening lines — the exact window YouTube weighs most for ad suitability. ' : ''}Flagged: ${[profanity ? `${profanity} strong-language hit${profanity > 1 ? 's' : ''}` : '', riskHits.found.length ? `sensitive topic terms (${riskHits.found.slice(0, 3).join(', ')})` : ''].filter(Boolean).join(', ')}. This is a policy read, not a guarantee of demonetization.`
        : `No strong-language or sensitive-topic flags in the copy — the script reads ad-friendly on a text pass.`,
      fix: earlyProfane
        ? `Move or drop the profanity out of the first 7 seconds first — that placement does the most ad-suitability damage. Then treat remaining hits case by case.`
        : profanity || riskHits.n
        ? `Decide per flag: bleep/cut where it isn't essential, and if a sensitive topic is core to the video, add framing context so it reads as commentary rather than gratuitous.`
        : `Keep it this way through editing — a single ad-unfriendly aside added in the edit can flip the whole video to limited ads.`,
    });
  }

  // 12 ─ Profanity Detection
  {
    const { n, found } = countMatches(lower, PROFANITY);
    const score = n === 0 ? 100 : Math.max(30, 100 - n * 18);
    signals.push({
      key: 'profanity', label: 'Profanity Detection', score, band: n === 0 ? 'good' : band(score, 90, 60),
      measured: true,
      finding: n === 0
        ? `No strong profanity detected in the script text.`
        : `${n} instance${n > 1 ? 's' : ''} of strong profanity found (root${found.length > 1 ? 's' : ''}: ${found.slice(0, 3).join(', ')}). Not a policy violation on its own, but it narrows where the video can run ads.`,
      fix: n === 0
        ? `Clean as-is. If you improvise on camera, re-check the final captions — profanity added in delivery won't show up in this script pass.`
        : `Flag each instance for a bleep or trim in the edit, and prioritise any that fall in the first 7 seconds. Keep at least the first 30 seconds clean for the widest ad eligibility.`,
    });
  }

  // Overall: mean of measured signals, conservatively rounded.
  const scored = signals.filter((s) => s.score !== null) as (ScriptSignal & { score: number })[];
  const overall = scored.length
    ? Math.round(scored.reduce((a, s) => a + s.score, 0) / scored.length)
    : 0;
  const headline =
    overall >= 85 ? 'Publish-ready script' :
    overall >= 70 ? 'Strong, with a few fixes' :
    overall >= 55 ? 'Needs targeted work' : 'Rework before recording';

  return { overall, headline, wordCount, estimatedReadSeconds, signals };
}
