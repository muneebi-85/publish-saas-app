import type { MetadataRoute } from 'next';

const BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://publish.genapps.online';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/legal/', '/pricing', '/restore'],
        disallow: [
          '/api/',
          '/dashboard',
          '/analysis/',
          '/projects',
          '/upload',
          '/settings',
          '/reports',
          '/ai-humanizer',
          '/seo',
          '/channel-analytics',
          '/inbox',
          '/*?*',
        ],
      },
      {
        userAgent: ['GPTBot', 'ClaudeBot', 'Google-Extended', 'CCBot'],
        allow: ['/', '/legal/'],
        disallow: ['/api/', '/dashboard', '/analysis/', '/settings'],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
