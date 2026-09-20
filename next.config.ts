import type {NextConfig} from 'next';

// All iframe video domains the application can actually target.
//
// This list is the source of truth for `frame-src` below, and it is held to the
// providers by tests/csp.test.ts, which asserts that every origin in
// lib/providers.ts appears here. Add a provider to lib/providers.ts and that
// test fails until this list is updated — the two cannot drift apart silently.
//
// It previously sat unused next to a permissive `frame-src https:` wildcard.
// The wildcard allowed framing *any* HTTPS origin, which meant a compromise
// anywhere that could influence an iframe src was not contained by the CSP.
// Narrowing it here removes that class of failure without changing which
// providers work: every entry below is reachable from application code.
//
// Entries were pruned only when no code path can produce them (verified by
// grepping the whole repo, not by assumption). The removed origins, and why:
//   frembed.work      — 302-redirects to frembed.surf, so it is never framed
//   vidsrc.cc         — no code path references it
//   www.2embed.to     — no code path references it (the app uses 2embed.cc)
//   superembed.stream — no code path references it (the app uses multiembed.mov)
//   femb.in           — no code path references it
//   vidmoly.to        — no code path references it
//   data: / blob:     — there is no data: or blob: iframe anywhere in the app
// Do not re-add these from third-party documentation: several listings still
// name frembed.pro, which is a parked domain.
//
// CORRECTION (2026-09-20): an earlier note here claimed frembed.work "does not
// resolve". That was wrong. It resolves (Cloudflare) and 302-redirects to
// frembed.surf:
//   GET https://frembed.work/api/film.php?id=98               -> 302 -> frembed.surf/...
//   GET https://frembed.work/api/serie.php?id=1399&sa=1&epi=1 -> 302 -> frembed.surf/...
// The application deliberately frames frembed.surf DIRECTLY and never frames
// the redirector. That is what matters for `frame-src`: Chrome re-checks
// frame-src against a redirect's target, so framing frembed.work would require
// allowing frembed.surf anyway. The hop is skipped rather than permitted.
const VIDEO_FRAME_DOMAINS = [
  "'self'",
  // Premium servers (VOE / Dood). These URLs come from the catalogue tables
  // (voe_url / dood_url) and toVoeEmbed/toDoodEmbed only rewrites the PATH, so
  // the host is whatever the scraper stored. Both the bare host and its
  // subdomains are listed: a CSP `*.host` wildcard does NOT cover the bare
  // host, and `https://dood.watch/e/...` is a normal shape for these links.
  //
  // RESIDUAL RISK, stated plainly: if the scraper ever stores a dood/voe mirror
  // on a host that is not listed here, the browser will block that iframe,
  // whereas the old blanket `https:` allowed it. The player reports such a
  // frame as a load failure with Retry / Change server / Open in new tab, so it
  // is visible and recoverable rather than silent. The fix is to add the host
  // here — that is a deliberate, reviewed act, which is the point of the list.
  'https://*.voe.sx',
  'https://voe.sx',
  'https://*.dood.watch',
  'https://dood.watch',
  'https://*.dood.to',
  'https://dood.to',
  'https://*.dood.so',
  'https://dood.so',
  'https://*.dood.pm',
  'https://dood.pm',
  'https://*.dood.wf',
  'https://dood.wf',
  // Alternative servers — see PROVIDERS in lib/providers.ts
  'https://frembed.surf',
  'https://multiembed.mov',
  'https://vidsrc.to',
  'https://vidsrc.me',
  'https://www.2embed.cc',
  'https://player.smashy.stream',
  'https://vidlink.pro',
  // Sibnet — origin of the embed returned by /api/sibnet
  'https://video.sibnet.ru',
  // YouTube (trailers)
  'https://www.youtube.com',
  'https://youtube.com',
].join(' ');

const cspHeaders = [
  { key: 'Content-Security-Policy', value: `frame-src ${VIDEO_FRAME_DOMAINS}` },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // Allow access to remote image placeholder.
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'image.tmdb.org',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
  output: 'standalone',
  transpilePackages: ['motion'],
  async headers() {
    return [
      {
        // Apply CSP to all pages — trailers use YouTube iframes on any page
        source: '/:path*',
        headers: cspHeaders,
      },
    ];
  },
  webpack: (config, {dev}) => {
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    // Do not modify—file watching is disabled to prevent flickering during agent edits.
    if (dev && process.env.DISABLE_HMR === 'true') {
      config.watchOptions = {
        ignored: /.*/,
      };
    }
    return config;
  },
};

export default nextConfig;
