/**
 * The player strategy: which kind of content a title is, and therefore which
 * source a viewer is offered first.
 *
 * These are contract tests over pure functions. They do NOT claim anything about
 * how a provider behaves — that is measured, and it lives in lib/providers.ts
 * and docs/player-strategy.md. What is asserted here is that the CODE obeys the
 * decisions those measurements produced, and that it cannot quietly stop doing
 * so.
 *
 * The two properties worth stating up front, because both are invariants rather
 * than examples:
 *
 *   1. Every name the strategy can offer must be storable (present in
 *      STORABLE_SERVERS). The player persists a manual choice and validates it
 *      with isStorableServer on the way back in, so a recommended source that is
 *      not storable would be a button that does nothing when clicked, or a
 *      selection silently discarded on the next load.
 *   2. Nothing the user can click may be unreachable. The offered list must
 *      contain every provider in the registry exactly once — a provider dropped
 *      from the strategy would vanish from the UI with no other symptom.
 *
 * Run: node --import tsx --test tests/playerStrategy.test.ts
 */

import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {PROVIDERS, STORABLE_SERVERS} from '../lib/providers';
import * as providersRegistry from '../lib/providers';
import {
  ANIMATION_GENRE_ID,
  SPECIALS_CAPABLE,
  defaultProviderName,
  deriveContentClass,
  isAutomaticProvider,
  manualOnlyProviderNames,
  nextProviderName,
  offeredProviderNames,
  providerOrder,
  roleOf,
  sibnetOrder,
  type ContentClass,
} from '../lib/playerStrategy';

const CLASSES: ContentClass[] = [
  'movie',
  'western-tv',
  'korean',
  'anime-movie',
  'anime-series',
];

const ANIMATED = [ANIMATION_GENRE_ID, 35];
const LIVE_ACTION = [18, 80];

describe('deriveContentClass', () => {
  it('reads Korean from the original language, for films and for television', () => {
    // Korean is a class in its own right because the default source differs, and
    // the difference is measured rather than stylistic.
    assert.equal(
      deriveContentClass({type: 'tv', originalLanguage: 'ko', genreIds: LIVE_ACTION}),
      'korean',
    );
    assert.equal(
      deriveContentClass({type: 'movie', originalLanguage: 'ko', genreIds: LIVE_ACTION}),
      'korean',
    );
  });

  it('needs BOTH a Japanese original language and the Animation genre to call it anime', () => {
    assert.equal(
      deriveContentClass({type: 'tv', originalLanguage: 'ja', genreIds: ANIMATED}),
      'anime-series',
    );
    assert.equal(
      deriveContentClass({type: 'movie', originalLanguage: 'ja', genreIds: ANIMATED}),
      'anime-movie',
    );
  });

  it('does not treat live-action Japanese television as anime', () => {
    // A Japanese drama is not anime, and the anime order leads with a provider
    // chosen for Japanese-audio and subtitle behaviour. Classifying on the
    // language alone would send live-action Japanese television there.
    assert.equal(
      deriveContentClass({type: 'tv', originalLanguage: 'ja', genreIds: LIVE_ACTION}),
      'western-tv',
    );
  });

  it('does not treat an English-language animation as anime', () => {
    assert.equal(
      deriveContentClass({type: 'movie', originalLanguage: 'en', genreIds: ANIMATED}),
      'movie',
    );
  });

  it('lets Korean win over anime, because a Korean animation is still Korean drama', () => {
    // Precedence, stated as its own case: the product's Korean listing excludes
    // the Animation genre, so the Korean branch is the live-action taxonomy and
    // must not be pre-empted by the anime one.
    assert.equal(
      deriveContentClass({type: 'tv', originalLanguage: 'ko', genreIds: ANIMATED}),
      'korean',
    );
  });

  it('folds case and whitespace, because TMDB and our query params do not agree', () => {
    assert.equal(deriveContentClass({type: 'tv', originalLanguage: ' KO '}), 'korean');
    assert.equal(
      deriveContentClass({type: 'tv', originalLanguage: 'JA', genreIds: ANIMATED}),
      'anime-series',
    );
  });

  it('falls back to the generic class for the media type when nothing identifies it', () => {
    // The safe direction: a wrong "korean" would send a Western film to the
    // Korean order, whereas a missing class merely leaves the generic order.
    assert.equal(deriveContentClass({type: 'movie'}), 'movie');
    assert.equal(deriveContentClass({type: 'tv'}), 'western-tv');
    assert.equal(deriveContentClass({type: 'movie', originalLanguage: ''}), 'movie');
    assert.equal(deriveContentClass({type: 'tv', originalLanguage: null}), 'western-tv');
    assert.equal(deriveContentClass({type: 'tv', genreIds: null}), 'western-tv');
  });
});

describe('providerOrder', () => {
  it('puts the measured best source first for each class', () => {
    // SmashyStream leads the Western classes on the strength of confirmed
    // in-journey playback; VidLink leads Korean and anime SERIES because the only
    // measured language evidence (original-language audio track read, subtitle
    // track selected and rendered) was recorded on those.
    assert.deepEqual(providerOrder({contentClass: 'movie'}), [
      'SmashyStream',
      'VidLink',
      'Frembed',
    ]);
    assert.deepEqual(providerOrder({contentClass: 'western-tv'}), [
      'SmashyStream',
      'VidLink',
      'Frembed',
    ]);
    assert.deepEqual(providerOrder({contentClass: 'korean'}), [
      'VidLink',
      'SmashyStream',
      'Frembed',
    ]);
    // anime MOVIE is deliberately NOT the same order as anime SERIES. VidLink was
    // primary here and failed on both films tested — one "We Couldn't Find This
    // Content", one title-matched but with no manifest ever fetched — while
    // SmashyStream played both, in a controlled comparison taken in the same
    // window with VidLink verified reachable. If someone "tidies" the two anime
    // classes into one order, this assertion is what should stop them.
    assert.deepEqual(providerOrder({contentClass: 'anime-movie'}), [
      'SmashyStream',
      'VidLink',
      'Frembed',
    ]);
    assert.deepEqual(providerOrder({contentClass: 'anime-series'}), [
      'VidLink',
      'SmashyStream',
      'Frembed',
    ]);
    assert.notDeepEqual(
      providerOrder({contentClass: 'anime-movie'}),
      providerOrder({contentClass: 'anime-series'}),
      'the two anime classes have been collapsed back into one order',
    );
  });

  it('names only providers that exist', () => {
    // A name removed from the registry must not linger here: the player would
    // render a source it cannot build a URL for.
    const known = new Set(PROVIDERS.map((provider) => provider.name));
    for (const contentClass of CLASSES) {
      for (const name of providerOrder({contentClass})) {
        assert.ok(known.has(name), `${name} is in the ${contentClass} order but not the registry`);
      }
    }
  });

  it('never chooses a manual-only provider automatically', () => {
    const manualOnly = new Set(manualOnlyProviderNames());
    assert.ok(manualOnly.size > 0, 'the manual-only set is empty, so this proves nothing');
    for (const contentClass of CLASSES) {
      for (const name of providerOrder({contentClass})) {
        assert.equal(
          manualOnly.has(name),
          false,
          `${name} is manual-only but appears in the automatic ${contentClass} order`,
        );
      }
    }
  });

  it('never repeats a provider, and never returns an empty order', () => {
    for (const contentClass of CLASSES) {
      const order = providerOrder({contentClass});
      assert.ok(order.length > 0, `${contentClass} has no automatic source at all`);
      assert.equal(new Set(order).size, order.length, `${contentClass} repeats a provider`);
    }
  });

  it('is the only place the order is written down', () => {
    // The three automatic names are shared by every class; the orders differ only
    // in position. If a class ever needed a provider the others do not have, this
    // assertion is what would notice the divergence was intentional.
    const union = new Set(CLASSES.flatMap((c) => providerOrder({contentClass: c})));
    assert.deepEqual([...union].sort(), ['Frembed', 'SmashyStream', 'VidLink']);
  });
});

describe('specials reorder the automatic list, and only reorder it', () => {
  it('promotes a provider measured to resolve TMDB season 0 correctly', () => {
    // On a special, a provider that resolves season 0 to the WRONG episode is
    // worse than one that fails: the substitution is invisible, and nothing in
    // the UI would reveal it. So the measured-correct provider goes first, even
    // where the class order puts it second.
    assert.deepEqual(providerOrder({contentClass: 'korean', specials: true}), [
      'SmashyStream',
      'VidLink',
      'Frembed',
    ]);
  });

  it('preserves the exact set of providers, so it can only reorder', () => {
    for (const contentClass of CLASSES) {
      const plain = [...providerOrder({contentClass})].sort();
      const specials = [...providerOrder({contentClass, specials: true})].sort();
      assert.deepEqual(specials, plain, `${contentClass} changed membership, not just order`);
    }
  });

  it('derives the capable set from the registry, not from a second list here', () => {
    // Measured capability belongs to the provider entry. If it were restated
    // here, the two could disagree and a provider could be promoted for a
    // property it no longer claims.
    const measured = PROVIDERS.filter((p) => p.capabilities.specials === 'yes').map((p) => p.name);
    assert.deepEqual([...SPECIALS_CAPABLE], measured);
    assert.ok(SPECIALS_CAPABLE.length > 0, 'no provider claims specials, so promotion is dead code');
  });
});

describe('roleOf', () => {
  it('assigns the role from position in the order', () => {
    assert.equal(roleOf('SmashyStream', {contentClass: 'movie'}), 'PRIMARY');
    assert.equal(roleOf('VidLink', {contentClass: 'movie'}), 'FALLBACK');
    assert.equal(roleOf('Frembed', {contentClass: 'movie'}), 'SECONDARY_FALLBACK');
    // The same provider, a different class, a different role — which is why a
    // role cannot be a field on the provider entry.
    assert.equal(roleOf('VidLink', {contentClass: 'korean'}), 'PRIMARY');
  });

  it('is MANUAL_ONLY for everything the strategy does not choose, including unknown names', () => {
    for (const contentClass of CLASSES) {
      assert.equal(roleOf('2Embed', {contentClass}), 'MANUAL_ONLY');
      assert.equal(roleOf('VidSrc.to', {contentClass}), 'MANUAL_ONLY');
      assert.equal(roleOf('VidSrc.me', {contentClass}), 'MANUAL_ONLY');
      // Not a provider at all. The safe answer, so callers need no special case.
      assert.equal(roleOf('Not A Provider', {contentClass}), 'MANUAL_ONLY');
    }
  });

  it('reports no role for the provider that was removed', () => {
    // SuperEmbed was removed for a product-safety reason (adult advertising
    // inside our own player) — see lib/providers.ts. It must not be reachable
    // automatically from any class, which is what this asserts.
    for (const contentClass of CLASSES) {
      assert.equal(roleOf('SuperEmbed', {contentClass}), 'MANUAL_ONLY');
      assert.ok(
        !providerOrder({contentClass}).includes('SuperEmbed'),
        `SuperEmbed is back in the ${contentClass} order`,
      );
    }
    assert.equal(isAutomaticProvider('SuperEmbed'), false);
  });
});

describe('defaultProviderName', () => {
  it('returns the primary source for the class', () => {
    assert.equal(defaultProviderName({contentClass: 'movie'}), 'SmashyStream');
    assert.equal(defaultProviderName({contentClass: 'western-tv'}), 'SmashyStream');
    assert.equal(defaultProviderName({contentClass: 'korean'}), 'VidLink');
    assert.equal(defaultProviderName({contentClass: 'anime-series'}), 'VidLink');
    // The reversal, pinned: a first-time visitor landing on an anime FILM is
    // handed SmashyStream, because VidLink produced no playback on either film
    // tested. Anime SERIES, one line up, still hands over VidLink.
    assert.equal(defaultProviderName({contentClass: 'anime-movie'}), 'SmashyStream');
  });

  it('is always a source the player can actually select and persist', () => {
    // This is the invariant behind the constant: a first-time visitor is handed
    // this value, and handleServerChange rejects anything not storable. A
    // recommended default that failed isStorableServer would render as a player
    // that cannot be switched away from.
    for (const contentClass of CLASSES) {
      const name = defaultProviderName({contentClass});
      assert.ok(
        STORABLE_SERVERS.includes(name),
        `${name} is the ${contentClass} default but is not storable`,
      );
      assert.equal(isAutomaticProvider(name), true, `${name} is a default but not automatic`);
    }
  });

  it('is the only place the default is written down at all', () => {
    // The registry used to export DEFAULT_PROVIDER_NAME, holding one source as
    // "the default" for every kind of content. It was removed on 2026-09-21 for
    // two measured reasons (see lib/providers.ts): the source it named was the
    // one that produced no playback and three popup tabs, and a single constant
    // cannot express "which source, for which kind of content".
    //
    // If it were reintroduced, a future change could import it and silently
    // reinstate one source for everything. This is the guard against that, and it
    // is why this test asserts the ABSENCE rather than a matching value.
    assert.equal(
      Object.prototype.hasOwnProperty.call(providersRegistry, 'DEFAULT_PROVIDER_NAME'),
      false,
      'the registry exports a single default provider again, so the default now has two sources',
    );
  });
});

describe('offeredProviderNames', () => {
  it('offers every provider exactly once, automatic ones first', () => {
    for (const contentClass of CLASSES) {
      const offered = offeredProviderNames({contentClass});
      assert.deepEqual(
        [...offered].sort(),
        PROVIDERS.map((p) => p.name).sort(),
        `${contentClass} does not offer every provider exactly once`,
      );
      // Order matters: the recommended sources come first, and the manual-only
      // ones follow. A user should meet the measured-best source before the ones
      // that have never produced observed media.
      assert.deepEqual(
        offered.slice(0, providerOrder({contentClass}).length),
        providerOrder({contentClass}),
      );
    }
  });

  it('keeps manual-only providers available rather than hiding them', () => {
    // MANUAL_ONLY means "offered, never chosen for you" — not "disabled". Each of
    // these is a legitimate thing for a user to try, so removing them from the UI
    // would be a capability regression, not a safety win.
    const offered = offeredProviderNames({contentClass: 'movie'});
    for (const name of manualOnlyProviderNames()) {
      assert.ok(offered.includes(name), `${name} is manual-only but not offered`);
    }
  });
});

describe('nextProviderName', () => {
  it('steps through the offered order', () => {
    assert.equal(nextProviderName('SmashyStream', {contentClass: 'movie'}), 'VidLink');
    assert.equal(nextProviderName('VidLink', {contentClass: 'movie'}), 'Frembed');
  });

  it('wraps, so a repeatedly clicked control always moves', () => {
    // Wrapping is correct for a MANUAL action: nothing calls this on a timer, so
    // there is no retry loop, and a user pressing "change source" repeatedly must
    // reach somewhere new every time.
    const offered = offeredProviderNames({contentClass: 'movie'});
    assert.equal(nextProviderName(offered[offered.length - 1], {contentClass: 'movie'}), offered[0]);
  });

  it('resolves a Sibnet variant to the class primary, not to a fixed provider', () => {
    // The defect this replaces: the previous code indexed the registry array and
    // fell back to its first element, so a Sibnet failure always landed on
    // Frembed — regardless of the content class or of which source was measured
    // to work. Sibnet is a real, scrape-backed source, so this path is reachable
    // in normal use.
    assert.equal(nextProviderName('Sibnet VF', {contentClass: 'movie'}), 'SmashyStream');
    assert.equal(nextProviderName('Sibnet VOSTFR', {contentClass: 'korean'}), 'VidLink');
  });

  it('resolves an unknown or stale name the same way', () => {
    assert.equal(nextProviderName('Not A Provider', {contentClass: 'korean'}), 'VidLink');
    assert.equal(nextProviderName('', {contentClass: 'movie'}), 'SmashyStream');
  });
});

describe('isAutomaticProvider', () => {
  it('is true only for the three measured sources', () => {
    assert.equal(isAutomaticProvider('SmashyStream'), true);
    assert.equal(isAutomaticProvider('VidLink'), true);
    assert.equal(isAutomaticProvider('Frembed'), true);
    for (const name of manualOnlyProviderNames()) {
      assert.equal(isAutomaticProvider(name), false, `${name} should not be automatic`);
    }
  });

  it('partitions the registry, so no provider is both or neither', () => {
    const automatic = PROVIDERS.filter((p) => isAutomaticProvider(p.name)).length;
    assert.equal(automatic + manualOnlyProviderNames().length, PROVIDERS.length);
  });
});

describe('sibnetOrder', () => {
  it('puts VF first for a French viewer and VOSTFR first for everyone else', () => {
    // VOSTFR leads otherwise because it preserves the original audio track, which
    // is the closer match to an original-version preference — not because it is
    // believed to be English.
    assert.deepEqual(sibnetOrder('fr'), ['Sibnet VF', 'Sibnet VOSTFR']);
    assert.deepEqual(sibnetOrder('en'), ['Sibnet VOSTFR', 'Sibnet VF']);
    assert.deepEqual(sibnetOrder(null), ['Sibnet VOSTFR', 'Sibnet VF']);
    assert.deepEqual(sibnetOrder(undefined), ['Sibnet VOSTFR', 'Sibnet VF']);
  });

  it('handles case and regional variants', () => {
    assert.deepEqual(sibnetOrder('FR'), ['Sibnet VF', 'Sibnet VOSTFR']);
    assert.deepEqual(sibnetOrder('fr-CA'), ['Sibnet VF', 'Sibnet VOSTFR']);
    assert.deepEqual(sibnetOrder(' fr '), ['Sibnet VF', 'Sibnet VOSTFR']);
    // Not French: must not be treated as such by a prefix match on the wrong side.
    assert.deepEqual(sibnetOrder('frr'), ['Sibnet VF', 'Sibnet VOSTFR']);
    assert.deepEqual(sibnetOrder('af'), ['Sibnet VOSTFR', 'Sibnet VF']);
  });

  it('always returns both variants, so ordering never removes an option', () => {
    for (const language of ['fr', 'en', null, undefined, 'de']) {
      assert.deepEqual([...sibnetOrder(language)].sort(), ['Sibnet VF', 'Sibnet VOSTFR']);
    }
  });
});
