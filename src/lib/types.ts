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
}

export interface VoiceMetric {
  naturalness: number;
  emotionScore: number;
  pauseRatio: number;
  speakingPaceWpm: number;
  isMonotone: boolean;
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
  ctrPredictionScore: number;
  faceCount: number;
  dominantEmotion: string;
  textReadabilityScore: number;
  contrastRating: string;
  clickbaitRisk: 'Low' | 'Medium' | 'High';
  compositionScore: number;
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
}

export interface CopyrightMetric {
  musicMatchRisk: 'Low' | 'Medium' | 'High';
  detectedLogos: string[];
  movieClipRisk: 'Low' | 'Medium' | 'High';
  watermarkDetected: boolean;
  stockFootageEstimate: string;
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
  voiceAnalysis: VoiceMetric;
  videoAnalysis: VideoMetric;
  thumbnailAnalysis: ThumbnailMetric;
  seoAnalysis: SEOMetric;
  copyrightAnalysis: CopyrightMetric;
  hookAnalysis: HookRetentionMetric;
  platformReports: PlatformReport[];
}
