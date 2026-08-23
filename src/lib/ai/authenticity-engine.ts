/**
 * Content Authenticity & Monetization Risk engine.
 *
 * ── THE ONE RULE ──────────────────────────────────────────────────────────────
 * This engine NEVER claims content is AI-generated. AI-origin detection is not a
 * decidable problem: every published detector produces false positives, and the
 * people they hit hardest are non-native English speakers and writers with clean,
 * structured prose. A creator wrongly told "your video looks AI-generated" is the
 * worst failure this product can have — worse than missing a real signal.
 *
 * So the output is always four things together, never a verdict:
 *   1. a RISK BAND     — how strongly the content READS as AI-generated
 *   2. a CONFIDENCE    — bounded by how much we could actually observe
 *   3. EVIDENCE        — the signals that fired, each with a checkable location
 *   4. FALSE POSITIVES — why an honest human draft could score the same
 *
 * Signals we could not evaluate are reported as INCONCLUSIVE, never as passing.
 * "We didn't check the video track" and "the video track is clean" are different
 * statements, and conflating them is how a creator gets blindsided after upload.
 *
 * The LLM path adds nuance; the heuristic path is fully deterministic and runs
 * whenever the model is unreachable. Both obey every rule above, and the
 * heuristic result is the floor the LLM cannot talk us out of.
 */

import { chatJSON } from './nvidia';
import {
  TRUST_SYSTEM_PREAMBLE,
  scrubForbidden,
  conservativeScore,
} from './guardrails';
import type {
  AuthenticityAssessment,
  AuthenticityEvidence,
  AuthenticityRisk,
  MonetizationRiskAnalysis,
  MonetizationRiskCategory,
  MonetizationRiskItem,
  Scorecard,
  VoiceMetric,
  ThumbnailMetric,
  CopyrightMetric,
  PlatformReport,
} from '../types';

export interface AuthenticityInput {
  title: string;
  description?: string;
  scriptText?: string;
  tags?: string[];
  durationSeconds?: number;
  /** Creator's own declaration. A disclosure, NOT a detection result. */
  aiGenerated?: boolean;
  hasWatermark?: boolean;
  hasThumbnail?: boolean;
  /** True when a real transcription ran, so voice signals are measured not inferred. */
  audioMeasured?: boolean;
  measuredVoice?: {
    speakingPaceWpm: number | null;
    pauseRatio: number | null;
    isMonotone: boolean | null;
  };
}

/**
 * Hard ceiling on confidence. We do not have frame-level video, waveform
 * analysis, or provenance metadata (C2PA), so we can never be more than
 * "reasonably confident" about how content reads. 90 is the honest maximum.
 */
const CONFIDENCE_CEILING = 90;
const CONFIDENCE_FLOOR = 25;

/**
 * How much each input layer contributes to confidence. Script text carries the
 * most authenticity signal because lexical and structural tells are what we can
 * actually observe; video carries the least because we cannot read frames.
 */
const LAYER_WEIGHT = {
  script: 42,
  audio: 20,
  duration: 8,
  thumbnail: 12,
  metadata: 10,
  declaration: 8,
} as const;

/**
 * Confidence is derived from what we could actually observe — never asserted.
 * A review with only a title and no script genuinely cannot support a confident
 * authenticity call, and this function is what forces us to admit that.
 */
function computeCoverage(input: AuthenticityInput): number {
  const words = wordCount(input.scriptText ?? '');
  let coverage = 0;

  // Script coverage scales with length: 40 words is not enough text to judge
  // structure, 400+ is. Below 40 we get a fraction of the weight, not all of it.
  if (words >= 400) coverage += LAYER_WEIGHT.script;
  else if (words > 0) coverage += Math.round(LAYER_WEIGHT.script * (words / 400));

  if (input.audioMeasured) coverage += LAYER_WEIGHT.audio;
  if (typeof input.durationSeconds === 'number' && input.durationSeconds > 0) {
    coverage += LAYER_WEIGHT.duration;
  }
  if (input.hasThumbnail) coverage += LAYER_WEIGHT.thumbnail;
  if ((input.description ?? '').trim() || (input.tags?.length ?? 0) > 0) {
    coverage += LAYER_WEIGHT.metadata;
  }
  // A creator declaration is ground truth about origin, so it genuinely raises
  // how sure we can be — it is the only input here that isn't an inference.
  if (input.aiGenerated) coverage += LAYER_WEIGHT.declaration;

  return Math.min(CONFIDENCE_CEILING, Math.max(CONFIDENCE_FLOOR, coverage));
}

/**
 * The signals we WANTED to evaluate but could not, given the inputs supplied.
 * This list is the difference between "checked and clean" and "never checked",
 * and the UI renders it with equal prominence to the evidence list.
 */
function inconclusiveSignals(input: AuthenticityInput): string[] {
  const out: string[] = [];
  const words = wordCount(input.scriptText ?? '');

  if (words === 0) {
    out.push(
      'Lexical and structural analysis (connector density, sentence-length variance, repeated phrasing) — no script or transcript was supplied, so none of the text-level authenticity signals could run.',
    );
  } else if (words < 120) {
    out.push(
      `Sentence-length variance and repeated-phrasing checks — the supplied text is ${words} words, below the ~120 words these signals need to separate a writing style from a sample-size artifact.`,
    );
  }

  if (!input.audioMeasured) {
    out.push(
      'Synthetic-voice characteristics (pitch variance, breath and pause placement, splice artifacts) — no audio track was processed, so voice naturalness is inferred from how the transcript reads, not measured from the waveform.',
    );
  }
  if (!input.hasThumbnail) {
    out.push(
      'Thumbnail authenticity (generative artifacts, malformed hands and text, upscaling residue) — no thumbnail was supplied to the vision model.',
    );
  }

  // We are honest that frame-level analysis simply does not exist in the product
  // yet, rather than quietly omitting the category.
  out.push(
    'Frame-level visual signals (lip-sync drift, scene-transition regularity, per-frame generative artifacts, embedded AI watermarks) — Publish does not decode the video track, so these are unevaluated on every review, not just this one.',
  );
  out.push(
    'Provenance metadata (C2PA / Content Credentials, camera EXIF, editor fingerprints) — not read from the uploaded file, so a cryptographically signed capture history could neither confirm nor clear this content.',
  );

  return out;
}

/**
 * Why an honest human draft could produce this same assessment.
 * Required on every result. Never conditional on the risk band — a Low-risk
 * result also needs its caveats, because a fluent AI script can read as human.
 */
function falsePositiveReasons(input: AuthenticityInput, evidence: AuthenticityEvidence[]): string[] {
  const out: string[] = [
    'Detectors key on polish, not origin. Scripted, rehearsed, or heavily edited writing — the exact discipline that makes a good video — produces the same regularity as generated text.',
    'Writers using English as a second or additional language, and writers trained in formal, academic, or corporate registers, are flagged disproportionately by every published AI-text detector. A high risk band here is not evidence about you.',
  ];

  if (evidence.some((e) => e.signal.includes('connector') || e.signal.includes('Connector'))) {
    out.push(
      'The flagged connective phrases are ordinary English. They are weighted because they appear at higher rates in generated text, not because a human would not write them — a single "however" or "furthermore" carries almost no signal on its own.',
    );
  }
  if (evidence.some((e) => e.signal.toLowerCase().includes('sentence length'))) {
    out.push(
      'Uniform sentence length is also what teleprompter scripts, voiceover copy written to a timing target, and tightly edited explainer formats look like. Consistency here can be craft rather than generation.',
    );
  }
  if (evidence.some((e) => e.signal.toLowerCase().includes('first-person'))) {
    out.push(
      'Absence of personal anecdote is a genre convention in tutorials, news, and documentary formats. Its absence says something about the format, not the author.',
    );
  }
  if (input.aiGenerated) {
    out.push(
      'You declared AI assistance yourself, so this result reflects your disclosure rather than a detection. Assisted drafting — outlining, tightening, or translating your own material — is not the same as generated content, and platforms treat them differently.',
    );
  }

  return out;
}

/** Structural limits of this analysis, stated plainly rather than buried. */
function analysisLimitations(): string[] {
  return [
    'No AI-origin detector is reliable enough to be treated as proof, including this one. Treat the risk band as a prompt to review, never as a finding about you or as something a platform has decided.',
    'Publish reads the text, metadata, and any thumbnail or audio you attach. It does not decode video frames, and it does not query any platform for a monetization or policy decision.',
    'Platform policies change without notice and are enforced by systems we cannot inspect. A Low risk band here does not mean a platform has cleared the content, and no result here can guarantee monetization, detection, or approval.',
  ];
}

// ─── Deterministic signal detectors ─────────────────────
//
// These are the floor. They run with no model, they are auditable line by line,
// and the LLM path can only ever ADD nuance on top of them. Every detector also
// returns human-indicating signals, so a genuinely human draft gets credit for
// the signals that prove it rather than a blank where red flags would be.

/**
 * Count of word tokens, ignoring pure punctuation.
 *
 * A token must START on a letter or digit; apostrophes and hyphens only count
 * when they join two of them ("don't", "cutting-edge"). Allowing them to stand
 * alone would score a dash-separated transcript line — "- and then this" — as
 * carrying an extra word, which inflates the coverage math that bounds how
 * confident this engine is allowed to be.
 */
export function wordCount(text: string): number {
  return text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length ?? 0;
}

function sentenceLengths(text: string): number[] {
  return (text.match(/[^.!?]+[.!?]+/g) ?? []).map(wordCount).filter((n) => n > 0);
}

/** Std dev of sentence length in words. null when there is too little text to judge. */
function sentenceLengthStdDev(text: string): number | null {
  const lens = sentenceLengths(text);
  if (lens.length < 5) return null;
  const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
  return Math.sqrt(lens.reduce((acc, n) => acc + (n - mean) ** 2, 0) / lens.length);
}

const CONNECTORS =
  /\b(however|furthermore|moreover|additionally|consequently|in conclusion|delve into|landscape of|it is important to note|cutting-edge|leverage|utilize|in order to|undoubtedly|in today's fast-paced world)\b/gi;

const TRANSITIONS =
  /\b(however|furthermore|moreover|additionally|consequently|therefore|in conclusion)\b/gi;

const HEDGING =
  /\b(essentially|basically|in essence|in summary|to summarize|when it comes to|in the world of|in the realm of|at the end of the day|the bottom line is)\b/gi;

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Evaluates every text-level signal we can actually observe.
 * Returns evidence in BOTH directions plus a 0-100 score where higher reads more
 * human. Deterministic: same input always yields the same result.
 */
export function detectTextSignals(
  scriptText: string,
  aiGenerated?: boolean,
): { evidence: AuthenticityEvidence[]; score: number } {
  const evidence: AuthenticityEvidence[] = [];
  const text = scriptText.trim();
  if (!text) return { evidence, score: 50 };

  const lowered = text.toLowerCase();
  const words = wordCount(text);
  let score = 50;

  // ── Connective density ───────────────────────────────
  const connectors = text.match(CONNECTORS);
  if (connectors && connectors.length >= 2) {
    const rate = connectors.length / Math.max(words, 1);
    evidence.push({
      signal: 'Dense connective phrasing',
      location: `"${[...new Set(connectors)].slice(0, 4).join('", "')}"`,
      detail: `${connectors.length} connective or filler phrases at ~${(rate * 100).toFixed(1)}% of words, above the ~0.6% rate typical of human drafts.`,
      weight: rate > 0.02 ? 'strong' : 'moderate',
      direction: 'ai-indicator',
    });
    score -= Math.min(22, 8 + Math.round(rate * 600));
  } else if (connectors?.length === 1) {
    // One connector is ordinary English. Recorded, but it moves nothing.
    evidence.push({
      signal: 'Single connector phrase',
      location: `"${connectors[0]}"`,
      detail: 'One connective phrase at normal density, consistent with human drafting — only clustered connectors carry signal.',
      weight: 'weak',
      direction: 'human-indicator',
    });
  }

  // ── Sentence-length variance ─────────────────────────
  const sd = sentenceLengthStdDev(text);
  if (sd !== null && words >= 60) {
    if (sd < 2.6) {
      evidence.push({
        signal: 'Uniform sentence length',
        location: 'across the full script',
        detail: `Sentence length varies by only ${sd.toFixed(1)} words (std dev), tighter than the short/long alternation of most human prose. Teleprompter and voiceover copy written to a timing target also look like this, so this is a weak-to-moderate indicator alone.`,
        weight: sd < 1.8 ? 'moderate' : 'weak',
        direction: 'ai-indicator',
      });
      score -= 6;
    } else if (sd > 4.5) {
      evidence.push({
        signal: 'Varied sentence rhythm',
        location: 'across the full script',
        detail: `Sentence length varies by ${sd.toFixed(1)} words (std dev) — the short/long alternation that reads as a spoken human voice.`,
        weight: 'moderate',
        direction: 'human-indicator',
      });
      score += 6;
    }
  }

  // ── Transition scaffolding ───────────────────────────
  // Gated on length and count for two reasons. On short text the density
  // denominator is tiny, so a single "however" in three sentences reads as 4% of
  // the script and fires a signal that means nothing. And TRANSITIONS overlaps
  // CONNECTORS: without the count gate, one connector would be recorded above as
  // ordinary English carrying no weight, then quietly docked 5 points here.
  const transitions = text.match(TRANSITIONS)?.length ?? 0;
  const transDensity = transitions / Math.max(words, 1);
  if (transitions >= 2 && words >= 60 && transDensity > 0.02) {
    evidence.push({
      signal: 'Frequent sequence transitions',
      location: 'throughout the script',
      detail: `${(transDensity * 100).toFixed(1)}% of words are sequence transitions — the uniform scaffolding generated text uses to stitch sections together.`,
      weight: transDensity > 0.035 ? 'moderate' : 'weak',
      direction: 'ai-indicator',
    });
    score -= 5;
  }

  // ── Repeated sentence openers ────────────────────────
  const openers = new Map<string, number>();
  for (const s of text.split(/(?<=[.!?])\s+/)) {
    const first = s.match(/^[A-Za-z]+/)?.[0]?.toLowerCase();
    if (first) openers.set(first, (openers.get(first) ?? 0) + 1);
  }
  const repeatedOpeners = [...openers.entries()].filter(([, n]) => n >= 3);
  if (repeatedOpeners.length > 0) {
    evidence.push({
      signal: 'Repeated sentence openers',
      location: repeatedOpeners.slice(0, 3).map(([w, n]) => `"${w}" ×${n}`).join(', '),
      detail: 'Multiple sentences open on the same word — a cadence signature of generated text, and also of breath-limited voiceover pacing.',
      weight: repeatedOpeners.some(([, n]) => n >= 4) ? 'moderate' : 'weak',
      direction: 'ai-indicator',
    });
    score -= 4;
  }

  // ── Filler / throat-clearing ─────────────────────────
  const hedges = text.match(HEDGING);
  if (hedges && hedges.length >= 2) {
    evidence.push({
      signal: 'Filler and throat-clearing phrases',
      location: `"${[...new Set(hedges)].slice(0, 3).join('", "')}"`,
      detail: `${hedges.length} filler phrases that pad the line without adding information.`,
      weight: hedges.length >= 3 ? 'moderate' : 'weak',
      direction: 'ai-indicator',
    });
    score -= 4;
  }

  // ── Lexical diversity ────────────────────────────────
  const tokens = text.match(/[A-Za-z']+/g) ?? [];
  const diversity = tokens.length > 0 ? new Set(tokens.map((t) => t.toLowerCase())).size / tokens.length : 0;
  if (words >= 60) {
    if (diversity > 0.62) {
      evidence.push({
        signal: 'High lexical diversity',
        location: 'across the full script',
        detail: `${(diversity * 100).toFixed(0)}% of words are unique — vocabulary range that reads as a human with something specific to say.`,
        weight: 'moderate',
        direction: 'human-indicator',
      });
      score += 5;
    } else if (diversity < 0.40) {
      evidence.push({
        signal: 'Narrow vocabulary range',
        location: 'across the full script',
        detail: `Only ${(diversity * 100).toFixed(0)}% of words are unique — the narrow band generated text falls into when it restates rather than advances.`,
        weight: 'weak',
        direction: 'ai-indicator',
      });
      score -= 4;
    }
  }

  // ── First-person register ────────────────────────────
  const firstPerson = lowered.match(/\b(i|i've|i'm|i'll|i'd|my|mine)\b/g)?.length ?? 0;
  if (firstPerson >= 3 && words >= 60) {
    evidence.push({
      signal: 'First-person narrative voice',
      location: 'throughout the script',
      detail: `${firstPerson} first-person references — the register humans use for lived experience and opinion.`,
      weight: 'moderate',
      direction: 'human-indicator',
    });
    score += 5;
  }

  // ── Concrete specifics ───────────────────────────────
  const numbers = text.match(/\$[\d,.]+k?|\b\d+(?:\.\d+)?%?\b/g)?.length ?? 0;
  const specifics =
    lowered.match(/\b(actually|specifically|for example|one time|last week|yesterday|my (first|last|own))\b/g)?.length ?? 0;
  if (numbers >= 3 || specifics >= 2) {
    evidence.push({
      signal: 'Concrete specifics and figures',
      location: 'throughout the script',
      detail: `${numbers} numeric references and ${specifics} specificity markers — detail density that generated text tends not to invent and human drafts reach for naturally.`,
      weight: numbers >= 5 ? 'strong' : 'moderate',
      direction: 'human-indicator',
    });
    score += 7;
  }

  // ── Stock close ──────────────────────────────────────
  if (/\bin conclusion\b/i.test(text)) {
    evidence.push({
      signal: 'Stock summarizing close',
      location: '"in conclusion"',
      detail: 'The script resolves on a generic summarizer rather than a specific takeaway — a structural habit of generated long-form text.',
      weight: 'moderate',
      direction: 'ai-indicator',
    });
    score -= 5;
  }

  // A creator's own declaration caps the human-reading score. This is their
  // disclosure being honoured, not a detection result.
  if (aiGenerated) score = Math.min(score, 45);

  return { evidence, score: clampScore(score) };
}

/**
 * Maps a human-authenticity score to a risk band, with two guards that exist
 * specifically to stop false accusations:
 *
 *   1. HIGH requires at least one STRONG ai-indicator. A pile of weak signals
 *      never escalates to High on its own — that is how clean human writing
 *      gets wrongly flagged.
 *   2. HIGH requires confidence ≥ 55. If we barely saw anything, we are not
 *      entitled to the strongest claim available to us.
 *
 * A creator declaration sets a Medium floor (mirroring voice-engine's rule that
 * declared-AI never reads "Low") but never by itself produces High: disclosing
 * is the behaviour we want to encourage, not punish.
 */
export function deriveRisk(
  score: number,
  confidence: number,
  evidence: AuthenticityEvidence[],
  creatorDeclared: boolean,
): AuthenticityRisk {
  const hasStrong = evidence.some((e) => e.direction === 'ai-indicator' && e.weight === 'strong');

  let band: AuthenticityRisk;
  if (score < 50 && hasStrong && confidence >= 55) band = 'High';
  else if (score < 72) band = 'Medium';
  else band = 'Low';

  if (creatorDeclared && band === 'Low') band = 'Medium';
  return band;
}

/**
 * Location-anchored fixes derived from the signals that actually fired.
 * Each one names WHERE, WHY (with the mechanism), WHAT (a concrete change), and
 * an HONEST impact. Nothing here matches the banned-generic blocklist — no
 * "sound more natural", no "add emotion", no "vary your tone".
 */
function buildRecommendations(
  input: AuthenticityInput,
  evidence: AuthenticityEvidence[],
): string[] {
  const out: string[] = [];
  const fired = (name: string) =>
    evidence.find((e) => e.direction === 'ai-indicator' && e.signal === name);

  const connectors = fired('Dense connective phrasing');
  if (connectors) {
    out.push(
      `Delete the connectors at ${connectors.location} and let the sentences butt against each other. These specific words are the highest-frequency lexical markers every AI-text classifier keys on, and they read as padding to viewers regardless of who wrote them: "However, it is important to note that batching saves time" → "Batching saves time." The sentence loses nothing and drops a scored marker; the effect on any individual platform's classifier is not something we can measure from here.`,
    );
  }

  const uniform = fired('Uniform sentence length');
  if (uniform) {
    out.push(
      `Break up the even rhythm by splitting your two longest sentences and merging two short ones — the variance across the script is currently under 2.6 words, and both classifiers and listeners register that flatness. Take any sentence over 25 words and cut it at its conjunction into a long clause followed by a three-word punch. This changes the measured variance directly; whether it changes a given platform's internal scoring is not observable to us.`,
    );
  }

  const openers = fired('Repeated sentence openers');
  if (openers) {
    out.push(
      `Rewrite the openers flagged at ${openers.location} so no word starts more than two sentences. Repeating the same first word sets a metronome the listener stops hearing past the third repetition, which is where mid-video drop-off concentrates on voice-led content. Change the second and third instances to start on the subject of the sentence instead of the connective.`,
    );
  }

  const hedges = fired('Filler and throat-clearing phrases');
  if (hedges) {
    out.push(
      `Cut ${hedges.location} outright — each one delays the informative word in its sentence by two to four syllables. On short-form the opening 3-5 seconds decide whether the platform keeps serving the video, so filler in the first two sentences costs the most: "Basically, when it comes to lighting, you want soft light" → "Soft light. That's the whole trick."`,
    );
  }

  const stockClose = fired('Stock summarizing close');
  if (stockClose) {
    out.push(
      `Replace the "in conclusion" close with the single most specific thing the viewer should do next. A stock summarizer restates what they just watched, giving no reason to stay through the end screen — and end-screen watch time is what feeds the next-video recommendation. Name one action and one number from your own script instead.`,
    );
  }

  if (input.aiGenerated) {
    out.push(
      `You've declared AI generation, so set the "Altered content" disclosure in YouTube Studio's Details step (Content > Editor after publishing) if any part of this could be taken for a real person, place, or event. YouTube's synthetic-content policy expects the label there, and for EU viewers the AI Act's transparency duty applies. Disclosing puts the label on your terms rather than YouTube's, and it does not reduce reach or watch time — omitting it, with repeats, is what escalates toward enforcement.`,
    );
  }

  // No fired signals and no declaration — say so plainly rather than manufacture
  // a fix for a script that doesn't need one.
  if (out.length === 0) {
    out.push(
      `No AI-indicating text signals fired on this script — connector density, sentence-length variance, opener repetition, and filler rate all sit inside human-typical ranges. There is nothing to change here for authenticity reasons. The layers listed as inconclusive below were not evaluated at all, so this is not a clearance of the video as a whole.`,
    );
  }

  return out.map((r) => scrubForbidden(r).clean);
}

// ─── Monetization risk ──────────────────────────────────
//
// Each rule names the platform mechanism it maps to. We flag EXPOSURE — the
// thing a reviewer or classifier could act on — never a prediction that a
// platform will act. Categories with no signal are not listed as "passing";
// they are simply absent, and the ones we could not evaluate go in
// `inconclusive` so the gap is visible.

interface RiskRule {
  category: MonetizationRiskCategory;
  /** Where to look. Script covers transcript text; metadata covers title+description+tags. */
  scope: 'script' | 'metadata' | 'both';
  pattern: RegExp;
  risk: AuthenticityRisk;
  confidence: number;
  why: string;
  fix: string;
}

/**
 * Keyword rules are intentionally narrow. A broad profanity or violence regex
 * produces constant false alarms on ordinary content (cooking "kill the heat",
 * gaming "headshot"), and an alert a creator learns to ignore is worse than no
 * alert. Where a term is genuinely ambiguous we set Low/Medium and say so in
 * `why` rather than escalating.
 */
const RISK_RULES: RiskRule[] = [
  {
    category: 'Profanity',
    scope: 'script',
    pattern: /\b(fuck\w*|shit\w*|bitch\w*|asshole|motherfucker)\b/gi,
    risk: 'High',
    confidence: 80,
    why: "YouTube's advertiser-friendly guidelines treat strong profanity in the first 7 seconds, or repeated through a video, as limiting ad suitability — the yellow-icon path rather than removal.",
    fix: 'Bleep or cut the flagged words, and keep the opening 7 seconds clean regardless of what follows. If the word is load-bearing for the story, mute the audio over it and leave the caption censored.',
  },
  {
    category: 'Profanity',
    scope: 'metadata',
    pattern: /\b(fuck\w*|shit\w*|bitch\w*)\b/gi,
    risk: 'High',
    confidence: 88,
    why: 'Profanity in a title, description, or tag is read by the metadata classifier directly and weighs more than the same word inside the video, because it is what surfaces in search and suggested feeds.',
    fix: 'Remove the term from the title, description, and tags entirely. Metadata has no bleeping equivalent — the word either is there or is not.',
  },
  {
    category: 'Hate speech',
    scope: 'both',
    pattern: /\b(all (muslims|jews|blacks|whites|gays|women|men) are|subhuman|ethnic cleansing|racial superiority)\b/gi,
    risk: 'High',
    confidence: 70,
    why: 'Generalizations targeting a protected group fall under hate-speech policy on every major platform, which is a removal-and-strike path rather than a demonetization path.',
    fix: 'Cut the generalization. If you are quoting or critiquing the statement, frame it explicitly as a quotation on screen and in the caption before it is spoken, so the classifier and a human reviewer both see the framing.',
  },
  {
    category: 'Violence',
    scope: 'script',
    pattern: /\b(graphic (footage|violence)|beheading|torture|mass shooting|execution video)\b/gi,
    risk: 'High',
    confidence: 72,
    why: 'Graphic violence descriptors trigger the advertiser-suitability filter even in news or commentary framing, where the content stays up but ads are limited or removed.',
    fix: 'Add a spoken and on-screen content note before the section, avoid the graphic descriptor in the title and thumbnail, and keep the depiction non-explicit. News and educational framing helps suitability but does not exempt the content.',
  },
  {
    category: 'Medical misinformation',
    scope: 'both',
    pattern: /\b(cures? (cancer|covid|diabetes|autism)|miracle cure|big pharma (doesn'?t|does not) want|vaccines? cause autism|natural cure for)\b/gi,
    risk: 'High',
    confidence: 78,
    why: 'Health claims contradicting public-health consensus are removable under YouTube medical-misinformation policy and Meta content-monetization policy, independent of whether the claim is presented as opinion.',
    fix: 'Cut the claim or attribute it to a named, citable source on screen, and add an explicit "this is not medical advice — talk to your doctor" line in both the audio and the description.',
  },
  {
    category: 'Spam signals',
    scope: 'metadata',
    pattern: /\b(click here|link in bio for free|free money|get rich quick|make \$\d+ (a|per) day|guaranteed income|100% free)\b/gi,
    risk: 'Medium',
    confidence: 74,
    why: 'Incentive and get-rich phrasing in metadata maps to the spam-and-deceptive-practices classifier, which reduces distribution before any human review happens.',
    fix: 'Replace the incentive phrasing with the specific outcome the video actually delivers. "Make $500 a day" → the concrete method and realistic figure your own content supports.',
  },
  {
    category: 'Clickbait',
    scope: 'metadata',
    pattern: /\b(you won'?t believe|shocking truth|gone wrong|doctors hate|this one trick|the secret they|nobody tells you|will blow your mind)\b/gi,
    risk: 'Medium',
    confidence: 70,
    why: 'These phrases map to the misleading-metadata signal. The mechanism that hurts is the mismatch: viewers arrive expecting the promise, leave early when it is not delivered, and the resulting retention drop is what suppresses distribution.',
    fix: 'Replace the phrase with the actual specific from your script — the real number, the real outcome, the real surprise. Curiosity that the video pays off is not penalized; curiosity it does not pay off is.',
  },
  {
    category: 'Deceptive editing',
    scope: 'script',
    pattern: /\b(taken out of context|deepfake|face ?swap|voice clone|impersonat\w+)\b/gi,
    risk: 'Medium',
    confidence: 62,
    why: 'Synthetic or recontextualized depictions of real people fall under the altered-content disclosure requirement, and undisclosed use is what converts a labelling issue into an enforcement one.',
    fix: 'Set the "Altered content" disclosure in the Details step, and add an on-screen label at the first frame of the affected section naming what was synthesized.',
  },
  {
    category: 'Copyright exposure',
    scope: 'script',
    pattern: /\b(full (song|episode|movie)|copyrighted (music|clip)|no copyright intended|fair use disclaimer)\b/gi,
    risk: 'High',
    confidence: 76,
    why: '"No copyright intended" has no legal effect and does not prevent a Content ID claim; the waveform match happens at upload regardless of intent or attribution.',
    fix: 'Replace the track with a licensed or Audio Library cut, or cut the segment. If you hold a licence, keep the receipt ready for a claim dispute — the claim will still be filed automatically.',
  },
];

/** Case-insensitive first-match location with a short surrounding excerpt. */
function locate(text: string, match: string): string {
  const idx = text.toLowerCase().indexOf(match.toLowerCase());
  if (idx === -1) return `"${match}"`;
  const line = text.slice(0, idx).split('\n').length;
  const start = Math.max(0, idx - 30);
  const excerpt = text.slice(start, Math.min(text.length, idx + match.length + 30)).replace(/\s+/g, ' ').trim();
  return `line ${line}: "…${excerpt}…"`;
}

const RISK_PENALTY: Record<AuthenticityRisk, number> = { High: 26, Medium: 12, Low: 5 };

export interface MonetizationRiskContext {
  copyright?: CopyrightMetric;
  thumbnail?: ThumbnailMetric;
  voice?: VoiceMetric;
  platformReports?: PlatformReport[];
  authenticityRisk?: AuthenticityRisk;
}

/**
 * Deterministic monetization-risk pass. Runs the keyword rules over script and
 * metadata, then folds in what the other engines already measured (copyright
 * fingerprints, thumbnail clickbait, synthetic-voice risk, per-platform policy
 * status) so the creator sees one consolidated exposure list rather than having
 * to reconcile six panels.
 */
export function analyzeMonetizationRisk(
  input: AuthenticityInput,
  ctx: MonetizationRiskContext = {},
): MonetizationRiskAnalysis {
  const script = (input.scriptText ?? '').trim();
  const metadata = [input.title, input.description ?? '', ...(input.tags ?? [])].join('\n');
  const items: MonetizationRiskItem[] = [];
  const seen = new Set<string>();

  for (const rule of RISK_RULES) {
    const haystacks: [string, string][] = [];
    if (rule.scope === 'script' || rule.scope === 'both') haystacks.push(['script', script]);
    if (rule.scope === 'metadata' || rule.scope === 'both') haystacks.push(['metadata', metadata]);

    for (const [where, hay] of haystacks) {
      if (!hay) continue;
      const match = hay.match(rule.pattern)?.[0];
      if (!match) continue;
      // One item per category+scope: three profanities is one finding to fix,
      // not three separate alarms.
      const key = `${rule.category}:${where}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        category: rule.category,
        risk: rule.risk,
        confidence: rule.confidence,
        location: where === 'metadata' ? `title/description/tags: "${match}"` : locate(hay, match),
        why: rule.why,
        fix: rule.fix,
      });
    }
  }

  // ── Fold in measured signals from the other engines ──
  if (ctx.copyright && ctx.copyright.musicMatchRisk !== 'Low') {
    items.push({
      category: 'Copyright exposure',
      risk: ctx.copyright.musicMatchRisk,
      confidence: 65,
      location: 'audio track',
      why: `The copyright layer rated music-match risk ${ctx.copyright.musicMatchRisk}. A Content ID match diverts revenue to the claimant automatically at upload — it does not wait for review, and it is not a strike.`,
      fix: 'Swap the track for an Audio Library or licensed cut before publishing. If you hold a licence, upload anyway and keep the documentation ready to dispute the claim — the claim itself is unavoidable.',
    });
  }
  if (ctx.copyright?.watermarkDetected) {
    items.push({
      category: 'Brand safety',
      risk: 'Medium',
      confidence: 70,
      location: 'video overlay',
      why: 'A third-party platform watermark marks the upload as recycled, which reduces distribution on Reels and disqualifies it from TikTok Creator Rewards outright.',
      fix: 'Re-export from your editor without the watermark, or crop it out if the composition allows. Save natively rather than downloading from the other platform.',
    });
  }
  if (ctx.thumbnail?.measured && ctx.thumbnail.clickbaitRisk !== 'Low') {
    items.push({
      category: 'Misleading thumbnail',
      risk: ctx.thumbnail.clickbaitRisk,
      confidence: 60,
      location: 'thumbnail image',
      why: `The vision layer rated thumbnail clickbait risk ${ctx.thumbnail.clickbaitRisk}. The penalty is indirect: a thumbnail promising more than the video delivers drives early exits, and it is that retention drop that suppresses distribution.`,
      fix: 'Change the thumbnail so its claim is one the first 30 seconds actually pays off. Keep the visual tension, remove the part the video does not deliver.',
    });
  }
  if (ctx.voice && ctx.voice.syntheticArtifactRisk !== 'Low') {
    items.push({
      category: 'Automation signals',
      risk: ctx.voice.syntheticArtifactRisk,
      confidence: ctx.voice.measured ? 68 : 45,
      location: 'voiceover track',
      why: `Synthetic-voice risk was rated ${ctx.voice.syntheticArtifactRisk}${ctx.voice.measured ? ' from the processed audio' : ' from how the transcript reads, since no audio was processed'}. Mass-produced synthetic narration is what the reused-content policy targets; a disclosed synthetic voice over original writing is not.`,
      fix: 'Keep the commentary and structure original, and set the altered-content disclosure if the voice could pass for a real identifiable person. The policy targets low-effort volume, not synthesis itself.',
    });
  }
  const atRisk = (ctx.platformReports ?? []).filter((p) => p.policyStatus === 'At Risk');
  if (atRisk.length > 0) {
    items.push({
      category: 'Advertiser suitability',
      risk: 'High',
      confidence: 66,
      location: `${atRisk.map((p) => p.platform).join(', ')} policy check`,
      why: `The platform layer rated ${atRisk.length === 1 ? 'this platform' : 'these platforms'} "At Risk" against published policy: ${atRisk.map((p) => `${p.platform} — ${p.adSuitability}`).join('; ')}.`,
      fix: 'Work the per-platform recommendations in the platform panel before publishing, starting with whichever platform you are publishing to first.',
    });
  }

  // Score from the worst finding plus a smaller penalty for each additional one,
  // so a single High is not diluted by counting and ten Lows do not read as fatal.
  const worst = items.reduce<number>((acc, i) => Math.max(acc, RISK_PENALTY[i.risk]), 0);
  const rest = items.reduce<number>((acc, i) => acc + RISK_PENALTY[i.risk], 0) - worst;
  const score = conservativeScore(clampScore(100 - worst - Math.round(rest * 0.45)));

  const inconclusive: string[] = [];
  if (!script) {
    inconclusive.push(
      'Profanity, violence, hate-speech, medical-claim, and deceptive-editing checks — these read the spoken words, and no script or transcript was supplied. They are unevaluated, not clear.',
    );
  }
  if (!input.hasThumbnail) {
    inconclusive.push('Misleading-thumbnail check — no thumbnail was supplied for the vision model to compare against the script.');
  }
  if (!ctx.copyright) {
    inconclusive.push('Copyright fingerprinting — the copyright layer did not return a result for this review.');
  }
  inconclusive.push(
    'On-screen text, graphic imagery, and gesture-level content — Publish does not decode video frames, so anything visual that is not in the thumbnail is unevaluated on every review.',
  );
  inconclusive.push(
    'Comment-section and community-signal risk — evaluated by platforms after publishing and not visible to any pre-publish check.',
  );

  const risk: AuthenticityRisk = items.some((i) => i.risk === 'High')
    ? 'High'
    : items.some((i) => i.risk === 'Medium')
      ? 'Medium'
      : 'Low';

  // Confidence in the monetization read tracks how much of the content we saw.
  const coverage = computeCoverage(input);

  return {
    score,
    confidence: Math.min(CONFIDENCE_CEILING, coverage),
    risk,
    items: items.map((i) => ({
      ...i,
      why: scrubForbidden(i.why).clean,
      fix: scrubForbidden(i.fix).clean,
    })),
    inconclusive,
    limitations: [
      'This is an exposure list, not a platform decision. Publish does not query YouTube, TikTok, or Meta for a monetization or policy ruling, and no result here can guarantee monetization or approval.',
      'Keyword rules catch explicit signals and miss implication, sarcasm, and visual context. A clean result here means no rule fired, not that a reviewer would agree.',
      'Advertiser suitability is also driven by factors outside the video — channel history, audience geography, and the advertiser demand of the moment — none of which are inputs here.',
    ],
  };
}

// ─── Full deterministic assessment ──────────────────────
//
// The heuristic floor for the whole authenticity layer. The LLM path (below)
// refines the score and phrasing; this is what guarantees the report still
// comes back honest and complete when the model is unreachable.

export function heuristicAuthenticity(
  input: AuthenticityInput,
  measuredVoice?: { speakingPaceWpm: number | null; pauseRatio: number | null; isMonotone: boolean | null },
): AuthenticityAssessment {
  const { evidence: textEvidence, score: textScore } = detectTextSignals(input.scriptText ?? '', input.aiGenerated);
  const evidence: AuthenticityEvidence[] = [...textEvidence];
  let score = textScore;
  let audioSignal: AuthenticityEvidence | null = null;

  // Measured audio: these are real DSP observations, not inferences, and they
  // carry more weight than any text heuristic.
  if (measuredVoice) {
    if (measuredVoice.isMonotone === true) {
      audioSignal = {
        signal: 'Monotone delivery',
        location: 'voice track',
        detail: 'Pitch variance across the track is near-flat — the delivery signature of synthetic narration.',
        weight: 'moderate',
        direction: 'ai-indicator',
      };
      score -= 8;
    } else if (measuredVoice.isMonotone === false) {
      evidence.push({
        signal: 'Natural pitch variation',
        location: 'voice track',
        detail: 'Pitch variance across the track reads as human intonation — a measured signal no text heuristic can fake.',
        weight: 'moderate',
        direction: 'human-indicator',
      });
      score += 8;
    }
    if (measuredVoice.speakingPaceWpm !== null) {
      if (measuredVoice.speakingPaceWpm < 95 || measuredVoice.speakingPaceWpm > 260) {
        audioSignal = {
          signal: 'Irregular speaking pace',
          location: 'voice track',
          detail: `Pace reads at ${measuredVoice.speakingPaceWpm} WPM — outside the ~95–260 WPM band human narration actually sustains, which is where synthetic voices drift.`,
          weight: 'moderate',
          direction: 'ai-indicator',
        };
        score -= 6;
      } else {
        evidence.push({
          signal: 'Human speaking pace',
          location: 'voice track',
          detail: `Pace reads at ${measuredVoice.speakingPaceWpm} WPM — inside the sustained human-narration band.`,
          weight: 'weak',
          direction: 'human-indicator',
        });
        score += 3;
      }
    }
    if (measuredVoice.pauseRatio !== null && measuredVoice.pauseRatio > 0.45) {
      audioSignal = {
        signal: 'Abnormal pause distribution',
        location: 'voice track',
        detail: `${(measuredVoice.pauseRatio * 100).toFixed(0)}% of the track is inter-word pause — far beyond the ~20–30% humans actually speak at, and a strong signature of spliced or synthetic audio.`,
        weight: 'strong',
        direction: 'ai-indicator',
      };
      score -= 10;
    }
  }

  if (audioSignal) evidence.push(audioSignal);
  if (input.hasWatermark) {
    evidence.push({
      signal: 'External watermark',
      location: 'video overlay',
      detail: 'A third-party platform watermark is visible, which marks the footage as recycled from elsewhere — the reused-content signal platforms act on.',
      weight: 'moderate',
      direction: 'ai-indicator',
    });
    score -= 4;
  }

  score = clampScore(score);
  const confidence = computeCoverage(input);
  const creatorDeclared = input.aiGenerated === true;
  const risk = deriveRisk(score, confidence, evidence, creatorDeclared);

  return {
    risk,
    humanAuthenticityScore: conservativeScore(score),
    confidence,
    creatorDeclared,
    evidence,
    inconclusive: inconclusiveSignals(input),
    falsePositiveReasons: falsePositiveReasons(input, evidence),
    limitations: analysisLimitations(),
    recommendations: buildRecommendations(input, evidence),
  };
}

// ─── Scorecards ─────────────────────────────────────────
//
// The report grid. Every cell must be able to say "not evaluated" (null value
// with honest evidence) instead of inventing a number for a layer we could not
// read. Confidence below the ceiling is a feature — it is how the UI tells the
// creator "we could not see everything" without a paragraph of text.

export interface ScorecardContext {
  authenticity?: AuthenticityAssessment;
  monetizationRisk?: MonetizationRiskAnalysis;
  textSignals: { evidence: AuthenticityEvidence[]; score: number };
  voice?: VoiceMetric;
  thumbnail?: ThumbnailMetric;
  copyright?: CopyrightMetric;
  platformReports?: PlatformReport[];
  title: string;
  description?: string;
  tags?: string[];
  aiGenerated?: boolean;
  hasWatermark?: boolean;
  hasThumbnail?: boolean;
  audioMeasured?: boolean;
  scriptText?: string;
}

/**
 * Builds all 11 scorecards from the assessments that ran. Deterministic.
 * `value: null` is the honest "could not evaluate this layer" state and the UI
 * must render it as such, never as a zero.
 */
export function buildScorecards(ctx: ScorecardContext): Scorecard[] {
  const cards: Scorecard[] = [];
  const t = ctx.textSignals;

  cards.push({
    id: 'human-authenticity',
    label: 'Human Authenticity',
    value: ctx.authenticity?.humanAuthenticityScore ?? null,
    confidence: ctx.authenticity?.confidence ?? 0,
    evidence: ctx.authenticity?.evidence.map((e) => `${e.signal} — ${e.location}`) ?? [],
    // A null card with nothing in either list renders as an empty panel, which
    // reads as "clean" — the exact conflation this engine exists to prevent.
    inconclusive: ctx.authenticity?.inconclusive ?? [
      'The authenticity layer did not return a result for this review, so no human-authenticity signal was evaluated. This is a gap in the analysis, not a clean result.',
    ],
    recommendations: ctx.authenticity?.recommendations ?? [],
    expectedImpact:
      'Applying the location-anchored fixes removes the specific markers both classifiers and viewers register; the exact effect on any platform scoring is not measurable from here.',
  });

  cards.push({
    id: 'content-quality',
    label: 'Content Quality',
    value: ctx.scriptText?.trim() ? t.score : null,
    confidence: computeCoverage({
      title: ctx.title,
      description: ctx.description,
      tags: ctx.tags,
      scriptText: ctx.scriptText,
      audioMeasured: ctx.audioMeasured,
      hasThumbnail: ctx.hasThumbnail,
      aiGenerated: ctx.aiGenerated,
    }),
    evidence: ctx.scriptText?.trim()
      ? t.evidence.map((e) => `${e.signal} — ${e.location}`)
      : ['No script or transcript was supplied'],
    inconclusive: ctx.scriptText?.trim()
      ? []
      : ['Text-level quality signals need a script or transcript; without one this layer is unevaluated, not passing.'],
    recommendations: ctx.authenticity?.recommendations ?? [],
    expectedImpact:
      'The flagged items are the highest-frequency markers reviewers and classifiers actually key on; fixing them is the direct lever on how the content reads.',
  });

  cards.push({
    id: 'brand-safety',
    label: 'Brand Safety',
    value: ctx.platformReports
      ? conservativeScore(
          Math.round(
            (ctx.platformReports.reduce(
              (sum, p) => sum + (p.policyStatus === 'Compliant' ? 100 : p.policyStatus === 'Review Suggested' ? 60 : 20),
              0,
            ) / ctx.platformReports.length) * 0.7 +
              (ctx.authenticity?.humanAuthenticityScore ?? 50) * 0.3,
          ),
        )
      : null,
    confidence: 60,
    evidence: ctx.platformReports?.map((p) => `${p.platform}: ${p.policyStatus}`) ?? [],
    inconclusive: ctx.platformReports ? ['On-screen and community-layer brand safety is not part of this pass.'] : ['No platform policy reports were returned.'],
    recommendations: ctx.platformReports?.flatMap((p) => p.specificRecommendations) ?? [],
    expectedImpact: 'These are the policy-status items a reviewer would weigh; the projected effect is removal of the specific risks named, not a guarantee of platform outcome.',
  });

  const monetization = ctx.monetizationRisk;
  cards.push({
    id: 'monetization-readiness',
    label: 'Monetization Readiness',
    value: monetization?.score ?? null,
    confidence: monetization?.confidence ?? 0,
    evidence: monetization?.items.map((i) => `${i.category} (${i.risk}) — ${i.location}`) ?? [],
    // Same reason as the authenticity card: an empty monetization panel would
    // read as "no exposure found" when in fact nothing was checked.
    inconclusive: monetization?.inconclusive ?? [
      'The monetization-risk layer did not return a result for this review, so none of the policy, copyright, or advertiser-suitability rules were run. Nothing here has been cleared.',
    ],
    recommendations: monetization?.items.map((i) => i.fix) ?? [],
    expectedImpact: 'Each named item is a specific, fixable exposure; the score is the residual risk after the named items are addressed, and the actual platform decision depends on factors outside this review.',
  });

  cards.push({
    id: 'platform-compliance',
    label: 'Platform Compliance',
    value: ctx.platformReports
      ? conservativeScore(
          Math.round(
            ctx.platformReports.reduce(
              (sum, p) => sum + (p.policyStatus === 'Compliant' ? 100 : p.policyStatus === 'Review Suggested' ? 60 : 20),
              0,
            ) / ctx.platformReports.length,
          ),
        )
      : null,
    confidence: 55,
    evidence: ctx.platformReports?.map((p) => `${p.platform}: ${p.policyStatus} — ${p.adSuitability}`) ?? [],
    inconclusive: ['Per-platform enforcement is decided by the platform\'s own review systems, which no pre-publish check can inspect.'],
    recommendations: ctx.platformReports?.flatMap((p) => p.specificRecommendations) ?? [],
    expectedImpact: 'The named recommendations address the specific policy gaps the platform panel found; compliance decisions remain with the platform.',
  });

  cards.push({
    id: 'copyright-risk',
    label: 'Copyright Risk',
    value: ctx.copyright
      ? conservativeScore(
          ctx.copyright.musicMatchRisk === 'Low' ? 96 : ctx.copyright.musicMatchRisk === 'Medium' ? 75 : 45,
        )
      : null,
    confidence: 60,
    evidence: [
      ...(ctx.copyright
        ? [
            `Music match risk: ${ctx.copyright.musicMatchRisk}`,
            ctx.copyright.detectedLogos.length > 0 ? `Logos detected: ${ctx.copyright.detectedLogos.join(', ')}` : 'No logos detected',
            ctx.copyright.watermarkDetected ? 'External watermark present' : 'No external watermark',
          ]
        : []),
    ],
    inconclusive: ctx.copyright ? ['Frame-level copyright (brands in footage, song references in captions) is not part of this pass.'] : ['The copyright layer did not return a result.'],
    recommendations: ctx.copyright?.recommendations ?? [],
    expectedImpact: 'The named items are the fingerprint risks a Content ID match would actually divert on; the platform claim itself is automatic and cannot be pre-cleared by any tool.',
  });

  const voice = ctx.voice;
  cards.push({
    id: 'voice-naturalness',
    label: 'Voice Naturalness',
    value: voice?.measured === true ? voice.naturalness : voice?.naturalness ?? null,
    confidence: ctx.audioMeasured ? 72 : 40,
    evidence: [
      ...(voice?.measured === true ? ['Pitch/pause DSP ran on the actual track'] : []),
      ...(voice?.syntheticArtifactRisk ? [`Synthetic-artifact risk: ${voice.syntheticArtifactRisk}`] : []),
    ],
    inconclusive: [
      ...(voice && !ctx.audioMeasured
        ? ['Naturalness is inferred from how the transcript reads — no audio DSP ran on the actual voice track.']
        : []),
      ...(voice ? [] : ['The voice layer did not return a result.']),
    ],
    recommendations: voice?.recommendations ?? [],
    expectedImpact: 'Voice fixes act on the delivery markers that drive mid-video drop-off; the recoverable amount is unmeasured without your retention data.',
  });

  cards.push({
    id: 'editing-authenticity',
    label: 'Editing Authenticity',
    value: null,
    confidence: 20,
    evidence: ctx.hasWatermark
      ? ['External platform watermark present — recycled-content signal']
      : ['No editing-level signals available from the supplied inputs'],
    inconclusive: ['Scene-transition regularity, cut density, and per-frame generative artifacts require video decoding, which Publish does not perform on any review.'],
    recommendations: [],
    // No recommendations exist for a layer that never ran, but the card still
    // has to say what applying nothing would do — an empty string renders as a
    // blank line in the report and reads as an omission rather than an answer.
    expectedImpact:
      'Nothing here is actionable yet: Publish does not decode the video track, so this layer reports as unevaluated on every review rather than producing a score to improve.',
  });

  const thumb = ctx.thumbnail;
  cards.push({
    id: 'thumbnail-authenticity',
    label: 'Thumbnail Authenticity',
    value: thumb?.measured === true ? thumb.compositionScore : null,
    confidence: thumb?.measured === true ? 65 : 15,
    evidence: [
      ...(thumb?.measured === true
        ? [`Composition score: ${thumb.compositionScore}`, `Clickbait risk: ${thumb.clickbaitRisk}`]
        : ['No thumbnail was supplied for the vision model']),
    ],
    inconclusive: [
      ...(thumb?.measured === true
        ? ['Generative-artifact detection (malformed hands/text, upscaling residue) is not part of the current vision pass.']
        : ['Thumbnail authenticity requires the image; without it the layer is unevaluated.']),
    ],
    recommendations: thumb?.recommendations ?? [],
    expectedImpact: 'The named changes act on the thumbnail signals that drive CTR and early retention; actual CTR depends on your audience and shelf context.',
  });

  const metaTitle = ctx.title.trim();
  const metaDesc = (ctx.description ?? '').trim();
  const metaTags = ctx.tags ?? [];
  const metaEvidence: string[] = [];
  const metaRecs: string[] = [];
  let metaScore = 100;

  // Title length: the ~60-char mark is where search and suggested feeds truncate.
  if (metaTitle.length === 0) {
    metaScore -= 40;
    metaRecs.push('Add a title — it is the single strongest metadata signal for both search matching and click decisions.');
  } else if (metaTitle.length > 70) {
    metaScore -= 12;
    metaEvidence.push(`Title is ${metaTitle.length} characters`);
    metaRecs.push(
      `Your title runs ${metaTitle.length} characters, so search results and the suggested sidebar will cut it around 60 and the end will not be read. Move the specific payoff — the number, the outcome, the name — into the first 60 characters and let the rest truncate.`,
    );
  } else {
    metaEvidence.push(`Title is ${metaTitle.length} characters — inside the ~60-char visible band`);
  }

  // Description: the first ~150 chars show above the fold in the watch page.
  if (metaDesc.length === 0) {
    metaScore -= 25;
    metaRecs.push(
      'There is no description. The first ~150 characters appear above the fold under the player and are indexed for search; leaving it empty forfeits the only long-form text signal the platform reads.',
    );
  } else if (metaDesc.length < 120) {
    metaScore -= 10;
    metaEvidence.push(`Description is ${metaDesc.length} characters`);
    metaRecs.push(
      `Your description is ${metaDesc.length} characters — under the ~150 that display above the fold. Extend it to cover what the video delivers in the creator's own phrasing, since this text is what search matches against.`,
    );
  } else {
    metaEvidence.push(`Description is ${metaDesc.length} characters`);
  }

  if (metaTags.length === 0) {
    metaScore -= 12;
    metaRecs.push(
      'No tags are set. Tags carry less weight than title and description but still disambiguate topic for search — add 5-8 that use the words your audience would actually type.',
    );
  } else {
    metaEvidence.push(`${metaTags.length} tags set`);
  }

  cards.push({
    id: 'metadata-quality',
    label: 'Metadata Quality',
    value: conservativeScore(clampScore(metaScore)),
    confidence: 70,
    evidence: metaEvidence,
    inconclusive: [
      'Whether the title and description actually match what the video delivers is not scored here — that comparison needs the video track, which Publish does not decode.',
    ],
    recommendations: metaRecs,
    expectedImpact:
      'These are structural metadata gaps measured directly against the visible-character limits; closing them changes what viewers and search actually see, though ranking depends on competition we cannot observe.',
  });

  const scored = cards.filter((c) => c.value !== null);
  cards.push({
    id: 'overall-publish-score',
    label: 'Overall Publish Score',
    value: scored.length > 0 ? conservativeScore(Math.round(scored.reduce((sum, c) => sum + (c.value ?? 0), 0) / scored.length)) : null,
    confidence: scored.length > 0 ? Math.round(scored.reduce((sum, c) => sum + c.confidence, 0) / scored.length) : 0,
    evidence: scored.map((c) => `${c.label}: ${c.value}/100`),
    inconclusive: scored.length === 0 ? ['No layer produced a score, so no overall score exists.'] : [],
    recommendations: cards.flatMap((c) => c.recommendations).slice(0, 4),
    expectedImpact: 'Averaged across the layers that produced scores; layers that could not be evaluated are excluded, so this can overstate confidence when few layers ran.',
  });

  return cards;
}

// ─── LLM-refined assessment ─────────────────────────────

interface RawAuthenticityResponse {
  humanAuthenticityScore: number;
  risk: 'Low' | 'Medium' | 'High';
  confidence: number;
  evidence: { signal: string; location: string; detail: string; weight: string; direction: string }[];
  inconclusive: string[];
  falsePositiveReasons: string[];
  recommendations: string[];
}

const SYSTEM = `${TRUST_SYSTEM_PREAMBLE}

ROLE
You are Publish's content-authenticity layer. You estimate how strongly a script READS as
AI-generated, and you communicate that estimate with calibrated uncertainty.

THE ABSOLUTE RULE — violating it makes the output harmful, not merely wrong:
You NEVER state, imply, or hint that content IS AI-generated. AI-origin detection is not
decidable. Every published detector produces false positives, and they land hardest on
non-native English speakers and on writers with clean, structured prose. You output a RISK BAND
with EVIDENCE and CONFIDENCE — never a verdict, never "this is AI", never "clearly generated",
never "obviously written by ChatGPT".

Forbidden phrasings (auto-fail): "this is AI-generated", "clearly AI", "definitely generated",
"was written by an AI", "confirmed AI", "AI-detected". Required framing instead: "reads as",
"is consistent with", "carries N markers associated with", "this pattern appears more often in
generated text".

You also never promise guaranteed monetization, guaranteed AI detection, or guaranteed platform
approval. Platforms decide; you estimate exposure.

CALIBRATION
- confidence is 0-100 and must reflect what you could actually observe. You are given ONLY text
  and metadata. You cannot see video frames, waveforms, or provenance metadata. Confidence above
  85 is almost never justified. If the script is under ~120 words, confidence must be under 55.
- humanAuthenticityScore is 0-100 where HIGHER reads more human.
- risk: "High" requires at least one STRONG marker AND confidence >= 55. A pile of weak markers
  is NOT High — that is exactly how honest human writing gets wrongly flagged.

EVIDENCE — each item needs:
  • signal: the named marker, e.g. "Dense connective phrasing"
  • location: the VERBATIM offending words, or a line number. Never "throughout" alone.
  • detail: what the marker indicates, phrased as an indicator and not a conclusion
  • weight: "strong" | "moderate" | "weak"
  • direction: "ai-indicator" | "human-indicator"
You MUST include human-indicator evidence when it exists (first-person anecdote, concrete
specifics, varied rhythm, disfluency, opinion). A Low-risk result that lists no supporting
evidence is useless to the creator.

FALSE POSITIVES — always at least two, always specific to what you flagged. This field is not
boilerplate; it is the creator's defence against being wrongly accused by our own product.

INCONCLUSIVE — signals you looked for but could not evaluate. Never present an unevaluated
signal as passing.

RECOMMENDATIONS — 2-4, each naming the exact location, the mechanism plus the platform behaviour
it triggers, a copy-paste-ready change shown as before → after in the creator's OWN words, and an
honest impact (mechanism or caveated range, never a promise). Reject any draft matching the
BANNED GENERIC ADVICE list — especially "sound more natural", "be more authentic", "add emotion",
"vary your tone".

Return ONLY this JSON:
{
  "humanAuthenticityScore": number,
  "risk": "Low" | "Medium" | "High",
  "confidence": number,
  "evidence": [{"signal": string, "location": string, "detail": string, "weight": "strong"|"moderate"|"weak", "direction": "ai-indicator"|"human-indicator"}],
  "inconclusive": string[],
  "falsePositiveReasons": string[],
  "recommendations": string[]
}`;

/** Language that asserts AI origin as fact. Never allowed to reach a creator. */
const CERTAINTY_CLAIMS: [RegExp, string][] = [
  [/\b(this|the (script|content|video))\s+is\s+(clearly\s+|obviously\s+|definitely\s+)?ai[- ]generated\b/gi, 'this reads as consistent with AI-generated text'],
  [/\b(clearly|obviously|definitely|certainly)\s+ai[- ](generated|written)\b/gi, 'consistent with patterns common in AI-generated text'],
  [/\b(was|were)\s+written\s+by\s+(an?\s+)?ai\b/gi, 'carries markers associated with AI-written text'],
  [/\bconfirmed\s+ai\b/gi, 'flagged for review'],
  [/\bai[- ]detected\b/gi, 'AI-associated markers found'],
  [/\bproves?\s+(this|it)\s+is\s+ai\b/gi, 'indicates AI-associated markers'],
];

/**
 * Strips certainty claims about AI origin. Runs on EVERY string the model
 * produces, in addition to the standard guardrail scrub. This is the last line
 * of defence: even a well-prompted model occasionally asserts, and an assertion
 * is the one output this feature must never emit.
 */
export function scrubCertainty(text: string): string {
  let out = text;
  for (const [pattern, replacement] of CERTAINTY_CLAIMS) {
    out = out.replace(pattern, replacement);
  }
  return scrubForbidden(out).clean;
}

const WEIGHTS = new Set(['strong', 'moderate', 'weak']);

function normalizeWeight(v: string): 'strong' | 'moderate' | 'weak' {
  return WEIGHTS.has(v) ? (v as 'strong' | 'moderate' | 'weak') : 'weak';
}

function normalizeDirection(v: string): 'ai-indicator' | 'human-indicator' {
  return v === 'human-indicator' ? 'human-indicator' : 'ai-indicator';
}

/**
 * LLM-refined authenticity assessment.
 *
 * The deterministic result is computed FIRST and acts as a floor the model
 * cannot argue away:
 *   • confidence can only be LOWERED by the model, never raised above what our
 *     own coverage math says we were entitled to.
 *   • the heuristic's evidence is always retained; the model can add to it.
 *   • the risk band is re-derived through `deriveRisk` from the merged evidence,
 *     so the strong-signal and confidence guards apply to the model's output too.
 * Any model failure degrades to the heuristic result, which is already complete.
 */
export async function analyzeAuthenticity(input: AuthenticityInput): Promise<AuthenticityAssessment> {
  const floor = heuristicAuthenticity(input, input.measuredVoice);
  const script = (input.scriptText ?? '').trim();

  // Nothing to reason over — the heuristic already says so honestly.
  if (!script) return floor;

  const raw = await chatJSON<RawAuthenticityResponse>(
    [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: `Title: ${input.title}
Description: ${input.description || '(none)'}
Tags: ${input.tags?.join(', ') || '(none)'}
Duration: ${input.durationSeconds ? `${input.durationSeconds}s` : 'unknown'}
Word count: ${wordCount(script)}
Creator declared AI generation: ${input.aiGenerated ? 'yes' : 'no'}
External watermark present: ${input.hasWatermark ? 'yes' : 'no'}
Audio actually processed: ${input.audioMeasured ? 'yes' : 'no'}${
          input.measuredVoice
            ? `
Measured pace: ${input.measuredVoice.speakingPaceWpm ?? 'unknown'} WPM
Measured pause ratio: ${input.measuredVoice.pauseRatio !== null && input.measuredVoice.pauseRatio !== undefined ? `${(input.measuredVoice.pauseRatio * 100).toFixed(0)}%` : 'unknown'}
Measured monotone: ${input.measuredVoice.isMonotone === null ? 'unknown' : input.measuredVoice.isMonotone ? 'yes' : 'no'}`
            : ''
        }

Deterministic signals already detected (incorporate these, do not contradict them):
${floor.evidence.map((e) => `- [${e.direction}, ${e.weight}] ${e.signal} @ ${e.location}: ${e.detail}`).join('\n') || '- none'}

Script:
"""${script.slice(0, 7000)}"""`,
      },
    ],
    { model: 'reasoning', temperature: 0.25, maxTokens: 1600 },
  );

  if (!raw) return floor;

  // Merge evidence: heuristic findings are authoritative, model findings are
  // additive. Dedupe on signal name so the model cannot pad the list by
  // restating what the detectors already found.
  const seenSignals = new Set(floor.evidence.map((e) => e.signal.toLowerCase()));
  const modelEvidence: AuthenticityEvidence[] = (raw.evidence ?? [])
    .slice(0, 8)
    .filter((e) => e?.signal && !seenSignals.has(String(e.signal).toLowerCase()))
    .map((e) => ({
      signal: scrubCertainty(String(e.signal)),
      location: scrubCertainty(String(e.location ?? 'unspecified')),
      detail: scrubCertainty(String(e.detail ?? '')),
      weight: normalizeWeight(String(e.weight)),
      direction: normalizeDirection(String(e.direction)),
    }));

  const evidence = [...floor.evidence, ...modelEvidence];

  // Confidence: the model may lower it, never raise it above our coverage math.
  const modelConfidence = Number.isFinite(raw.confidence)
    ? Math.max(0, Math.min(100, Math.round(raw.confidence)))
    : floor.confidence;
  const confidence = Math.max(CONFIDENCE_FLOOR, Math.min(floor.confidence, modelConfidence));

  // Score: average the model's read with the deterministic score so a single
  // confident-sounding model response cannot swing the result on its own.
  const modelScore = Number.isFinite(raw.humanAuthenticityScore)
    ? clampScore(raw.humanAuthenticityScore)
    : floor.humanAuthenticityScore;
  const blended = conservativeScore(Math.round((modelScore + floor.humanAuthenticityScore) / 2));

  // Re-derive the band so the strong-signal and confidence guards apply to the
  // merged evidence — we never take the model's band verbatim.
  const risk = deriveRisk(blended, confidence, evidence, input.aiGenerated === true);

  const recommendations = [
    ...floor.recommendations,
    ...(raw.recommendations ?? []).slice(0, 4).map((r) => scrubCertainty(String(r))),
  ]
    // Drop any near-duplicate of a heuristic recommendation.
    .filter((r, i, arr) => r.trim().length > 0 && arr.findIndex((o) => o.slice(0, 60) === r.slice(0, 60)) === i)
    .slice(0, 6);

  return {
    risk,
    humanAuthenticityScore: blended,
    confidence,
    creatorDeclared: input.aiGenerated === true,
    evidence,
    // The model may name additional gaps, but our structural limits always stand.
    inconclusive: [
      ...floor.inconclusive,
      ...(raw.inconclusive ?? []).slice(0, 3).map((s) => scrubCertainty(String(s))),
    ],
    falsePositiveReasons: [
      ...floor.falsePositiveReasons,
      ...(raw.falsePositiveReasons ?? []).slice(0, 3).map((s) => scrubCertainty(String(s))),
    ],
    limitations: analysisLimitations(),
    recommendations,
  };
}

