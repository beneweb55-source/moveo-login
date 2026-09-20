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
import {PREMIUM_EMBED_HOSTS, PROVIDERS, SBNET_FRAME_ORIGIN, buildProviderUrl} from '../lib/providers';

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
  it('allows each provider own frame origin', async () => {
    const entries = tokens(await getFrameSrc());
    for (const provider of PROVIDERS) {
      assert.ok(
        originAllowed(provider.frameOrigin, entries),
        `${provider.name} (${provider.frameOrigin}) would be blocked by our own CSP`,
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

  it('allows the premium hosts the catalogue can return', async () => {
    // Those URLs come from /api/catalogue (voe_url / dood_url) at runtime.
    const entries = tokens(await getFrameSrc());
    for (const host of [
      'https://voe.sx',
      'https://sub.voe.sx',
      'https://dood.watch',
      'https://sub.dood.to',
      'https://player.dood.so',
    ]) {
      assert.ok(originAllowed(host, entries), `${host} would be blocked by our own CSP`);
    }
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

  it('still allows every origin the previous policy allowed that code can use', async () => {
    // A narrowing that silently dropped a working provider would be a bug.
    const entries = tokens(await getFrameSrc());
    for (const kept of [
      'https://frembed.surf',
      'https://multiembed.mov',
      'https://vidsrc.to',
      'https://vidsrc.me',
      'https://www.2embed.cc',
      'https://player.smashy.stream',
      'https://vidlink.pro',
      'https://video.sibnet.ru',
      'https://youtube.com',
      'https://www.youtube.com',
      'https://voe.sx',
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

describe('the premium pinning list and the CSP cannot drift apart', () => {
  it('permits every host pinPremiumEmbedUrl will accept', async () => {
    // pinPremiumEmbedUrl is the gate deciding which catalogue URLs may reach an
    // iframe src or a link href. If it accepts a host that frame-src rejects,
    // the player offers a source the browser then blocks — so the two lists are
    // held together here.
    const entries = tokens(await getFrameSrc());
    for (const host of PREMIUM_EMBED_HOSTS) {
      assert.ok(
        originAllowed(`https://${host}`, entries),
        `${host} is accepted by pinPremiumEmbedUrl but blocked by our own CSP`,
      );
      assert.ok(
        originAllowed(`https://cdn.${host}`, entries),
        `subdomains of ${host} are accepted by pinPremiumEmbedUrl but blocked by our own CSP`,
      );
    }
  });

  it('lists the bare host as well as the wildcard for each one', async () => {
    // A `https://*.host` entry does NOT cover the bare host, and
    // `https://dood.watch/e/...` is a normal shape for these links.
    const entries = tokens(await getFrameSrc());
    for (const host of PREMIUM_EMBED_HOSTS) {
      assert.ok(entries.includes(`https://${host}`), `missing bare host entry for ${host}`);
    }
  });
});
