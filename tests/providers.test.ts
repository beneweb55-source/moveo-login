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

  it('carries TMDB season 0 (specials) through instead of rewriting it to season 1', () => {
    // Regression, measured 2026-09-21. Season and episode shared ONE normaliser
    // that required `n > 0`, so season 0 — which is how TMDB represents SPECIALS —
    // was silently rewritten to season 1. A user who picked "Hors-série → E1" on
    // the TV page was served S1E1: the wrong episode, but a plausible-looking one,
    // so nothing in the UI signalled the substitution.
    //
    // The season-0 grammar is real, not hypothetical. Against the SmashyStream
    // successor, measured on Breaking Bad (TMDB 1396):
    //   /embed/tmdb-tv-1396-1-1 -> "Breaking Bad - Pilot"
    //   /embed/tmdb-tv-1396-0-1 -> "Breaking Bad - Good Cop / Bad Cop"
    // and "Good Cop / Bad Cop" IS that show's season-0 episode 1, so the provider
    // understood 0 and resolved the correct special.
    assert.equal(
      buildProviderUrl('Frembed', {type: 'tv', id: '1396', season: 0, episode: 1}),
      'https://frembed.surf/embed/serie/1396?id=1396&sa=0&epi=1',
    );
  });

  it('does not collapse season 0 onto season 1 for ANY provider', () => {
    // Asserted as a difference rather than by pattern-matching a "0" in the URL:
    // each provider spells season differently (`sa=`, `s=`, `/0/`, `-0-`), and a
    // regex over the whole URL could match an unrelated digit and pass for the
    // wrong reason. Two URLs that differ can only differ because the season
    // survived.
    for (const provider of PROVIDERS) {
      const specials = buildProviderUrl(provider.name, {
        type: 'tv',
        id: '1396',
        season: 0,
        episode: 1,
      });
      const firstSeason = buildProviderUrl(provider.name, {
        type: 'tv',
        id: '1396',
        season: 1,
        episode: 1,
      });
      assert.ok(specials, `${provider.name} produced no specials URL`);
      assert.notEqual(
        specials,
        firstSeason,
        `${provider.name} rewrote season 0 as season 1: ${specials}`,
      );
    }
  });

  it('still coerces a genuinely invalid season to 1', () => {
    // The fallback still has to work — the point of the fix is that 0 is a VALID
    // season number, not that validation was dropped.
    for (const bad of [-3, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const url = buildProviderUrl('Frembed', {
        type: 'tv',
        id: '1396',
        season: bad as number,
        episode: 1,
      });
      assert.equal(url, 'https://frembed.surf/embed/serie/1396?id=1396&sa=1&epi=1');
    }
  });

  it('coerces episode 0 to 1, because episodes are 1-based', () => {
    // Episodes are NOT seasons: 0 is not a valid episode number in TMDB, so the
    // two must not share a normaliser.
    const url = buildProviderUrl('Frembed', {
      type: 'tv',
      id: '1396',
      season: 1,
      episode: 0,
    });
    assert.equal(url, 'https://frembed.surf/embed/serie/1396?id=1396&sa=1&epi=1');
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
      // Host moved 2026-09-21. The grammar is the provider's own translation of
      // the paths this entry used to build — see lib/providers.ts:
      //   GET https://player.smashystream.com/tv/1396?s=1&e=1
      //     -> 301 -> https://anyembed.xyz/embed/tmdb-tv-1396-1-1
      movie: 'https://anyembed.xyz/embed/tmdb-movie-550',
      tv: 'https://anyembed.xyz/embed/tmdb-tv-1396-1-1',
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

  it('builds every URL on that provider own declared entry origin', () => {
    // frameOrigins[0] is the ENTRY origin — the origin of the URL buildUrl()
    // produces. Later entries are redirect targets the provider chooses, so a
    // generated URL can never legitimately sit on one of those.
    for (const provider of PROVIDERS) {
      const url = buildProviderUrl(provider.name, MOVIE);
      assert.ok(url);
      assert.equal(
        new URL(url).origin,
        provider.frameOrigins[0],
        `${provider.name} frames a different origin than it declares`,
      );
      assert.ok(
        !provider.frameOrigins.slice(1).includes(new URL(url).origin),
        `${provider.name} generates a URL on one of its redirect targets`,
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
    // Regression: the premium (VOE / Dood) tier was removed from the product,
    // so a value it left behind in localStorage must NOT be treated as
    // selectable — otherwise a user who last chose it is restored onto a server
    // that no longer exists. resolveStoredProvider maps it to the default.
    assert.equal(
      isStorableServer('MOVEO PREMIUM'),
      false,
      'the removed premium server must not be restorable',
    );
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
    // Applies to every hop, not just the entry: a redirect target is matched by
    // the browser as an origin, so a value carrying a path would be a config
    // mistake that silently fails to match anything.
    for (const provider of PROVIDERS) {
      assert.ok(provider.frameOrigins.length > 0, `${provider.name} declares no origin at all`);
      for (const origin of provider.frameOrigins) {
        assert.ok(origin.startsWith('https://'), `${provider.name}: ${origin}`);
        assert.equal(new URL(origin).pathname, '/', `${provider.name}: ${origin}`);
      }
      assert.equal(
        new Set(provider.frameOrigins).size,
        provider.frameOrigins.length,
        `${provider.name} lists the same origin twice`,
      );
    }
    assert.ok(SBNET_FRAME_ORIGIN.startsWith('https://'));
  });

  it('has unique provider names', () => {
    const names = PROVIDERS.map((p) => p.name);
    assert.equal(new Set(names).size, names.length);
  });

  it('declares an icon key the UI can resolve, for every provider', () => {
    // Provider identity must live in the registry, not in a second map inside the
    // component keyed by display name — which is where it used to live, and where
    // a renamed provider kept a stale icon with nothing to detect it.
    for (const provider of PROVIDERS) {
      assert.ok(
        ['globe', 'server', 'zap'].includes(provider.iconKey),
        `${provider.name} declares an unresolvable iconKey: ${provider.iconKey}`,
      );
    }
  });

  it('states every capability dimension explicitly, measured or unknown', () => {
    // The values are the point: "unknown" is a legitimate answer, and a MISSING
    // key is not, because an absent key reads as "no" and would turn a gap in the
    // review into a false claim about the provider.
    const dimensions = [
      'playbackObserved',
      'specials',
      'subtitles',
      'adultAdvertising',
      'mobile',
    ] as const;
    for (const provider of PROVIDERS) {
      for (const dimension of dimensions) {
        assert.ok(
          ['yes', 'no', 'unknown'].includes(provider.capabilities[dimension]),
          `${provider.name}.capabilities.${dimension} is not a measured value`,
        );
      }
    }
  });

  it('claims observed playback only where it was measured on the media element', () => {
    // Guards the honesty rule rather than the code: a provider may only claim
    // playback where a media element was read directly (readyState 4, advancing
    // currentTime, non-zero video dimensions). Everything else must stay
    // "unknown" — these players fetch through MSE, so a missing media request in
    // the network log is NOT evidence of absence.
    const confirmed = PROVIDERS.filter((p) => p.capabilities.playbackObserved === 'yes').map(
      (p) => p.name,
    );
    assert.deepEqual(
      confirmed.sort(),
      ['SmashyStream', 'VidLink'],
      'playback may only be claimed for providers measured on the media element',
    );
  });
});

/**
 * The premium (VOE / Dood) tier used to have its own suite here, guarding
 * `pinPremiumEmbedUrl` — the gate that decided which catalogue URLs could reach
 * an iframe src or a link href. That function, its host list and the catalogue
 * lookup that fed it were all removed together: the tier is not supported, and
 * the URLs it stored were measured dead on production (voe.sx answered 404).
 *
 * The guards that still matter are kept, because they are about the REMOVAL
 * holding rather than about the deleted code:
 *   - the server cannot be restored from localStorage (see the storable-servers
 *     test above);
 *   - the hosts cannot be framed, because they are no longer in `frame-src`
 *     (see the dead-origins test in tests/csp.test.ts).
 * The lesson the deleted suite encoded still applies to every surviving
 * provider: a value that came from a scrape is DATA, so it must be validated
 * against an allowlist before it reaches a sink, and it must fail closed.
 */
