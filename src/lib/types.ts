export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type PlanTier = 'FREE' | 'STARTER' | 'PRO' | 'AGENCY' | 'ENTERPRISE';

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
  syntheticArtifactRisk: 'Low' | 'Medium' | 'High';
  recommendations: string[];
}

export interface VideoMetric {
  editingPacingScore: number | null;
  cameraMovementRating: string;
  sceneTransitionRate: string;
  frameRepetitionCount: number | null;
  aiVisualArtifactRisk: 'Low' | 'Medium' | 'High';
  resolution: string;
  compressionQuality: string;
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
  clickbaitRisk: 'Low' | 'Medium' | 'High';
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
}

export interface CopyrightMetric {
  musicMatchRisk: 'Low' | 'Medium' | 'High';
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
}

export interface PlatformReport {
  platform: 'YouTube' | 'TikTok' | 'Instagram' | 'Facebook' | 'LinkedIn';
  score: number;
  policyStatus: 'Compliant' | 'Review Suggested' | 'At Risk';
  adSuitability: string;
  specificRecommendations: string[];
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
    hook: number;
    editing: number;
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
