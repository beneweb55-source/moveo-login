/**
 * Provider URL generation and provider-list validation.
 *
 * The Frembed expectations below are not invented: they are the URLs the live
 * endpoints actually redirect to, captured on 2026-09-20.
 *
 *   GET https://frembed.surf/api/film.php?id=550
 *     -> 308, location: /embed/movie/550?id=550
 *   GET https://frembed.surf/api/serie.php?id=1396&sa=1&epi=1
 *     -> 308, location: /embed/serie/1396?id=1396&sa=1&epi=1
 *
 * If the provider changes its redirect target, this test is supposed to fail —
 * it is the canary for "our integration silently stopped matching the provider".
 *
 * Run: node --import tsx --test tests/providers.test.ts
 */

import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {
  DEFAULT_PROVIDER_NAME,
  PREMIUM_EMBED_HOSTS,
  PREMIUM_SERVER_NAME,
  PROVIDERS,
  SBNET_FRAME_ORIGIN,
  SBNET_SERVER_NAMES,
  STORABLE_SERVERS,
  buildProviderUrl,
  getMessageOrigins,
  getProvider,
  isProvider,
  isSibnetServer,
  isStorableServer,
  pinPremiumEmbedUrl,
} from '../lib/providers';

const MOVIE = {type: 'movie' as const, id: '550'};
const SERIES = {type: 'tv' as const, id: '1396', season: 1, episode: 1};

describe('Frembed — verified embed URLs', () => {
  it('builds the verified movie embed URL', () => {
    assert.equal(
      buildProviderUrl('Frembed', MOVIE),
      'https://frembed.surf/embed/movie/550?id=550',
    );
  });

  it('builds the verified series embed URL for S1E1', () => {
    assert.equal(
      buildProviderUrl('Frembed', SERIES),
      'https://frembed.surf/embed/serie/1396?id=1396&sa=1&epi=1',
    );
  });

  it('carries any season and episode through unchanged', () => {
    assert.equal(
      buildProviderUrl('Frembed', {type: 'tv', id: '1396', season: 4, episode: 11}),
      'https://frembed.surf/embed/serie/1396?id=1396&sa=4&epi=11',
    );
  });

  it('defaults a missing season/episode to 1 instead of emitting "undefined"', () => {
    // Regression: the previous implementation interpolated raw values, so a
    // series without season/episode produced `&sa=undefined&epi=undefined`.
    const url = buildProviderUrl('Frembed', {type: 'tv', id: '1396'});
    assert.equal(url, 'https://frembed.surf/embed/serie/1396?id=1396&sa=1&epi=1');
    assert.ok(!String(url).includes('undefined'));
  });

  it('coerces invalid season/episode numbers to 1', () => {
    for (const bad of [0, -3, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const url = buildProviderUrl('Frembed', {
        type: 'tv',
        id: '1396',
        season: bad as number,
        episode: bad as number,
      });
      assert.equal(url, 'https://frembed.surf/embed/serie/1396?id=1396&sa=1&epi=1');
    }
  });

  it('never emits the strings undefined, null or NaN', () => {
    for (const provider of PROVIDERS) {
      const movie = buildProviderUrl(provider.name, MOVIE);
      const series = buildProviderUrl(provider.name, SERIES);
      for (const url of [movie, series]) {
        assert.ok(url, `${provider.name} produced no URL`);
        assert.ok(!/undefined|null|NaN/.test(url), `${provider.name} leaked a value: ${url}`);
      }
    }
  });
});

describe('every provider keeps its existing URL contract', () => {
  const expected: Record<string, {movie: string; tv: string}> = {
    Frembed: {
      movie: 'https://frembed.surf/embed/movie/550?id=550',
      tv: 'https://frembed.surf/embed/serie/1396?id=1396&sa=1&epi=1',
    },
    SuperEmbed: {
      movie: 'https://multiembed.mov/?video_id=550&tmdb=1',
      tv: 'https://multiembed.mov/?video_id=1396&tmdb=1&s=1&e=1',
    },
    'VidSrc.to': {
      movie: 'https://vidsrc.to/embed/movie/550',
      tv: 'https://vidsrc.to/embed/tv/1396/1/1',
    },
    'VidSrc.me': {
      movie: 'https://vidsrc.me/embed/movie?tmdb=550',
      tv: 'https://vidsrc.me/embed/tv?tmdb=1396&season=1&episode=1',
    },
    '2Embed': {
      movie: 'https://www.2embed.cc/embed/550',
      tv: 'https://www.2embed.cc/embedtv/1396&s=1&e=1',
    },
    SmashyStream: {
      movie: 'https://player.smashy.stream/movie/550',
      tv: 'https://player.smashy.stream/tv/1396?s=1&e=1',
    },
    VidLink: {
      movie: 'https://vidlink.pro/movie/550',
      tv: 'https://vidlink.pro/tv/1396/1/1',
    },
  };

  for (const [name, want] of Object.entries(expected)) {
    it(`${name} produces its movie and series URLs`, () => {
      assert.equal(buildProviderUrl(name, MOVIE), want.movie);
      assert.equal(buildProviderUrl(name, SERIES), want.tv);
    });
  }
});

describe('input hardening', () => {
  it('returns null for an unknown provider name', () => {
    // Without this, a name from localStorage would be interpolated into a URL
    // template and we would frame whatever it named.
    assert.equal(buildProviderUrl('Not A Provider', MOVIE), null);
    assert.equal(buildProviderUrl('', MOVIE), null);
  });

  it('returns null for an empty or whitespace id', () => {
    assert.equal(buildProviderUrl('Frembed', {type: 'movie', id: ''}), null);
    assert.equal(buildProviderUrl('Frembed', {type: 'movie', id: '   '}), null);
  });

  it('encodes an id that contains URL syntax', () => {
    const url = buildProviderUrl('Frembed', {type: 'movie', id: 'a&epi=99'});
    assert.equal(url, 'https://frembed.surf/embed/movie/a%26epi%3D99?id=a%26epi%3D99');
    // The injected parameter must not become a real query parameter.
    assert.equal(new URL(url as string).searchParams.get('epi'), null);
  });

  it('encodes a path-traversal id so it cannot change the provider path', () => {
    const url = buildProviderUrl('Frembed', {type: 'movie', id: '../serie/1'});
    assert.equal(new URL(url as string).pathname, '/embed/movie/..%2Fserie%2F1');
  });

  it('trims surrounding whitespace from the id', () => {
    assert.equal(
      buildProviderUrl('Frembed', {type: 'movie', id: '  550  '}),
      'https://frembed.surf/embed/movie/550?id=550',
    );
  });

  it('builds every URL on that provider own declared frame origin', () => {
    for (const provider of PROVIDERS) {
      const url = buildProviderUrl(provider.name, MOVIE);
      assert.ok(url);
      assert.equal(
        new URL(url).origin,
        provider.frameOrigin,
        `${provider.name} frames a different origin than it declares`,
      );
    }
  });
});

describe('provider list validation', () => {
  it('recognises configured providers and rejects anything else', () => {
    for (const provider of PROVIDERS) {
      assert.ok(isProvider(provider.name), `${provider.name} should be a provider`);
    }
    assert.equal(isProvider('Bogus'), false);
    assert.equal(isProvider('Frembed '), false, 'lookup is exact, not fuzzy');
    assert.equal(getProvider('Bogus'), undefined);
  });

  it('lists exactly the servers that may be persisted', () => {
    for (const provider of PROVIDERS) {
      assert.ok(isStorableServer(provider.name), `${provider.name} must be storable`);
    }
    for (const name of SBNET_SERVER_NAMES) {
      assert.ok(isStorableServer(name), `${name} must be storable`);
    }
    assert.ok(isStorableServer(PREMIUM_SERVER_NAME));
    assert.equal(isStorableServer('Bogus'), false);
    assert.equal(isStorableServer(''), false);
  });

  it('identifies the Sibnet servers specifically', () => {
    for (const name of SBNET_SERVER_NAMES) {
      assert.equal(isSibnetServer(name), true);
    }
    assert.equal(isSibnetServer('Frembed'), false);
  });

  it('has a default provider that is genuinely selectable', () => {
    assert.ok(STORABLE_SERVERS.includes(DEFAULT_PROVIDER_NAME));
  });

  it('has one non-empty messageOrigins allowlist, and it is Frembed', () => {
    const withOrigins = PROVIDERS.filter((p) => p.messageOrigins.length > 0);
    assert.deepEqual(
      withOrigins.map((p) => p.name),
      ['Frembed'],
      'only the origin observed emitting messages may be trusted',
    );
    assert.deepEqual(getMessageOrigins('Frembed'), ['https://frembed.surf']);
  });

  it('accepts no messages at all from providers that have never been observed sending any', () => {
    for (const provider of PROVIDERS) {
      if (provider.name === 'Frembed') continue;
      assert.deepEqual(getMessageOrigins(provider.name), []);
    }
    assert.deepEqual(getMessageOrigins('Sibnet VF'), []);
    assert.deepEqual(getMessageOrigins('MOVEO PREMIUM'), []);
    assert.deepEqual(getMessageOrigins('Unknown Server'), []);
  });

  it('declares HTTPS origins with no path', () => {
    for (const provider of PROVIDERS) {
      assert.ok(provider.frameOrigin.startsWith('https://'), provider.name);
      assert.equal(new URL(provider.frameOrigin).pathname, '/', provider.name);
    }
    assert.ok(SBNET_FRAME_ORIGIN.startsWith('https://'));
  });

  it('has unique provider names', () => {
    const names = PROVIDERS.map((p) => p.name);
    assert.equal(new Set(names).size, names.length);
  });
});

describe('pinPremiumEmbedUrl — catalogue URLs are data, not constants', () => {
  it('accepts a normal VOE embed URL', () => {
    assert.equal(pinPremiumEmbedUrl('https://voe.sx/e/abc123'), 'https://voe.sx/e/abc123');
  });

  it('accepts Dood hosts and their subdomains', () => {
    for (const url of [
      'https://dood.watch/e/abc',
      'https://player.dood.so/e/abc',
      'https://cdn.dood.to/e/abc',
    ]) {
      assert.equal(pinPremiumEmbedUrl(url), url, url);
    }
  });

  it('rejects a protocol-relative URL', () => {
    // The shape that satisfied the old `includes('/e/')` short-circuit and was
    // returned verbatim, to be used as an iframe src and as a link href.
    assert.equal(pinPremiumEmbedUrl('//evil.example/e/x'), '');
  });

  it('rejects non-https schemes that carry a path', () => {
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'blob:https://voe.sx/1234',
      'http://voe.sx/e/abc',
    ]) {
      assert.equal(pinPremiumEmbedUrl(url), '', url);
    }
  });

  it('rejects a host merely containing an allowed host as a substring', () => {
    // `voe.sx.evil.example` must not be treated as voe.sx, and neither must a
    // lookalike hidden in a path or a query.
    for (const url of [
      'https://voe.sx.evil.example/e/x',
      'https://evil.example/voe.sx/e/x',
      'https://evil.example/?redirect=https://voe.sx/e/x',
    ]) {
      assert.equal(pinPremiumEmbedUrl(url), '', url);
    }
  });

  it('rejects a bare id or relative path rather than guessing a host', () => {
    for (const url of ['abc123', '/e/abc123', '']) {
      assert.equal(pinPremiumEmbedUrl(url), '', url);
    }
  });

  it('trims surrounding whitespace before deciding', () => {
    assert.equal(pinPremiumEmbedUrl('  https://voe.sx/e/abc  '), 'https://voe.sx/e/abc');
  });

  it('rejects a non-string input without throwing', () => {
    for (const value of [null, undefined, 42, {}, ['https://voe.sx/e/a']]) {
      assert.equal(pinPremiumEmbedUrl(value as unknown as string), '');
    }
  });

  it('accepts exactly the hosts it advertises, and no others', () => {
    for (const host of PREMIUM_EMBED_HOSTS) {
      assert.equal(pinPremiumEmbedUrl(`https://${host}/e/x`), `https://${host}/e/x`);
    }
    assert.equal(pinPremiumEmbedUrl('https://frembed.surf/e/x'), '');
  });
});
