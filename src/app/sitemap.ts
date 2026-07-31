import type { MetadataRoute } from 'next';

const BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://publish.genapps.online';

const LEGAL_PATHS = [
  '/legal/terms',
  '/legal/privacy',
  '/legal/subprocessors',
  '/legal/refund',
  '/legal/subscription-terms',
  '/legal/acceptable-use',
  '/legal/cookies',
  '/legal/dmca',
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${BASE}/`,       lastModified: now, changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${BASE}/pricing`,lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE}/restore`,lastModified: now, changeFrequency: 'yearly',  priority: 0.5 },
    ...LEGAL_PATHS.map((p) => ({
      url: `${BASE}${p}`,
      lastModified: now,
      changeFrequency: 'yearly' as const,
      priority: 0.4,
    })),
  ];
}
