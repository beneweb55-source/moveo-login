import type { MetadataRoute } from 'next';

const BASE_URL = 'https://www.moveo.blog';

/**
 * The hub routes only.
 *
 * The catalogue is TMDB-backed and effectively unbounded: thousands of
 * `/movie/<tmdb-id>` and `/tv/<tmdb-id>` URLs, with no local table to enumerate
 * them from. Listing individual titles here would need either a snapshot table
 * or a live TMDB crawl per request, and neither exists today — choosing one is
 * a design decision, not a fix, so this sitemap deliberately covers the entry
 * points that a crawler can actually follow.
 *
 * `lastModified` is omitted rather than invented: these routes are
 * client-rendered and have no server-side change time to report.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const routes: Array<{ path: string; priority: number }> = [
    { path: '/', priority: 1 },
    { path: '/films', priority: 0.9 },
    { path: '/series', priority: 0.9 },
    { path: '/animes', priority: 0.8 },
    { path: '/kdrama', priority: 0.8 },
    { path: '/explore/movie', priority: 0.6 },
    { path: '/explore/tv', priority: 0.6 },
  ];

  return routes.map(({ path, priority }) => ({
    url: `${BASE_URL}${path}`,
    changeFrequency: 'daily' as const,
    priority,
  }));
}
