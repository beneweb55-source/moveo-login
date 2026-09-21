import type { MetadataRoute } from 'next';

const BASE_URL = 'https://www.moveo.blog';

/**
 * Measured before this file existed: `GET /robots.txt` returned 404 in
 * production, as did `GET /sitemap.xml`. Nothing in `public/` supplied either.
 *
 * The disallow list is made of two kinds of route, and both are here for the
 * same reason — a crawler that reaches them gets nothing worth indexing:
 *   - `/api/` — machines-only. Some of these either 401 or spend a paid quota
 *     per request (`/api/ai-search` reaches Gemini), so crawling them is pure
 *     cost.
 *   - the account and auth pages — they render only for a session, and an
 *     anonymous visitor sees a form.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/admin',
        '/profile',
        '/my-list',
        '/banned',
        '/login',
        '/register',
        '/forgot-password',
        '/reset-password',
        '/verify-email',
      ],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
