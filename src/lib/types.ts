export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ScoreItem {
  name: string;
  score: number;
  description: string;
  status: 'excellent' | 'warning' | 'danger';
}

export interface ScriptIssue {
  id: string;
  type: 'gpt-phrase' | 'repetition' | 'weak-hook' | 'weak-cta';
  severity: 'high' | 'medium' | 'low';
  reviewSeverity?: 'critical' | 'warning' | 'info';
  text: string;
  suggestion: string;
  specific_fix?: string;
  platform_specific?: ('YouTube' | 'TikTok' | 'Instagram' | 'Facebook' | 'LinkedIn')[];
  /** Directional effect on virality signals (hook strength, share-through, watch-time). */
  viralityImpact?: 'boost' | 'neutral' | 'suppress';
  /** Directional effect on monetization eligibility / CPM. */
  monetizationImpact?: 'none' | 'demoted' | 'demonetized';
  line: number;
  reasoning?: string;
  estimatedMetricImpact?: string;
}

export interface VoiceMetric {
  /** True only when an audio source was actually processed. When false, numeric fields are estimates or null. */
  measured: boolean;
  naturalness: number | null;
  emotionScore: number | null;
  /** Requires audio DSP (pitch/pause detection). null until an audio pipeline is connected. */
  pauseRatio: number | null;
  /** Derived from word count ÷ duration. null when duration is unknown. */
  speakingPaceWpm: number | null;
  isMonotone: boolean | null;
  /**
   * null when nothing about the voice was evaluated (no audio processed AND no
   * model pass) — an unevaluated layer must not claim a safe band. Legacy
   * reports stored a band, which reads as evaluated.
   */
  syntheticArtifactRisk: 'Low' | 'Medium' | 'High' | null;
  recommendations: string[];
}

export interface VideoMetric {
  /**
   * True only when frames from the uploaded file were actually decoded.
   *
   * Reports written before frame analysis existed have no such field, so it reads
   * as undefined and therefore falsy - which renders them as unmeasured, the state
   * they were genuinely in. That is the intended migration: no backfill, no
   * retroactive claim that an old report saw frames it never saw.
   */
  measured: boolean;
  /**
   * 0-100. When `measured`, a banded reading of the sampled cut rate - a heuristic
   * over a measurement, and `basis` says so. When not, the thumbnail composition
   * score standing in, or null.
   */
  editingPacingScore: number | null;
  cameraMovementRating: string;
  sceneTransitionRate: string;
  frameRepetitionCount: number | null;
  aiVisualArtifactRisk: 'Low' | 'Medium' | 'High';
  resolution: string;
  compressionQuality: string;
  /** 0-100 on the opening three seconds. null unless a hook sheet was analyzed. */
  visualHookScore?: number | null;
  /** 0-100 distinct-setup count across the sampled frames. null unless judged. */
  shotVarietyScore?: number | null;
  /** What overlays or captions appear across the sampled frames. */
  onScreenText?: string | null;
  /** One sentence on what the first frames actually show. */
  visualHookVerdict?: string | null;
  /**
   * What the decode covered and which fields are measured versus judged.
   *
   * Rendered, not a code comment: a reader cannot otherwise tell that resolution is
   * read off the file while camera movement is a model's opinion of twelve stills.
   */
  basis?: string;
  recommendations: string[];
}

export interface ThumbnailMetric {
  /** True only when the thumbnail image was actually analyzed by the vision model. */
  measured: boolean;
  ctrPredictionScore: number | null;
  faceCount: number | null;
  dominantEmotion: string;
  textReadabilityScore: number | null;
  contrastRating: string;
  /**
   * null when unmeasured: an unmeasured layer asserting a safe risk band
   * renders "Clickbait risk: Low" for an image nobody looked at — the same
   * unmeasured-as-passing inversion the rest of this contract forbids.
   */
  clickbaitRisk: 'Low' | 'Medium' | 'High' | null;
  compositionScore: number | null;
  recommendations: string[];
}

export interface SEOMetric {
  titleOptimizationScore: number;
  descriptionScore: number;
  keywordDensity: string;
  rankingOpportunity: 'High' | 'Medium' | 'Low';
  competitorComparison: string;
  suggestedTags: string[];
  suggestedHashtags: string[];
  generatedDescription?: string;
  timestamps?: string[];
  /**
   * Deterministic script-term vs. packaging coverage. null when no script
   * was analyzed (legacy reports read as undefined — render "not measured",
   * never zero). See computeKeywordGaps in seo-engine.
   */
  keywordGaps?: {
    term: string;
    scriptCount: number;
    inTitle: boolean;
    inDescription: boolean;
    inTags: boolean;
  }[] | null;
}

export interface CopyrightMetric {
  musicMatchRisk: 'Low' | 'Medium' | 'High';
  /** The creator's declared music-source label (lowercased UI enum), when one was given — the UI must distinguish "no music" from "stock/royalty-free" on the same Low risk band. */
  musicSource?: string;
  detectedLogos: string[];
  movieClipRisk: 'Low' | 'Medium' | 'High';
  watermarkDetected: boolean;
  /** null when no stock-footage signal is available — never a fabricated default. */
  stockFootageEstimate: string | null;
  recommendations: string[];
}

export interface HookRetentionMetric {
  first5SecRetention: number;
  first10SecRetention: number;
  first30SecRetention: number;
  hookDropoffReason: string;
  recommendedHooks: string[];
  /**
   * False when no script or transcript was supplied, so the retention numbers
   * above were never computed (they read 0 and must not be displayed). Absent
   * on legacy reports, which were all produced from a real opening.
   */
  analyzed?: boolean;
  /**
   * 'heuristic' when these numbers came from the deterministic fallback (model
   * unavailable/failed) rather than the model pass. Both paths read the same
   * script, but a creator making an edit decision deserves to know which one
   * produced the number. Absent on legacy reports = the model path.
   */
  basis?: 'model' | 'heuristic';
}

export interface PlatformReport {
  platform: 'YouTube' | 'TikTok' | 'Instagram' | 'Facebook' | 'LinkedIn';
  score: number;
  policyStatus: 'Compliant' | 'Review Suggested' | 'At Risk';
  adSuitability: string;
  specificRecommendations: string[];
}

// ─── Content Authenticity & Monetization Risk ───────────
//
// DESIGN CONTRACT (do not weaken):
// AI-origin detection is probabilistic, not decidable. Every type below is
// shaped so the product CANNOT express certainty:
//   • `risk` is a band, never a boolean "is AI".
//   • `confidence` is required and is clamped below 100 by the engine.
//   • `evidence` carries the signals that fired, so a creator can audit us.
//   • `inconclusive` names the signals we could not judge — the difference
//     between "we checked and it's fine" and "we could not check".
//   • `falsePositiveReasons` is required, because a human creator wrongly
//     flagged as AI is the single worst failure mode this product has.

export type AuthenticityRisk = 'Low' | 'Medium' | 'High';

/** One signal that fired, with the place it fired and what it does (not a verdict). */
export interface AuthenticityEvidence {
  /** Signal name, e.g. "Repeated sentence openers". */
  signal: string;
  /** Exact location: a verbatim quote, a line number, or a timestamp window. */
  location: string;
  /** The mechanism this signal indicates — phrased as an indicator, never a conclusion. */
  detail: string;
  /** How strongly this single signal weighs on the assessment. */
  weight: 'strong' | 'moderate' | 'weak';
  /**
   * Which way the signal points. A Low-risk band must be able to show the
   * human-indicating signals that earned it, not just an absence of red flags.
   */
  direction: 'ai-indicator' | 'human-indicator';
}

export interface AuthenticityAssessment {
  /** Risk that this content READS as AI-generated. Never an assertion that it is. */
  risk: AuthenticityRisk;
  /**
   * Human Authenticity Score, 0-100. Higher = reads more human.
   * This is an estimate over the signals listed in `evidence`, nothing more.
   */
  humanAuthenticityScore: number;
  /** 0-100. Engine clamps below 100 — origin detection is never certain. */
  confidence: number;
  /** True when the creator themselves declared AI generation (not a detection result). */
  creatorDeclared: boolean;
  /** Signals that fired, each with a location the creator can check. */
  evidence: AuthenticityEvidence[];
  /** Signals we looked for but could not evaluate from the inputs available. */
  inconclusive: string[];
  /** Honest reasons a human-written script could produce this same assessment. */
  falsePositiveReasons: string[];
  /** What this analysis structurally cannot see. */
  limitations: string[];
  /** Mechanism-based, location-anchored fixes. */
  recommendations: string[];
}

export type MonetizationRiskCategory =
  | 'Profanity'
  | 'Violence'
  | 'Graphic content'
  | 'Hate speech'
  | 'Medical misinformation'
  | 'Spam signals'
  | 'Clickbait'
  | 'Deceptive editing'
  | 'Misleading thumbnail'
  | 'Automation signals'
  | 'Copyright exposure'
  | 'Brand safety'
  | 'Advertiser suitability';

export interface MonetizationRiskItem {
  category: MonetizationRiskCategory;
  risk: AuthenticityRisk;
  /** 0-100 confidence in THIS item's assessment. */
  confidence: number;
  /** Exact location: verbatim quote, line number, or timestamp window. */
  location: string;
  /** Mechanism plus the named platform rule or behaviour it triggers. */
  why: string;
  /** Copy-paste-ready change. */
  fix: string;
}

export interface MonetizationRiskAnalysis {
  /** 0-100 monetization readiness. Lower = more advertiser/policy exposure. */
  score: number;
  confidence: number;
  risk: AuthenticityRisk;
  /** Only categories that actually fired. An empty array means nothing tripped. */
  items: MonetizationRiskItem[];
  /** Categories we could not evaluate (e.g. no thumbnail, no video track). */
  inconclusive: string[];
  limitations: string[];
}

/** One row of the report scorecard grid. */
export interface Scorecard {
  id: string;
  label: string;
  /** 0-100, or null when the layer could not be evaluated at all. */
  value: number | null;
  /** 0-100 confidence in `value`. Low confidence is shown, not hidden. */
  confidence: number;
  /** Signals that actually contributed to `value`. */
  evidence: string[];
  /** Signals that were checked for but came back inconclusive. */
  inconclusive: string[];
  /** Location-anchored, mechanism-based improvements. */
  recommendations: string[];
  /** Honest expected effect of applying them — mechanism or caveated range, never a promise. */
  expectedImpact: string;
}

export interface ProjectData {
  id: string;
  title: string;
  description: string;
  folder: string;
  tags: string[];
  status: 'Analyzing' | 'Completed' | 'Draft';
  riskLevel: RiskLevel;
  createdAt: string;
  assets: {
    videoName?: string;
    videoSize?: string;
    videoDuration?: string;
    thumbnailUrl?: string;
    scriptText?: string;
    voiceName?: string;
    metaTitle?: string;
    metaDescription?: string;
    metaTags?: string[];
  };
  scores: {
    overall: number;
    monetization: number;
    originality: number;
    humanAuthenticity: number;
    brandSafety: number;
    copyright: number;
    seo: number;
    /**
     * Predicted retention, 0-100 — or null when no script or transcript was
     * supplied, because the hook engine has nothing to read. A fabricated
     * number here would flow into the weighted headline at 15% and into the
     * retention curve drawing a curve for a script that does not exist.
     */
    hook: number | null;
    /**
     * Editing/pacing, 0-100 — or null when the layer was never measured
     * (no frames decoded and no thumbnail to stand in). A hard 0 here would
     * render a measured-looking "0/100 editing" for a layer that never ran,
     * the exact unmeasured-as-failing conflation the video engine's own copy
     * forbids. Consumers render null as "Not measured".
     */
    editing: number | null;
  };
  scriptIssues: ScriptIssue[];
  scriptAnalysis?: {
    gptProbability: number;
    storytellingArc: string;
  };
  voiceAnalysis: VoiceMetric;
  videoAnalysis: VideoMetric;
  thumbnailAnalysis: ThumbnailMetric;
  seoAnalysis: SEOMetric;
  copyrightAnalysis: CopyrightMetric;
  hookAnalysis: HookRetentionMetric;
  platformReports: PlatformReport[];
  /**
   * Content Authenticity & Monetization Risk assessment.
   * Optional — reports persisted before this engine existed do not have it, and
   * the UI renders a "not analyzed yet" state instead of fabricating one.
   */
  authenticity?: AuthenticityAssessment;
  monetizationRisk?: MonetizationRiskAnalysis;
  scorecards?: Scorecard[];
  /**
   * Computed creator-value summary. Optional — reports persisted before this
   * field existed simply do not have it, and the UI falls back gracefully.
   */
  insights?: {
    /** Projected overall score if every flagged fix is applied (deterministic, honest). */
    scorePotential: number;
    /** Number of issues that can demonetize or block reach if left unfixed. */
    blockingCount: number;
    /** Number of high-impact (non-blocking) issues. */
    highCount: number;
    /** Total actionable fixes across all layers. */
    totalFixes: number;
  };
}
