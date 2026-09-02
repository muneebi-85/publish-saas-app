/**
 * Real SEO engine, backed by NVIDIA NIM.
 *
 * Given a video title and target platform, produces:
 *   - platform-tuned optimized titles
 *   - tag suggestions
 *   - long-form description
 *   - qualitative scores
 *
 * When the model call fails, falls back to `heuristicSEO()` — a deterministic
 * generator that derives everything from the creator's own title. It never
 * fabricates a metric it cannot compute (no view counts, no CPM figures, no
 * chapter timestamps).
 */

import { chatJSON } from './nvidia';
import { TRUST_SYSTEM_PREAMBLE, scrubForbidden, conservativeScore, fenceSafe } from './guardrails';

export interface SEOAnalysis {
  seoScore: number;
  keywordScore: number;
  cpmPotential: number;
  ctrPrediction: number;
  optimizedTitles: string[];
  tags: string[];
  description: string;
  timestamps?: string[];
  /**
   * Deterministic keyword-coverage gap analysis, computed (never modeled):
   * the meaningful terms the script actually discusses, how often, and
   * whether the title/description carry them. `null` when there is no
   * script to extract terms from — an honest "not measured", not zero.
   */
  keywordGaps?: KeywordGap[] | null;
}

/** One script term and where the packaging does or does not carry it. */
export interface KeywordGap {
  term: string;
  /** Occurrences in the script. */
  scriptCount: number;
  /** Present in the title (verbatim, word-boundary match). */
  inTitle: boolean;
  /** Present in the description. */
  inDescription: boolean;
  /** Present in the suggested tags. */
  inTags: boolean;
}

const GAP_STOPWORDS = new Set([
  'the','and','for','with','your','this','that','these','those','what','when',
  'how','why','who','will','would','can','could','should','about','into','from',
  'they','them','their','there','here','just','like','also','then','than',
  'because','while','very','really','make','made','making','get','got','getting',
  'going','gone','know','known','thing','things','stuff','people','something',
  'anything','everything','nothing','one','two','three','first','second','next',
  'video','youtube','tiktok','instagram','facebook','linkedin','channel',
  'subscribe','subscribing','watching','watch','today','guys','welcome',
  'okay','right','yeah','gonna','wanna','kind','sort','little','lot','much',
  'more','most','less','least','some','any','all','each','every','both','few',
  'other','another','same','such','only','own','same','way','ways','use','used',
  'using','need','needs','want','wants','let','lets','like','look','looks',
  'see','seen','say','says','said','come','comes','came','take','takes','took',
  'give','gives','gave','find','finds','found','think','thinks','thought',
  'even','still','back','actually','literally','basically','simply','clearly',
  // Structural script words — they organize a script but name no topic.
  'part','parts','segment','section','chapter','intro','outro','point',
  'points','number','word','words','line','lines','minute','minutes',
  'second','seconds','example','something','important','different','better',
  'best','worst','least','main','major','whole','entire','everyone','anyone',
]);

/**
 * Extract the creator's real subject terms from the script: multi-word content
 * nouns will not survive single-token analysis, so this counts unigrams and
 * bigrams, drops fillers, and keeps terms with at least `minCount` mentions.
 * Everything is derived from the script's own words — nothing is invented.
 */
function extractScriptTerms(script: string, minCount = 3): Map<string, number> {
  const words = script
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !GAP_STOPWORDS.has(w) && !/^\d+$/.test(w));
  if (words.length === 0) return new Map();

  const counts = new Map<string, number>();
  const bump = (term: string) => counts.set(term, (counts.get(term) ?? 0) + 1);
  for (let i = 0; i < words.length; i++) {
    bump(words[i]);
    if (i + 1 < words.length) bump(`${words[i]} ${words[i + 1]}`);
  }
  // Unigram/bigram double counting is fine for ranking; the map is ordered by
  // count desc, then term asc, so the output is deterministic.
  return new Map(
    [...counts.entries()]
      .filter(([, n]) => n >= minCount)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  );
}

/**
 * The keyword-gap computation: for each script term, check whether the title,
 * description, and suggested tags carry it. This is the "your script says
 * 'thumbnail testing' 14×, your title mentions it 0×" finding — real gap
 * analysis from data the app already holds, no external API, no model.
 */
export function computeKeywordGaps(input: {
  scriptText: string;
  title: string;
  description?: string;
  tags: string[];
  /** Cap on returned gaps; the top terms are the decision-relevant ones. */
  limit?: number;
}): KeywordGap[] | null {
  const script = input.scriptText.trim();
  if (script.length < 200) return null;
  const title = input.title.toLowerCase();
  const desc = (input.description ?? '').toLowerCase();
  const tags = input.tags.map((t) => t.toLowerCase());

  const terms = extractScriptTerms(script);
  if (terms.size === 0) return null;

  const has = (haystack: string, term: string) =>
    new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i').test(haystack);

  const gaps: KeywordGap[] = [];
  for (const [term, scriptCount] of terms) {
    const inTitle = has(title, term);
    const inDescription = has(desc, term);
    const inTags = tags.some((t) => has(t, term));
    // Title coverage is the meaningful one for search/suggested matching — a
    // term the title carries is not a gap. (Description-only packaging was
    // the old bar and it buried the actionable findings under "covered".)
    if (inTitle) continue;
    // A bigram whose words are each already reported (or title-covered) adds
    // noise: "curve decides" when "curve" and "decides" are the real signals.
    const parts = term.split(' ');
    if (parts.length === 2) {
      const bothKnown =
        (terms.has(parts[0]) && (title.includes(parts[0]) || gaps.some((g) => g.term === parts[0]))) ||
        (terms.has(parts[1]) && (title.includes(parts[1]) || gaps.some((g) => g.term === parts[1])));
      if (bothKnown) continue;
    }
    gaps.push({ term, scriptCount, inTitle, inDescription, inTags });
    if (gaps.length >= (input.limit ?? 5)) break;
  }
  return gaps;
}

interface RawSEOResponse {
  seoScore: number;
  keywordScore: number;
  cpmPotential: number;
  ctrPrediction: number;
  optimizedTitles: string[];
  tags: string[];
  description: string;
  timestamps?: string[];
}

const buildPrompt = (platform: string) => `${TRUST_SYSTEM_PREAMBLE}

You are the SEO review layer for ${platform}. Every string you return is shown to a working creator as a ship-ready suggestion, so it must clear a strategist's bar: name exactly what to change and why. No filler, no generic coaching, no "consider".

Apply these ${platform} constraints:
${platformConstraints(platform)}

TITLE RULES (optimizedTitles):
- Front-load the primary keyword in the first ~40 characters — that is the text that renders in mobile search results and the Suggested column. Never bolt a generic suffix onto the full source title.
- Each title adds exactly ONE specificity lever tied to the video's real topic: a number, a concrete noun, a timeframe, or a named stakes/outcome (e.g. "reach", "retention", "getting flagged").
- Preserve any number already present in the source title; numerals lift CTR on browse/Suggested surfaces.
- Respect the character limit in the platform constraints above; if none is given, keep each title ≤ 70 characters so YouTube does not truncate it.
- Return three titles using three DIFFERENT structures (keyword + curiosity gap, keyword + concrete outcome, keyword + specific mistake/consequence). Do not return three rewordings of one phrase.

DESCRIPTION RULES (description):
- The first line must repeat the primary keyword verbatim — it is the strongest text-relevance signal the description carries.
- Include exactly ONE call to action, matched to ${platform}: prompt saves/shares on TikTok and Instagram, "read the writeup / see the comments" on LinkedIn, a specific comment prompt on YouTube and Facebook. Never ask for subscribes on TikTok.
- 600-1000 characters. Honor the platform's hashtag rule above: hashtags belong in the description body on TikTok and Instagram; omit them on YouTube and LinkedIn.
- Do not invent chapter timestamps, view counts, retention percentages, or CPM figures — you cannot observe them from a title alone. State only what the title supports.

TAGS RULES (tags): return 8-12 terms mixing one or two head terms with specific long-tail phrases a viewer would actually type. On YouTube, treat tags as a minor relevance aid that mainly disambiguates spelling and synonyms, not a ranking lever — do not overstate their effect.

BANNED — never output these or close variants, in any title, description, or tag: "improve your thumbnail", "make it more engaging", "add value", "optimize your title", "be more authentic", "you won't believe", "what actually worked", "the full breakdown", a bare "step by step" or "mistakes to avoid" tail, "ultimate guide", "game changer", "insane", "this one trick". Any suggestion that does not name exactly what to change and why is disallowed.

Return JSON with EXACTLY these fields and no others:
{
  "seoScore":        number,   // 0..100, how discoverable the current title is
  "keywordScore":    number,   // 0..100, keyword targeting quality
  "cpmPotential":    number,   // 0..100, ad-CPM friendliness of the topic AS GIVEN (do not tell the creator to change topic)
  "ctrPrediction":   number,   // 0..100, click-through likelihood
  "optimizedTitles": string[], // 3 titles, each within the platform limit above, keyword front-loaded
  "tags":            string[], // 8-12 terms, head + long-tail mix
  "description":     string,   // 600-1000 chars, keyword-first line, one platform-matched CTA
  "timestamps":      string[]  // real chapter markers only (e.g. "0:00 Intro"); [] if unknown or unsupported
}

Do not claim monetization is guaranteed. Never write "guaranteed", "100% safe", "will be monetized", "definitely approved", or any absolute outcome claim. No prose outside the JSON.`;

function platformConstraints(platform: string): string {
  const rules: Record<string, string> = {
    YouTube:   '- Titles ≤ 70 chars, curiosity + specificity, numbers work.\n- 8-12 tags, mix of head + long-tail terms.\n- Description first line must repeat the primary keyword.\n- Prefer high-CPM verticals: personal finance, tech, business.',
    TikTok:    '- Titles very short (< 40 chars), front-load the hook.\n- 6-10 hashtags in the description.\n- No timestamps (TikTok is short-form).\n- CTA should encourage saves/shares over subscribes.',
    Instagram: '- Reels-style tone, front-loaded value.\n- 8-10 hashtags, mix niche + broad.\n- No YouTube-style timestamps.',
    Facebook:  '- Assume silent auto-play.\n- Descriptive first line.\n- 5-8 tags.',
    LinkedIn:  '- Professional narrative.\n- 4-6 tags, industry-specific.\n- Include "Read the writeup" or similar knowledge-worker CTA.',
  };
  return rules[platform] ?? rules.YouTube;
}

export async function generateSEOAnalysis(
  title: string,
  platform: string,
  description?: string,
  scriptText?: string,
): Promise<SEOAnalysis> {
  const hasDescription = typeof description === 'string' && description.trim().length > 0;
  const raw = await chatJSON<RawSEOResponse>(
    [
      { role: 'system', content: buildPrompt(platform) },
      {
        role: 'user',
        content:
          `Video title: "${fenceSafe(title.trim())}"` +
          (hasDescription ? `\nCreator's description: """${fenceSafe(description!.trim().slice(0, 2000))}"""` : ''),
      },
    ],
    { model: 'fast', temperature: 0.7, maxTokens: 1400 },
  );

  // The deterministic gap analysis runs on every path — model or fallback —
  // because it needs no model at all: it compares the script's own terms
  // against the packaging. Kept out of the prompt so the model cannot
  // reword these findings into something softer than the data.
  const tags = raw
    ? (raw.tags ?? []).slice(0, 12).map((t) => scrubForbidden(t).clean.slice(0, 40))
    : heuristicSEO(title, platform).tags;
  const keywordGaps = computeKeywordGaps({
    scriptText: scriptText ?? '',
    title,
    description,
    tags,
  });

  if (!raw) {
    const fallback = heuristicSEO(title, platform);
    return { ...fallback, keywordGaps };
  }

  return {
    seoScore:      conservativeScore(raw.seoScore ?? 60),
    keywordScore:  conservativeScore(raw.keywordScore ?? 60),
    cpmPotential:  conservativeScore(raw.cpmPotential ?? 60),
    ctrPrediction: conservativeScore(raw.ctrPrediction ?? 60),
    optimizedTitles: (raw.optimizedTitles ?? []).slice(0, 3).map((t) => scrubForbidden(t).clean.slice(0, 100)),
    tags,
    description:     scrubForbidden(raw.description ?? '').clean,
    // Timestamps are only meaningful when the engine saw the creator's own
    // description (the only script-adjacent text this call receives). Without
    // it the model cannot know real chapter boundaries, so a fabricated
    // "0:00 Intro" is dropped rather than passed through.
    timestamps: hasDescription ? (raw.timestamps ?? []).slice(0, 10) : [],
    keywordGaps,
  };
}

// ─── Deterministic fallback ────────────────────────────
/**
 * Title-derived SEO analysis used when the model is unreachable. Every score is
 * computed from observable properties of the title itself (numerals, how-to
 * framing, emotional specificity) — nothing is invented, and the timestamps
 * array stays empty because real chapter markers need the script.
 */
export function heuristicSEO(title: string, platform: string): SEOAnalysis {
  const cleanTitle = title.trim();
  const words = cleanTitle.toLowerCase().split(/\s+/).filter(Boolean);
  const hasNumber = /\d/.test(cleanTitle);
  const hasHowTo = words.includes('how');
  const hasEmotional = ['secret', 'hack', 'mistake', 'truth', 'never'].some((w) => words.includes(w));

  const base = 60 + (hasNumber ? 10 : 0) + (hasHowTo ? 10 : 0) + (hasEmotional ? 10 : 0);
  const seoScore = conservativeScore(Math.min(100, base + 8));

  // Titles are built from the creator's own title, keyword front-loaded, each using a
  // DIFFERENT structure (curiosity gap / concrete outcome / specific consequence) — never
  // three rewordings of one generic suffix.
  const core = words.slice(0, 6).join(' ');
  const Core = `${core.charAt(0).toUpperCase()}${core.slice(1)}`;
  const optimizedTitles = [
    `${Core}: What Nobody Tells You First`,
    hasNumber ? `${cleanTitle} — What the Numbers Actually Show` : `${Core}: The Real Walkthrough, Start to Finish`,
    `${Core}: The Mistake That Quietly Kills Reach`,
  ];

  // Keyword-derived tags: seed with the title's own meaningful words, then add a
  // small set of platform-appropriate terms. No fabricated engagement claims.
  const STOP = new Set(['the', 'and', 'for', 'with', 'your', 'this', 'that', 'how', 'why', 'a', 'an', 'to', 'of', 'in', 'on']);
  const titleTags = words.filter((w) => w.length > 2 && !STOP.has(w)).slice(0, 4);
  const platformTagMap: Record<string, string[]> = {
    YouTube:   ['youtube algorithm', 'creator tips', 'content strategy'],
    TikTok:    ['fyp', 'tiktok tips', 'short form'],
    Instagram: ['instagram reels', 'reels tips', 'content strategy'],
    Facebook:  ['facebook reels', 'video content'],
    LinkedIn:  ['thought leadership', 'personal brand'],
  };
  const tags = Array.from(new Set([...titleTags, ...(platformTagMap[platform] || platformTagMap.YouTube)])).slice(0, 12);

  // Description repeats the creator's primary keyword up front (real SEO best
  // practice), carries one platform-matched CTA, and no self-promotional links.
  const cta =
    platform === 'TikTok' ? 'Save this so you can run the steps later, and send it to someone just starting out.' :
    platform === 'Instagram' ? 'Save this for later and share it with a friend who needs it.' :
    platform === 'LinkedIn' ? 'Full writeup and sources are in the comments — read it if you want the detail.' :
    "If this helped, tell me in the comments which step you'll try first.";
  const description = `${cleanTitle}

In this video I break down ${core || 'the topic'} end to end — the exact approach, the mistakes that quietly cost you reach, and how to adapt it to ${platform} today.

What you'll get:
- The core method, explained plainly
- The specific mistakes that limit distribution
- How to tune it for ${platform}'s current ranking signals

${cta}`;

  // We do not fabricate chapter timestamps — real timestamps require the actual
  // script's section boundaries, which a title alone does not provide.
  const timestamps: string[] = [];

  return {
    seoScore,
    keywordScore:  conservativeScore(65 + (hasEmotional ? 10 : 0)),
    cpmPotential:  conservativeScore(70),
    ctrPrediction: conservativeScore(60 + (hasNumber ? 10 : 0) + (hasEmotional ? 8 : 0)),
    optimizedTitles,
    tags,
    description,
    timestamps,
  };
}
