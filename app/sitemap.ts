import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/site-url';

const siteUrl = getSiteUrl();

const LAST_MODIFIED = {
  landing: new Date('2026-03-07T00:00:00.000Z'),
  legal: new Date('2026-03-02T00:00:00.000Z'),
} as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${siteUrl}/`,
      lastModified: LAST_MODIFIED.landing,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${siteUrl}/terms`,
      lastModified: LAST_MODIFIED.legal,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    {
      url: `${siteUrl}/privacy`,
      lastModified: LAST_MODIFIED.legal,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
  ];
}
