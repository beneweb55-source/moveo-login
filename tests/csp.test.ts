/**
 * Holds the Content-Security-Policy `frame-src` allowlist to the provider list.
 *
 * WHY A TEST AND NOT AN IMPORT: next.config.ts deliberately keeps its own
 * literal list rather than importing lib/providers.ts, because an error thrown
 * while evaluating that module would break the whole build. This test gives the
 * same guarantee — the two lists cannot drift apart — without that risk.
 *
 * Run: node --import tsx --test tests/csp.test.ts
 */

import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import nextConfig from '../next.config';
import {
  PROVIDERS,
  PROVIDER_FRAME_ORIGINS,
  SBNET_FRAME_ORIGIN,
  buildProviderUrl,
} from '../lib/providers';

const getFrameSrc = async (): Promise<string> => {
  assert.ok(nextConfig.headers, 'next.config.ts must define headers()');
  const rules = await nextConfig.headers();
  for (const rule of rules) {
    for (const header of rule.headers) {
      if (header.key.toLowerCase() === 'content-security-policy') {
        const match = /(?:^|;)\s*frame-src\s+([^;]+)/i.exec(header.value);
        assert.ok(match, `no frame-src directive found in: ${header.value}`);
        return match[1].trim();
      }
    }
  }
  throw new Error('no Content-Security-Policy header configured');
};

const tokens = (frameSrc: string): string[] => frameSrc.split(/\s+/).filter(Boolean);

/**
 * Mirrors how a browser matches a source expression: exact match, or a
 * `https://*.host` wildcard, which covers subdomains but not the bare host.
 */
const originAllowed = (origin: string, entries: string[]): boolean => {
  if (entries.includes(origin)) return true;
  const {protocol, hostname} = new URL(origin);
  return entries.some((entry) => {
    if (!entry.startsWith('https://*.')) return false;
    const suffix = entry.slice('https://*.'.length);
    return protocol === 'https:' && hostname.endsWith(`.${suffix}`);
  });
};

describe('frame-src covers every provider the app can frame', () => {
  it('allows every origin each provider can put in a frame document', async () => {
    // Not just the origin we write into the iframe: a provider that redirects
    // moves the frame to a different origin, and the browser checks frame-src
    // against the TARGET of that redirect. Checking only frameOrigins[0] is
    // what let the SuperEmbed and VidSrc breaks ship with a green suite.
    const entries = tokens(await getFrameSrc());
    for (const provider of PROVIDERS) {
      for (const origin of provider.frameOrigins) {
        assert.ok(
          originAllowed(origin, entries),
          `${provider.name} frames ${origin} (or is redirected there) but our own CSP blocks it`,
        );
      }
    }
  });

  it('declares the entry origin first for every provider', async () => {
    // frameOrigins[0] is the contract other code relies on (e.g. the
    // check-server probe target), so it must match the URL buildUrl() returns.
    for (const provider of PROVIDERS) {
      const url = buildProviderUrl(provider.name, {type: 'movie', id: '550'});
      assert.ok(url, `${provider.name} did not build a movie URL`);
      assert.equal(
        new URL(url).origin,
        provider.frameOrigins[0],
        `${provider.name} builds ${url} but declares a different entry origin`,
      );
    }
  });

  it('allows the concrete movie and series URLs each provider generates', async () => {
    const entries = tokens(await getFrameSrc());
    for (const provider of PROVIDERS) {
      for (const params of [
        {type: 'movie' as const, id: '550'},
        {type: 'tv' as const, id: '1396', season: 1, episode: 1},
      ]) {
        const url = buildProviderUrl(provider.name, params);
        assert.ok(url);
        assert.ok(
          originAllowed(new URL(url).origin, entries),
          `${url} would be blocked by our own CSP`,
        );
      }
    }
  });

  it('allows the Sibnet embed origin', async () => {
    const entries = tokens(await getFrameSrc());
    assert.ok(originAllowed(SBNET_FRAME_ORIGIN, entries));
  });

  it('allows the YouTube trailer embed', async () => {
    const entries = tokens(await getFrameSrc());
    assert.ok(originAllowed('https://www.youtube.com', entries));
  });

  it('keeps self framing', async () => {
    assert.ok(tokens(await getFrameSrc()).includes("'self'"));
  });
});

describe('frame-src is narrower than what it replaced', () => {
  it('does not contain the bare https: wildcard', async () => {
    // This is the whole point of the change. A bare `https:` would allow
    // framing any origin on the web.
    const entries = tokens(await getFrameSrc());
    assert.ok(!entries.includes('https:'), 'frame-src must not allow all of https:');
  });

  it('does not contain any other scheme-wide or host-wide wildcard', async () => {
    const entries = tokens(await getFrameSrc());
    for (const entry of entries) {
      assert.notEqual(entry, '*');
      assert.notEqual(entry, 'https://*');
      assert.ok(!entry.endsWith('://*'), `over-broad entry: ${entry}`);
    }
  });

  it('does not allow data: or blob: frames, which no iframe in the app uses', async () => {
    const entries = tokens(await getFrameSrc());
    assert.ok(!entries.includes('data:'));
    assert.ok(!entries.includes('blob:'));
  });

  it('does not carry the dead origins that were removed', async () => {
    // Each of these was verified to have no code path that can produce it.
    // If one is ever re-added, it must come with a provider that uses it.
    const entries = tokens(await getFrameSrc());
    for (const dead of [
      'https://frembed.work',
      'https://vidsrc.cc',
      'https://www.2embed.to',
      'https://superembed.stream',
      'https://femb.in',
      'https://vidmoly.to',
    ]) {
      assert.ok(!entries.includes(dead), `${dead} is unreachable from application code`);
    }
  });

  it('no longer permits the removed premium (VOE / Dood) hosts, bare or as a wildcard', async () => {
    // This is the point of the removal, stated as a test so it cannot be undone
    // by accident. Those twelve entries existed only so the player could frame a
    // voe_url/dood_url from /api/catalogue. The tier is not supported by the
    // product, the lookup that fed it is gone, and the URLs it stored were
    // measured dead (voe.sx answered 404) — so nothing may frame these again.
    //
    // Both shapes are asserted: a `https://*.host` wildcard does NOT cover the
    // bare host, so leaving either behind would still be permission for a
    // provider we no longer have.
    const entries = tokens(await getFrameSrc());
    for (const host of [
      'voe.sx',
      'dood.watch',
      'dood.to',
      'dood.so',
      'dood.pm',
      'dood.wf',
    ]) {
      assert.ok(
        !entries.includes(`https://${host}`),
        `${host} is still permitted as a bare host`,
      );
      assert.ok(
        !entries.includes(`https://*.${host}`),
        `${host} is still permitted as a wildcard`,
      );
    }
  });

  it('still allows every origin the previous policy allowed that code can use', async () => {
    // A narrowing that silently dropped a working provider would be a bug.
    const entries = tokens(await getFrameSrc());
    for (const kept of [
      'https://frembed.surf',
      'https://multiembed.mov',
      'https://vidsrc.to',
      'https://vidsrc.me',
      'https://www.2embed.cc',
      // SmashyStream's current host (moved 2026-09-21). The origin it replaced,
      // player.smashy.stream, was a TLS hostname mismatch and could not load.
      'https://anyembed.xyz',
      'https://vidlink.pro',
      'https://video.sibnet.ru',
      'https://youtube.com',
      'https://www.youtube.com',
    ]) {
      assert.ok(entries.includes(kept), `${kept} must remain allowed`);
    }
  });
});

describe('the policy is scoped to frame-src only', () => {
  it('addresses every path and sets only frame-src', async () => {
    assert.ok(nextConfig.headers);
    const rules = await nextConfig.headers();
    assert.equal(rules.length, 1);
    assert.equal(rules[0].source, '/:path*');

    const csp = rules[0].headers.find((h) => h.key === 'Content-Security-Policy');
    assert.ok(csp);
    // Only frame-src is specified, so no other directive is accidentally
    // loosened or tightened by this change.
    assert.equal((csp.value.match(/;/g) ?? []).length, 0);
    assert.ok(csp.value.trim().startsWith('frame-src '));
  });
});

/**
 * The regression this block exists to prevent.
 *
 * A provider's entry URL is only the first hop. Chrome re-checks `frame-src`
 * against a redirect's TARGET, so a provider whose entry point 302s to another
 * origin is blocked unless BOTH origins are listed. The earlier suite asserted
 * only `frameOrigins[0]`, so SuperEmbed and VidSrc.me were blocked in
 * production while every test passed.
 *
 * The chains below are MEASUREMENTS, not documentation. If a provider rotates
 * a host, this block fails — which is the point: the fix is to re-measure and
 * update the registry deliberately, not to quietly widen the CSP.
 */
describe('measured provider redirect chains stay covered', () => {
  const MEASURED_CHAINS: ReadonlyArray<{
    provider: string;
    entry: string;
    hops: readonly string[];
  }> = [
    {
      // GET https://multiembed.mov/?video_id=550&tmdb=1 -> 302 -> streamingnow.mov
      provider: 'SuperEmbed',
      entry: 'https://multiembed.mov',
      hops: ['https://streamingnow.mov'],
    },
    {
      // GET https://vidsrc.me/embed/movie?tmdb=550 -> 301 -> vidsrc.sh
      provider: 'VidSrc.me',
      entry: 'https://vidsrc.me',
      hops: ['https://vidsrc.sh'],
    },
    {
      // Framed directly, so no hop is ever taken (see lib/providers.ts header).
      provider: 'Frembed',
      entry: 'https://frembed.surf',
      hops: [],
    },
  ];

  it('declares every hop of each measured chain on the provider', () => {
    for (const chain of MEASURED_CHAINS) {
      const provider = PROVIDERS.find((p) => p.name === chain.provider);
      assert.ok(provider, `${chain.provider} is no longer a provider`);
      assert.equal(
        provider.frameOrigins[0],
        chain.entry,
        `${chain.provider} no longer starts at ${chain.entry}`,
      );
      for (const hop of chain.hops) {
        assert.ok(
          provider.frameOrigins.includes(hop),
          `${chain.provider} is redirected to ${hop} but does not declare it`,
        );
      }
    }
  });

  it('allows every hop of each measured chain in frame-src', async () => {
    const entries = tokens(await getFrameSrc());
    for (const chain of MEASURED_CHAINS) {
      for (const origin of [chain.entry, ...chain.hops]) {
        assert.ok(
          originAllowed(origin, entries),
          `${chain.provider}: ${origin} is reachable by a frame we create but our own CSP blocks it`,
        );
      }
    }
  });

  it('does not allow anything the application cannot reach', async () => {
    // The converse drift: an entry added to frame-src from documentation rather
    // than from a code path is permission nobody needs. Every entry must now be
    // traceable to a declared provider origin, or be one of the three
    // non-provider frames the app actually creates (the Sibnet embed and the two
    // YouTube trailer origins). This is what keeps the list from growing back:
    // with the premium tier gone there is no category left that would justify an
    // entry from anywhere else — no wildcard category, and no host we merely
    // expect a provider to redirect to.
    const entries = tokens(await getFrameSrc());
    const declared = new Set<string>(PROVIDER_FRAME_ORIGINS);
    for (const entry of entries) {
      if (entry === "'self'") continue;
      // Origins that are not provider frames at all, each with its own reason.
      if (
        entry === 'https://video.sibnet.ru' || // /api/sibnet embed origin
        entry === 'https://www.youtube.com' ||
        entry === 'https://youtube.com'
      ) {
        continue;
      }
      assert.ok(
        declared.has(entry),
        `${entry} is allowed by frame-src but no provider declares it`,
      );
    }
  });
});
