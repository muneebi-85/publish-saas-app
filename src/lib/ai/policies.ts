export type PlatformName = 'YouTube' | 'TikTok' | 'Instagram' | 'Facebook' | 'LinkedIn';

/**
 * Policy reference cards.
 * Keep these current — they are cited verbatim to the model and shown to users.
 * `lastReviewed` surfaces in the UI so creators know how fresh our ruleset is.
 *
 * NOTE: this module must stay free of server-only imports (env, prisma, nvidia).
 * It is imported from client components (MethodologyCard) and would otherwise
 * drag the server env guard into the client bundle, where the required
 * variables do not exist and the module throws at import time.
 */
export const PLATFORM_POLICIES: Record<PlatformName, {
  lastReviewed: string;
  monetizationName: string;
  rules: string[];
  disqualifiers: string[];
}> = {
  YouTube: {
    lastReviewed: '2026-09-02',
    monetizationName: 'YouTube Partner Program / AdSense',
    rules: [
      'Advertiser-friendly content guidelines govern ad suitability (green/yellow/red icon); human review of ad-suitability decisions may take up to 24 hours.',
      'Synthetic or altered content must be disclosed via the "AI use" setting when it is photorealistic and could mislead about real people, events, or places. Disclosing does not limit reach or monetization; consistently failing to disclose risks a YouTube-applied label, removal, or YPP suspension. Aesthetic edits, idea generation, and cloning your own voice are exempt.',
      'Reused content policy: repurposing others’ material requires significant commentary, substantive modification, or added value — even with permission, and independent of copyright.',
      'Inauthentic content policy (renamed from "repetitious content", July 2025): content must not be mass-produced, generic, repetitive, or manipulative — template-driven storylines with identical outcomes and AI content built on generic templates without original insight are demonetizable.',
      'AI personas presenting as human experts on sensitive topics — e.g. an AI "doctor" giving medical advice or an AI host offering investment advice — cannot monetize.',
      'Profanity in the first 7 seconds or repeated strong profanity limits ad suitability.',
      'Controversial issues and sensitive events reduce advertiser suitability even when non-violative.',
      'Music must be licensed or from the Audio Library; Content ID claims may divert revenue.',
    ],
    disqualifiers: [
      'Reused/unoriginal content with no transformation',
      'Mass-produced or templated content with no original insight (inauthentic content policy)',
      'AI persona posing as a human expert on sensitive topics (medical, financial)',
      'Undisclosed photorealistic synthetic content depicting real people or events',
      'Repeated strong profanity throughout',
      'Content primarily targeting children without COPPA-compliant setup',
    ],
  },
  TikTok: {
    lastReviewed: '2026-09-02',
    monetizationName: 'TikTok Creator Rewards Program',
    rules: [
      'Videos must be longer than 1 minute to qualify for Creator Rewards.',
      'Content must be original — reposted or watermarked content from other platforms is excluded.',
      'Must meet "qualified views" criteria: watched for a meaningful duration by real accounts.',
      'Rewards value factors in watch time, search value, and engagement (likes, comments, shares) — completion and rewatches matter, not raw view count.',
      'Community Guidelines compliance is required; strikes remove eligibility.',
      'Commercial music requires the Commercial Music Library for branded content.',
    ],
    disqualifiers: [
      'Video under 1 minute',
      'Visible watermark from another platform',
      'Duetted/stitched content with insufficient original contribution',
      'Static images or slideshows with minimal motion',
    ],
  },
  Instagram: {
    lastReviewed: '2026-09-02',
    monetizationName: 'Instagram Reels bonuses & branded content',
    rules: [
      'Content Monetization Policies apply in addition to Community Guidelines.',
      'Reels must be original; recycled third-party content is excluded.',
      'Videos with watermarks or borders receive reduced distribution.',
      'Branded content must use the paid partnership label.',
      'Vertical 9:16 format required for full Reels distribution.',
      'Sends-per-reach (shares to DMs) is the distribution signal Instagram leadership has named as the strongest growth indicator for Reels.',
    ],
    disqualifiers: [
      'Watermarked or letterboxed content',
      'Content recycled from TikTok with visible attribution',
      'Undisclosed paid partnerships',
    ],
  },
  Facebook: {
    lastReviewed: '2026-09-02',
    monetizationName: 'Facebook In-Stream Ads',
    rules: [
      'Videos should exceed 1 minute for in-stream ad placement; 3 minutes is preferred.',
      'Content must satisfy Content Monetization Policies (stricter than Community Standards).',
      'Original content requirement — compilations and unedited third-party clips are excluded.',
      'Assume silent auto-play: captions and a descriptive opening frame materially affect retention.',
      'Engagement bait ("tag a friend", "share to win") reduces distribution.',
    ],
    disqualifiers: [
      'Videos under 1 minute',
      'Static image slideshows',
      'Engagement bait language',
      'Unedited third-party content',
    ],
  },
  LinkedIn: {
    lastReviewed: '2026-09-02',
    monetizationName: 'LinkedIn creator distribution (no direct ad revenue share)',
    rules: [
      'No direct monetization program — value is reach, inbound leads, and B2B credibility.',
      'Professional Community Policies apply; overtly promotional content is downranked.',
      'Native video outperforms external links in distribution.',
      'First 3 lines determine expand-rate; front-load the insight.',
      'Hashtags: 3-5 industry-specific tags perform best.',
    ],
    disqualifiers: [
      'Purely promotional content with no professional insight',
      'External link in the post body (reduces reach)',
    ],
  },
};
