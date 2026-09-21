/**
 * Player state machine: the selection invariant and the phase transitions.
 *
 * Run: node --import tsx --test tests/playerState.test.ts
 */

import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {STORABLE_SERVERS} from '../lib/providers';
import {
  createInitialPlayerState,
  isHardFailure,
  playerReducer,
  resolveStoredProvider,
  type PlayerAction,
  type PlayerState,
} from '../lib/playerState';

const reduce = (state: PlayerState, ...actions: PlayerAction[]): PlayerState =>
  actions.reduce(playerReducer, state);

describe('initial state', () => {
  it('starts in LOADING on the given server, selected by default', () => {
    const state = createInitialPlayerState('Frembed');
    assert.equal(state.server, 'Frembed');
    assert.equal(state.selection, 'default');
    assert.equal(state.phase, 'LOADING');
    assert.equal(state.attempt, 0);
    assert.equal(state.playbackUnverified, false);
  });

  it('has no PLAYING phase at all', () => {
    // Playback inside a cross-origin iframe is not observable from the parent,
    // so claiming it would be a lie the UI cannot back up.
    const phases = [
      reduce(createInitialPlayerState('Frembed'), {type: 'IFRAME_LOADED'}).phase,
      reduce(createInitialPlayerState('Frembed'), {type: 'LOAD_TIMEOUT'}).phase,
      reduce(createInitialPlayerState('Frembed'), {type: 'MARK_UNAVAILABLE'}).phase,
    ];
    assert.ok(!phases.includes('PLAYING' as never));
  });
});

describe('THE INVARIANT — a manual choice survives a late automatic result', () => {
  it('ignores an automatic selection that arrives after a manual one', () => {
    const state = reduce(
      // Any selectable source will do: this test is about the ORDER the three
      // actions are applied in, not about which provider is named. It used to
      // read DEFAULT_PROVIDER_NAME, a constant removed on 2026-09-21 because the
      // default is per content class now.
      createInitialPlayerState(STORABLE_SERVERS[0]),
      {type: 'SELECT_AUTO', server: 'VidLink'},
      {type: 'SELECT_MANUAL', server: 'VidSrc.to'},
      // A real provider, and one that is never chosen automatically — the point
      // is only that the name differs from the manual choice. It used to be
      // SuperEmbed, which no longer exists.
      {type: 'SELECT_AUTO', server: '2Embed'},
    );
    assert.equal(state.server, 'VidSrc.to');
    assert.equal(state.selection, 'manual');
  });

  it('does not even remount the iframe when the automatic result is discarded', () => {
    const afterManual = reduce(createInitialPlayerState('Frembed'), {
      type: 'SELECT_MANUAL',
      server: 'VidSrc.to',
    });
    const afterLateAuto = reduce(afterManual, {type: 'SELECT_AUTO', server: 'VidLink'});
    assert.equal(afterLateAuto, afterManual, 'state must be returned untouched');
  });

  it('survives an automatic result naming the same server as the manual choice', () => {
    const afterManual = reduce(createInitialPlayerState('Frembed'), {
      type: 'SELECT_MANUAL',
      server: 'VidSrc.to',
    });
    assert.equal(reduce(afterManual, {type: 'SELECT_AUTO', server: 'VidSrc.to'}), afterManual);
  });

  it('still allows automatic selection while nothing has been chosen by hand', () => {
    const state = reduce(createInitialPlayerState('Frembed'), {
      type: 'SELECT_AUTO',
      server: 'VidLink',
    });
    assert.equal(state.server, 'VidLink');
    assert.equal(state.selection, 'auto');
  });

  it('lets a later manual choice override an automatic one', () => {
    const state = reduce(
      createInitialPlayerState('Frembed'),
      {type: 'SELECT_AUTO', server: 'VidLink'},
      {type: 'SELECT_MANUAL', server: 'SmashyStream'},
      {type: 'SELECT_MANUAL', server: 'VidSrc.me'},
    );
    assert.equal(state.server, 'VidSrc.me');
    assert.equal(state.selection, 'manual');
  });

  it('remounts when the user picks a different server manually', () => {
    const before = reduce(createInitialPlayerState('Frembed'), {
      type: 'SELECT_MANUAL',
      server: 'VidLink',
    });
    const after = reduce(before, {type: 'SELECT_MANUAL', server: 'VidSrc.to'});
    assert.equal(after.attempt, before.attempt + 1);
    assert.equal(after.phase, 'LOADING');
  });
});

describe('phase transitions prove only what is observable', () => {
  it('goes LOADING -> IFRAME_LOADED_PLAYBACK_UNKNOWN on load', () => {
    const state = reduce(createInitialPlayerState('Frembed'), {type: 'IFRAME_LOADED'});
    assert.equal(state.phase, 'IFRAME_LOADED_PLAYBACK_UNKNOWN');
  });

  it('never reports a load failure after the document already loaded', () => {
    // The load timeout fires on a slow connection; if the iframe has loaded in
    // the meantime, declaring failure would be wrong and would tear down a
    // player that is working.
    const loaded = reduce(
      createInitialPlayerState('Frembed'),
      {type: 'IFRAME_LOADED'},
      {type: 'LOAD_TIMEOUT'},
    );
    assert.equal(loaded.phase, 'IFRAME_LOADED_PLAYBACK_UNKNOWN');
  });

  it('reports a load failure when nothing ever loaded', () => {
    const state = reduce(createInitialPlayerState('Frembed'), {type: 'LOAD_TIMEOUT'});
    assert.equal(state.phase, 'LOAD_FAILED');
    assert.equal(isHardFailure(state.phase), true);
  });

  it('ignores a duplicate load event', () => {
    const once = reduce(createInitialPlayerState('Frembed'), {type: 'IFRAME_LOADED'});
    assert.equal(reduce(once, {type: 'IFRAME_LOADED'}), once);
  });

  it('flags unverified playback only from the loaded-but-unknown phase', () => {
    const stillLoading = reduce(createInitialPlayerState('Frembed'), {
      type: 'PLAYBACK_UNVERIFIED_TIMEOUT',
    });
    assert.equal(stillLoading.playbackUnverified, false, 'nothing loaded yet');

    const loaded = reduce(
      createInitialPlayerState('Frembed'),
      {type: 'IFRAME_LOADED'},
      {type: 'PLAYBACK_UNVERIFIED_TIMEOUT'},
    );
    assert.equal(loaded.phase, 'IFRAME_LOADED_PLAYBACK_UNKNOWN');
    assert.equal(loaded.playbackUnverified, true);

    // Idempotent: re-firing the timer must not churn state.
    assert.equal(reduce(loaded, {type: 'PLAYBACK_UNVERIFIED_TIMEOUT'}), loaded);
  });

  it('keeps the player mounted when playback is unverified', () => {
    // The notice is advisory. The phase must stay non-failing so the iframe is
    // not replaced by an error panel while it may well be playing.
    const state = reduce(
      createInitialPlayerState('Frembed'),
      {type: 'IFRAME_LOADED'},
      {type: 'PLAYBACK_UNVERIFIED_TIMEOUT'},
    );
    assert.equal(isHardFailure(state.phase), false);
  });

  it('recovers from a failure on RETRY, clearing the unverified flag', () => {
    const state = reduce(
      createInitialPlayerState('Frembed'),
      {type: 'IFRAME_LOADED'},
      {type: 'PLAYBACK_UNVERIFIED_TIMEOUT'},
      {type: 'MARK_UNAVAILABLE'},
      {type: 'RETRY'},
    );
    assert.equal(state.phase, 'LOADING');
    assert.equal(state.playbackUnverified, false);
    assert.equal(state.attempt, 1);
    assert.equal(state.server, 'Frembed', 'retry keeps the same server');
  });

  it('marks unavailable as a hard failure', () => {
    const state = reduce(createInitialPlayerState('Frembed'), {type: 'MARK_UNAVAILABLE'});
    assert.equal(isHardFailure(state.phase), true);
  });

  it('is idempotent when unavailable, so a repeated dispatch cannot loop', () => {
    // The component derives "unavailable" from a missing URL, which stays
    // missing across renders, so this action can be dispatched on every pass.
    // Returning the same object is what keeps that from re-rendering forever.
    const unavailable = reduce(createInitialPlayerState('Frembed'), {type: 'MARK_UNAVAILABLE'});
    const again = playerReducer(unavailable, {type: 'MARK_UNAVAILABLE'});
    assert.equal(again, unavailable, 'same object identity, not a fresh copy');
  });

  it('does not disturb the selected server or the attempt count', () => {
    const manual = reduce(
      createInitialPlayerState('Frembed'),
      {type: 'SELECT_MANUAL', server: 'VidLink'},
    );
    const unavailable = playerReducer(manual, {type: 'MARK_UNAVAILABLE'});
    assert.equal(unavailable.server, 'VidLink');
    assert.equal(unavailable.selection, 'manual');
    assert.equal(unavailable.attempt, manual.attempt);
  });

  it('only treats LOAD_FAILED and UNAVAILABLE as hard failures', () => {
    assert.equal(isHardFailure('LOADING'), false);
    assert.equal(isHardFailure('IFRAME_LOADED_PLAYBACK_UNKNOWN'), false);
    assert.equal(isHardFailure('LOAD_FAILED'), true);
    assert.equal(isHardFailure('UNAVAILABLE'), true);
  });
});

describe('stored provider validation', () => {
  it('accepts a known server', () => {
    assert.deepEqual(resolveStoredProvider('VidLink', STORABLE_SERVERS, 'Frembed'), {
      server: 'VidLink',
      invalid: false,
    });
  });

  it('falls back when nothing is stored', () => {
    for (const stored of [null, undefined, '', '   ']) {
      assert.deepEqual(resolveStoredProvider(stored, STORABLE_SERVERS, 'Frembed'), {
        server: 'Frembed',
        invalid: false,
      });
    }
  });

  it('falls back AND reports invalid for an unknown stored server', () => {
    // Regression: an unchecked stored value produced a blank player, because
    // the unknown name matched no provider and no fallback was applied.
    for (const stored of ['Old Removed Server', 'Frembed.work', 'frembed', 'Legacy HD']) {
      const result = resolveStoredProvider(stored, STORABLE_SERVERS, 'Frembed');
      assert.equal(result.server, 'Frembed', `${stored} must not be used`);
      assert.equal(result.invalid, true, `${stored} must be reported as invalid`);
    }
  });

  it('tolerates surrounding whitespace around a valid server', () => {
    assert.deepEqual(resolveStoredProvider('  VidLink  ', STORABLE_SERVERS, 'Frembed'), {
      server: 'VidLink',
      invalid: false,
    });
  });

  it('does not let whitespace smuggle an unknown server through', () => {
    const result = resolveStoredProvider('  Bogus  ', STORABLE_SERVERS, 'Frembed');
    assert.equal(result.server, 'Frembed');
    assert.equal(result.invalid, true);
  });

  it('rejects a non-string stored value', () => {
    const result = resolveStoredProvider({} as unknown as string, STORABLE_SERVERS, 'Frembed');
    assert.equal(result.server, 'Frembed');
    assert.equal(result.invalid, false);
  });

  it('returns a fallback that is itself in the known list', () => {
    // About this function's OUTPUT, not about a named constant: whatever
    // fallback it is handed, it must hand back something the player can select,
    // because the caller puts that value straight into the iframe src.
    //
    // This used to assert that DEFAULT_PROVIDER_NAME was in STORABLE_SERVERS,
    // which tested the constant rather than the behaviour. The constant was
    // removed on 2026-09-21 and the per-content-class default is asserted in
    // tests/playerStrategy.test.ts.
    const result = resolveStoredProvider('MOVEO PREMIUM', STORABLE_SERVERS, 'Frembed');
    assert.equal(result.server, 'Frembed');
    assert.equal(result.invalid, true);
    assert.ok(STORABLE_SERVERS.includes(result.server));
  });
});

describe('why the component needs an explicit recovery from UNAVAILABLE', () => {
  it('a late automatic result for the ALREADY SELECTED server is a no-op, even from a failed phase', () => {
    // This interaction was a real defect: the catalogue lookup can outlast
    // SOURCE_RESOLVE_CAP_MS, UNAVAILABLE is declared at the cap, and the incoming
    // SELECT_AUTO then names the server already active — so the reducer returns
    // the state untouched and the phase stays terminal while a working URL
    // exists. The component recovers with an explicit RETRY effect rather than
    // relying on this dispatch, and this test is the reason that effect exists.
    const stale = reduce(
      createInitialPlayerState('MOVEO PREMIUM'),
      {type: 'SELECT_AUTO', server: 'MOVEO PREMIUM'},
      {type: 'MARK_UNAVAILABLE'},
    );
    assert.equal(stale.phase, 'UNAVAILABLE');
    assert.equal(
      playerReducer(stale, {type: 'SELECT_AUTO', server: 'MOVEO PREMIUM'}),
      stale,
      'the reducer cannot rescue this case; recovery must be explicit',
    );
  });

  it('and RETRY is what actually brings it back, keeping the same server', () => {
    const stale = reduce(createInitialPlayerState('MOVEO PREMIUM'), {type: 'MARK_UNAVAILABLE'});
    const recovered = playerReducer(stale, {type: 'RETRY'});
    assert.equal(recovered.phase, 'LOADING');
    assert.equal(recovered.server, 'MOVEO PREMIUM');
    assert.equal(isHardFailure(recovered.phase), false);
    assert.equal(recovered.playbackUnverified, false);
  });
});
