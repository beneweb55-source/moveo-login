import type {NextConfig} from 'next';

// All iframe video domains actually used by VideoPlayer.tsx and trailer modals.
// Each domain here maps to a real provider in the application code.
const VIDEO_FRAME_DOMAINS = [
  "'self'",
  // Premium servers (VOE / Dood)
  'https://*.voe.sx',
  'https://voe.sx',
  'https://*.dood.watch',
  'https://*.dood.to',
  'https://*.dood.so',
  'https://*.dood.pm',
  'https://*.dood.wf',
  // Alternative servers (VideoPlayer ALTERNATIVE_SERVERS)
  'https://frembed.work',
  'https://frembed.casa',
  'https://vercel.live',
  'https://multiembed.mov',
  'https://vidsrc.to',
  'https://vidsrc.me',
  'https://vidsrc.cc',
  'https://www.2embed.cc',
  'https://www.2embed.to',
  'https://player.smashy.stream',
  'https://vidlink.pro',
  'https://superembed.stream',
  // Sibnet
  'https://video.sibnet.ru',
  // Legacy / fallback
  'https://femb.in',
  'https://vidmoly.to',
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
