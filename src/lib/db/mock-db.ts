import { ProjectData } from '../types';

export const SAMPLE_PROJECTS: ProjectData[] = [
  {
    id: 'proj-001',
    title: 'The AI Revolution in 2026: What Nobody Tells You',
    description: 'Deep-dive documentary examining AI video generation, automated workflows, and creator economy shifts.',
    folder: 'YouTube Documentaries',
    tags: ['Tech', 'AI', 'Documentary', 'Monetization'],
    status: 'Completed',
    riskLevel: 'LOW',
    createdAt: '2026-07-24T14:30:00Z',
    assets: {
      videoName: 'ai_revolution_final_render.mp4',
      videoSize: '412 MB',
      videoDuration: '11:45',
      thumbnailUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80',
      scriptText: `In this video, we delve into the comprehensive landscape of artificial intelligence. Furthermore, it is important to note that generative tools have evolved exponentially. Let's explore how creators can leverage these cutting-edge capabilities without compromising authentic human connection. First, let's examine the foundational architecture...`,
      voiceName: 'narration_elevenlabs_v2.wav',
      metaTitle: 'The AI Revolution in 2026: What Nobody Tells You (Full Documentary)',
      metaDescription: 'Discover the real impact of AI video generation on content creators in 2026. Learn how to stay authentic while using modern automation.',
      metaTags: ['AI 2026', 'Content Creation', 'Creator Economy', 'AI Video']
    },
    scores: {
      overall: 89,
      monetization: 94,
      originality: 82,
      humanAuthenticity: 88,
      brandSafety: 96,
      copyright: 98,
      seo: 86,
      hook: 91,
      editing: 87
    },
    scriptIssues: [
      {
        id: 's-1',
        type: 'gpt-phrase',
        severity: 'medium',
        text: 'In this video, we delve into the comprehensive landscape of artificial intelligence. Furthermore, it is important to note that...',
        suggestion: 'Replace corporate GPT phrases ("delve", "furthermore", "important to note") with conversational openings: "Today, we\'re looking at how AI is actually changing video..."',
        line: 1
      },
      {
        id: 's-2',
        type: 'weak-cta',
        severity: 'low',
        text: 'Don\'t forget to like and subscribe for more content like this.',
        suggestion: 'Replace generic CTA with a value-driven prompt: "Drop a comment with your biggest AI video question, and I\'ll answer the top 5 in next week\'s breakdown."',
        line: 42
      }
    ],
    voiceAnalysis: {
      naturalness: 86,
      emotionScore: 78,
      pauseRatio: 0.14,
      speakingPaceWpm: 154,
      isMonotone: false,
      syntheticArtifactRisk: 'Low',
      recommendations: [
        'Slight robotic cadence detected around 02:14 during complex technical jargon.',
        'Add 0.3s longer breathing pauses between major section transitions.'
      ]
    },
    videoAnalysis: {
      editingPacingScore: 89,
      cameraMovementRating: 'Smooth & Dynamic',
      sceneTransitionRate: 'Every 3.2 seconds (Optimal)',
      frameRepetitionCount: 0,
      aiVisualArtifactRisk: 'Low',
      resolution: '4K Ultra HD (3840x2160)',
      compressionQuality: 'Clean (15 Mbps)',
      recommendations: [
        'Visual pacing drops slightly between 04:10 - 05:30. Consider adding B-roll overlay.',
        'No AI artifacting or unnatural hand warping detected.'
      ]
    },
    thumbnailAnalysis: {
      ctrPredictionScore: 88,
      faceCount: 1,
      dominantEmotion: 'Focused Curiosity',
      textReadabilityScore: 94,
      contrastRating: 'High Contrast (9.2:1)',
      clickbaitRisk: 'Low',
      compositionScore: 91,
      recommendations: [
        'Text "AI REVOLUTION" is crisp and highly legible on mobile displays.',
        'Adding a subtle green drop shadow behind the subject can increase pop by ~4%.'
      ]
    },
    seoAnalysis: {
      titleOptimizationScore: 86,
      descriptionScore: 90,
      keywordDensity: '2.4% (Optimal)',
      rankingOpportunity: 'High',
      competitorComparison: 'Stronger title hook than 78% of top ranking tech videos.',
      suggestedTags: ['AI video tools 2026', 'AI authenticity', 'YouTube monetization tips', 'creator economy'],
      suggestedHashtags: ['#AI2026', '#ContentCreators', '#TechDocumentary']
    },
    copyrightAnalysis: {
      musicMatchRisk: 'Low',
      detectedLogos: ['Apple', 'OpenAI'],
      movieClipRisk: 'Low',
      watermarkDetected: false,
      stockFootageEstimate: '18% (Fair Use Compliant)',
      recommendations: [
        'Background audio verified royalty-free via Artlist license.',
        'Brief 4-second Apple logo appearance qualifies under nominative fair use.'
      ]
    },
    hookAnalysis: {
      first5SecRetention: 92,
      first10SecRetention: 86,
      first30SecRetention: 78,
      hookDropoffReason: 'Slight verbal drag in opening sentence before the visual payoff.',
      recommendedHooks: [
        '"90% of creators using AI in 2026 are getting quietly shadowbanned—here is why."',
        '"Before you post your next video, there is one monetization risk you need to check."'
      ]
    },
    platformReports: [
      {
        platform: 'YouTube',
        score: 94,
        policyStatus: 'Compliant',
        adSuitability: 'Green Icon (100% Advertiser Friendly)',
        specificRecommendations: [
          'Fully complies with YouTube 2026 Synthetic Content Disclosure guidelines.',
          'Metadata tags match content body cleanly.'
        ]
      },
      {
        platform: 'TikTok',
        score: 87,
        policyStatus: 'Compliant',
        adSuitability: 'Eligible for Creator Rewards Program',
        specificRecommendations: [
          'Vertical 9:16 cut recommended for optimal FYP distribution.',
          'Add native TikTok closed captions in the first 3 seconds.'
        ]
      },
      {
        platform: 'Instagram',
        score: 85,
        policyStatus: 'Review Suggested',
        adSuitability: 'Reels Monetization Eligible',
        specificRecommendations: [
          'Keep reel length under 90s for maximum algorithmic push.'
        ]
      },
      {
        platform: 'Facebook',
        score: 91,
        policyStatus: 'Compliant',
        adSuitability: 'In-Stream Ads Ready',
        specificRecommendations: [
          'Add 3-line descriptive caption above the video post.'
        ]
      },
      {
        platform: 'LinkedIn',
        score: 95,
        policyStatus: 'Compliant',
        adSuitability: 'High Professional Reach',
        specificRecommendations: [
          'Excellent executive-level narrative structure for B2B engagement.'
        ]
      }
    ]
  },
  {
    id: 'proj-002',
    title: 'Top 10 Productivity Hacks for Remote Founders',
    description: 'Short-form series focused on daily routines, workspace optimization, and focus hacks.',
    folder: 'Shorts & Reels',
    tags: ['Productivity', 'Founders', 'Shorts'],
    status: 'Completed',
    riskLevel: 'MEDIUM',
    createdAt: '2026-07-23T10:15:00Z',
    assets: {
      videoName: 'remote_hacks_short_v1.mp4',
      videoSize: '88 MB',
      videoDuration: '00:58',
      thumbnailUrl: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=800&q=80',
      scriptText: 'Are you feeling overwhelmed by endless Zoom meetings? In this video, we delve into 10 productivity hacks...',
      voiceName: 'voiceover_raw.mp3',
      metaTitle: '10 Founder Hacks That Save 10 Hours a Week',
      metaDescription: 'Steal these 10 productivity routines used by top startup founders.',
      metaTags: ['Productivity', 'Startup', 'RemoteWork']
    },
    scores: {
      overall: 74,
      monetization: 78,
      originality: 68,
      humanAuthenticity: 72,
      brandSafety: 90,
      copyright: 84,
      seo: 79,
      hook: 66,
      editing: 80
    },
    scriptIssues: [
      {
        id: 's-10',
        type: 'weak-hook',
        severity: 'high',
        text: 'Are you feeling overwhelmed by endless Zoom meetings? In this video...',
        suggestion: 'Hook is too slow for short-form video. Start with direct visual impact: "This one 5-minute calendar rule freed up 15 hours of my week."',
        line: 1
      }
    ],
    voiceAnalysis: {
      naturalness: 72,
      emotionScore: 65,
      pauseRatio: 0.08,
      speakingPaceWpm: 175,
      isMonotone: true,
      syntheticArtifactRisk: 'Medium',
      recommendations: ['Vary vocal inflection on key numbers to avoid monotone drop-off.']
    },
    videoAnalysis: {
      editingPacingScore: 80,
      cameraMovementRating: 'Static',
      sceneTransitionRate: 'Every 5.8s',
      frameRepetitionCount: 3,
      aiVisualArtifactRisk: 'Medium',
      resolution: '1080x1920 Vertical',
      compressionQuality: 'Good',
      recommendations: ['Accelerate transition speed to 2.0s for vertical short-form standards.']
    },
    thumbnailAnalysis: {
      ctrPredictionScore: 71,
      faceCount: 0,
      dominantEmotion: 'N/A',
      textReadabilityScore: 82,
      contrastRating: 'Medium Contrast',
      clickbaitRisk: 'Low',
      compositionScore: 70,
      recommendations: ['Add human face expression to increase click-through rate by up to 38%.']
    },
    seoAnalysis: {
      titleOptimizationScore: 79,
      descriptionScore: 75,
      keywordDensity: '1.8%',
      rankingOpportunity: 'Medium',
      competitorComparison: 'Moderate keyword coverage.',
      suggestedTags: ['Founder Routines', 'Time Management', 'Shorts Productivity'],
      suggestedHashtags: ['#FounderLife', '#ProductivityHacks']
    },
    copyrightAnalysis: {
      musicMatchRisk: 'Medium',
      detectedLogos: ['Zoom'],
      movieClipRisk: 'Low',
      watermarkDetected: false,
      stockFootageEstimate: '42%',
      recommendations: ['Verify commercial usage rights for background ambient track.']
    },
    hookAnalysis: {
      first5SecRetention: 64,
      first10SecRetention: 55,
      first30SecRetention: 42,
      hookDropoffReason: 'Generic opening question without instant visual proof.',
      recommendedHooks: ['"Stop scheduling 30-minute meetings for 5-minute answers."']
    },
    platformReports: [
      {
        platform: 'YouTube',
        score: 78,
        policyStatus: 'Compliant',
        adSuitability: 'Eligible',
        specificRecommendations: ['Optimize video intro for YouTube Shorts feed retention.']
      },
      {
        platform: 'TikTok',
        score: 71,
        policyStatus: 'Review Suggested',
        adSuitability: 'Pacing Warning',
        specificRecommendations: ['Increase fast text overlays.']
      },
      {
        platform: 'Instagram',
        score: 76,
        policyStatus: 'Compliant',
        adSuitability: 'Eligible',
        specificRecommendations: ['Add trending audio background track.']
      },
      {
        platform: 'Facebook',
        score: 80,
        policyStatus: 'Compliant',
        adSuitability: 'Eligible',
        specificRecommendations: ['Good text readability for silent auto-play.']
      },
      {
        platform: 'LinkedIn',
        score: 85,
        policyStatus: 'Compliant',
        adSuitability: 'High Relevance',
        specificRecommendations: ['Post with text summary document attachment.']
      }
    ]
  }
];

export function getProjectById(id: string): ProjectData {
  const found = SAMPLE_PROJECTS.find(p => p.id === id);
  return found || SAMPLE_PROJECTS[0];
}
