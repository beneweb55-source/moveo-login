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
//   superembed.stream — no code path references it (the app uses multiembed.mov).
//     CORRECTION (2026-09-20): the SuperEmbed family DOES still use that host —
//     the bare root of streamingnow.mov 302s to it. It is deliberately NOT
//     reinstated, because the embed path we actually frame
//     (streamingnow.mov/?play=<payload>) answers 200 and does not redirect. It
//     becomes eligible only with a measurement of OUR embed path, not the root.
//   femb.in           — no code path references it
//   vidmoly.to        — no code path references it
//   data: / blob:     — there is no data: or blob: iframe anywhere in the app
//
// REMOVED 2026-09-20 — voe.sx and the dood.* hosts, twelve entries in all (six
// hosts, each listed bare and as a `*.` wildcard, because a wildcard does not
// cover the bare host). These existed for one purpose: letting the player frame
// a `voe_url`/`dood_url` read from /api/catalogue. That tier has been removed
// from the product — VOE and Dood are not supported — and the mechanism that
// selected it was measured on production 2026-09-20 selecting a dead embed
// (voe.sx answered 404) as the DEFAULT source for a first-time visitor. No code
// path can produce these origins now, which is the same standard applied to
// every other removal above. Do not re-add them from a provider listing.
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
  // Alternative servers — see PROVIDERS in lib/providers.ts
  'https://frembed.surf',
  'https://multiembed.mov',
  // SuperEmbed's REDIRECT TARGET, measured 2026-09-20:
  //   GET https://multiembed.mov/?video_id=550&tmdb=1
  //     -> 302 -> https://streamingnow.mov/?play=<base64 payload>
  // The payload is generated server-side, so the hop cannot be skipped the way
  // frembed.work's is — the frame starts at multiembed.mov and lands here, and
  // Chrome re-checks frame-src against the target. Without this entry the
  // provider was blocked by our own policy while tests/csp.test.ts stayed green,
  // because that test only ever checked the origin WE generate.
  // streamingnow.mov is the provider's own host, not an ad domain:
  //   GET https://streamingnow.mov/ -> 302 -> https://www.superembed.stream?c=embed
  'https://streamingnow.mov',
  'https://vidsrc.to',
  'https://vidsrc.me',
  // VidSrc.me's REDIRECT TARGET, measured 2026-09-20:
  //   GET https://vidsrc.me/embed/movie?tmdb=550
  //     -> 301 Moved Permanently -> https://vidsrc.sh/embed/movie?tmdb=550 (200)
  // The query string survives the hop, so a later change could point the
  // provider straight at vidsrc.sh and drop vidsrc.me; until that is reviewed
  // deliberately, both origins are permitted so the frame works either way.
  'https://vidsrc.sh',
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
