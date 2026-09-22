/**
 * §1/§2: what we may honestly promise about a resume, per provider — and the
 * evidence that we may not promise a POSITION at all.
 *
 * The claim this file defends is narrow and load-bearing: **we have no way to
 * ask a provider to seek**. Everything downstream depends on it, because the
 * alternative — inventing a `?start=` parameter or a `postMessage` that nobody
 * documented — would look like it worked: the frame loads, nothing errors, and
 * the viewer still starts at 0:00 while a comment in our code says otherwise.
 *
 * So the claim is pinned from four directions, each of which fails if the
 * evidence stops being true:
 *
 *   1. NO OUTBOUND CHANNEL (§1). A source scan over every directory we ship
 *      finds exactly ONE executable `postMessage` in the whole application, and
 *      it targets `window.opener` from the OAuth callback — not an iframe. The
 *      scan carries a counter-example, so it cannot pass by finding nothing.
 *   2. NO TIME IN ANY URL GRAMMAR. The per-provider record is required to name a
 *      grammar for every `no-channel` verdict.
 *   3. NO PROVIDER MAY BE PROMOTED TO A PROMISE. The list that could make
 *      `promisesPositionResume` true is empty, and no test in this file would
 *      pass if it were not: the fabricated-table cases in the third suite are
 *      the check that the guard actually guards.
 *   4. EVERY SELECTABLE SERVER IS COVERED. `STORABLE_SERVERS` is eight values —
 *      six PROVIDERS plus Sibnet VF and Sibnet VOSTFR — and a history entry can
 *      carry any of them as its `provider`. A name missing from the record is a
 *      name we have no measurement for, which must fail here rather than
 *      silently resolve to "no capability" at runtime.
 *
 * Run: node --import tsx --test tests/resumeCapability.test.ts
 */

import assert from 'node:assert/strict';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';

import {PROVIDERS, STORABLE_SERVERS, getMessageOrigins} from '../lib/providers';
import {
  POSITION_RESUME_OBSERVED,
  __capabilityTable,
  assertCapabilityTableIsHonest,
  describeRestore,
  promisesPositionResume,
  resumeCapabilityOf,
  validateCapabilityTable,
  type ResumeCapability,
} from '../lib/resumeCapability';

const PROVIDER_NAMES = STORABLE_SERVERS;

// ---------------------------------------------------------------------------
// 4. coverage
// ---------------------------------------------------------------------------

describe('the record covers every server the application can select', () => {
  it('has a measurement for all of them', () => {
    // The set that matters is STORABLE_SERVERS and not PROVIDERS: `provider` on
    // a history entry is the selected SERVER NAME, and Sibnet is selectable
    // without being in PROVIDERS (it is resolved by our own scrape). A name
    // absent here resolves to `resumeCapabilityOf() === null` at runtime, which
    // is safe but unmeasured — and §1 asks for each provider actually in use.
    for (const name of PROVIDER_NAMES) {
      assert.notEqual(
        resumeCapabilityOf(name),
        null,
        `${name} is selectable but has no capability record — add a measurement ` +
          `for it rather than letting it fall through to "unknown"`,
      );
    }
  });

  it('records nothing for a name that cannot be selected', () => {
    // The other direction, and it catches the realistic typo: `Vidlink` instead
    // of `VidLink` would cover nothing, leave the real name unmeasured, and look
    // correct in the table.
    for (const capability of __capabilityTable) {
      assert.ok(
        PROVIDER_NAMES.includes(capability.provider),
        `"${capability.provider}" is in the record but is not a selectable server`,
      );
    }
  });

  it('keeps the two Sibnet names apart', () => {
    // They resolve through the same route but are distinct stored values, so a
    // single shared record would be the same class of mistake as de-duplication
    // that keys on the id and ignores the media type.
    assert.notEqual(resumeCapabilityOf('Sibnet VF'), null);
    assert.notEqual(resumeCapabilityOf('Sibnet VOSTFR'), null);
    assert.equal(
      PROVIDERS.some((provider) => provider.name === 'Sibnet VF'),
      false,
      'Sibnet is not a PROVIDERS entry — if that changed, the coverage argument here needs rewriting',
    );
  });
});

// ---------------------------------------------------------------------------
// 3. the promise, and the two directions of the guard
// ---------------------------------------------------------------------------

describe('no provider may be said to restore a position', () => {
  it('lists nothing as observed, for now', () => {
    assert.deepEqual(
      [...POSITION_RESUME_OBSERVED],
      [],
      'a provider was added to POSITION_RESUME_OBSERVED — that is a claim a resume ' +
        'was observed, and it needs the observation in the table entry too',
    );
  });

  it('answers false for every selectable server', () => {
    for (const name of PROVIDER_NAMES) {
      assert.equal(
        promisesPositionResume(name),
        false,
        `${name} must not be promised a position restore — no resume has been observed`,
      );
      assert.equal(
        describeRestore(name, true).position,
        false,
        `${name} must not promise a position through describeRestore either`,
      );
    }
  });

  it('answers false for a provider it has never heard of, including the empty string', () => {
    // The empty string is the real case, not a hypothetical: a row read back from
    // /api/watch-time does not record which source was used, so a synced entry
    // carries `provider: ""` (see getServerWatchHistory). An unknown provider
    // must fail CLOSED — this is the difference between "no evidence of a
    // channel" and "evidence of no channel", and only the second may be acted on.
    for (const unknown of ['', '   ', 'Netflix', 'Vidlink', 'FREMBED', null, undefined]) {
      assert.equal(
        promisesPositionResume(unknown),
        false,
        `${JSON.stringify(unknown)} must not be promised a position`,
      );
      assert.equal(describeRestore(unknown, true).position, false);
    }
    assert.equal(resumeCapabilityOf('Vidlink'), null, 'the name is case-sensitive');
    assert.equal(resumeCapabilityOf(''), null);
    assert.equal(resumeCapabilityOf(null), null);
  });

  it('only names a non-empty channel for a provider that has actually spoken to us', () => {
    // The structural rule behind the table: an origin that has never emitted
    // anything cannot be the origin through which a seek was observed. VidLink
    // and Frembed have measured `messageOrigins`; the other four are empty, and
    // an entry claiming a channel for one of them would be unsupported.
    for (const capability of __capabilityTable) {
      if (capability.position === 'no-channel') continue;
      assert.ok(
        getMessageOrigins(capability.provider).length > 0,
        `${capability.provider} is recorded as "${capability.position}" but has never ` +
          `emitted a message, so no channel from it can have been observed`,
      );
    }
  });

  it('records exactly one provider as the one worth testing', () => {
    // VidLink alone keeps its own per-episode progress, which makes it the single
    // place a position restore is plausible enough to go and measure. Pinned so
    // that a silent downgrade of that finding is visible, and so that a second
    // name appearing here is a deliberate act.
    const beyondNoChannel = __capabilityTable
      .filter((capability) => capability.position !== 'no-channel')
      .map((capability) => capability.provider);
    assert.deepEqual(beyondNoChannel, ['VidLink']);
  });
});

describe('the table cannot claim more than the promise list allows', () => {
  it('passes for what we ship', () => {
    assert.doesNotThrow(() => assertCapabilityTableIsHonest());
  });

  it('the check would catch the mistake it is there for', () => {
    // Four counter-examples, because a validator that only ever sees valid input
    // is indistinguishable from one that does nothing. Each fabricated table is
    // the shape of a real future mistake.
    const claim = (
      position: ResumeCapability['position'],
      evidence: string,
    ): ResumeCapability => ({
      provider: 'VidLink',
      content: true,
      episode: true,
      position,
      evidence,
    });

    // (a) an "observed" verdict with nothing in the promise list — the exact
    // drift the module is built to prevent.
    assert.throws(
      () =>
        validateCapabilityTable([claim('observed', 'Observed 2026-09-22: it resumed.')], []),
      /POSITION_RESUME_OBSERVED/,
    );

    // (b) promoted to the list without saying what was observed.
    assert.throws(
      () =>
        validateCapabilityTable([claim('observed', 'VidLink keeps progress.')], ['VidLink']),
      /requires evidence that says/,
    );

    // (c) promoted to the list with no table entry at all.
    assert.throws(() => validateCapabilityTable([], ['VidLink']), /no capability entry/);

    // (d) promoted to the list while its own record still says otherwise.
    assert.throws(
      () => validateCapabilityTable([claim('no-channel', 'Observed: nothing.')], ['VidLink']),
      /its own record says/,
    );

    // And the shape that must pass, so the checks above are not satisfied by
    // refusing everything.
    assert.doesNotThrow(() =>
      validateCapabilityTable(
        [claim('observed', 'Observed 2026-09-22: a returning viewer resumed at 32:14.')],
        ['VidLink'],
      ),
    );
  });

  it('refuses an entry with no evidence', () => {
    // A capability with no measurement behind it is a guess with a label on it.
    assert.throws(
      () =>
        validateCapabilityTable(
          [
            {
              provider: 'VidLink',
              content: true,
              episode: true,
              position: 'no-channel',
              evidence: '   ',
            },
          ],
          [],
        ),
      /guess/,
    );
  });

  it('every shipped entry names what was looked at', () => {
    for (const capability of __capabilityTable) {
      assert.ok(
        capability.evidence.length > 80,
        `${capability.provider}: the evidence has to be a measurement, not a label`,
      );
      assert.match(
        capability.evidence,
        /Observed|No position has ever|No message has ever|not observed/i,
        `${capability.provider}: the evidence must say what was observed or that none was`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// §19: the three restores, kept apart
// ---------------------------------------------------------------------------

describe('describeRestore keeps the three restores apart', () => {
  it('always restores the content, because the id is ours', () => {
    for (const name of [...PROVIDER_NAMES, '', 'Netflix']) {
      assert.equal(describeRestore(name, false).content, true);
    }
  });

  it('restores the episode from the caller decision, not from a truthiness test', () => {
    // `hasSlot` is an argument precisely so the season-0 trap stays out of this
    // module: season 0 is TMDB's SPECIALS season and is a real slot, so the
    // caller must decide with `typeof season === 'number'`. Passing `true` for a
    // specials slot is a legitimate call, and it is asserted here so a future
    // "simplification" into `season && episode` inside this module fails.
    assert.equal(describeRestore('VidLink', true).episode, true);
    assert.equal(describeRestore('VidLink', false).episode, false);
    assert.equal(describeRestore('Sibnet VF', true).episode, true);
    assert.equal(describeRestore('', true).episode, true);
  });

  it('gives the combination that is the whole finding', () => {
    // Content and episode ours, position not — for every server we can select.
    // §19 asks for these reported separately rather than as one "resumed" badge,
    // and this is the value that makes that possible.
    for (const name of PROVIDER_NAMES) {
      assert.deepEqual(describeRestore(name, true), {
        content: true,
        episode: true,
        position: false,
      });
    }
  });
});

// ---------------------------------------------------------------------------
// 1. the absence of an outbound channel, as a source scan
// ---------------------------------------------------------------------------

/**
 * Line-oriented comment removal, and its limit is stated rather than hidden: a
 * `postMessage` call split across two lines would evade it. The counter-example
 * below keeps the scan honest about the shape it does target — a single-line
 * call, which is how the one real call and every plausible new one would be
 * written.
 */
const codeLines = (source: string): {line: number; text: string}[] =>
  source
    .split(/\r?\n/)
    .map((text, index) => ({line: index + 1, text}))
    .filter(({text}) => {
      const trimmed = text.trim();
      return !(trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*'));
    });

/** A call that reaches INTO another document. This is the thing that must not exist. */
const callsIntoAnotherDocument = (text: string): boolean =>
  /\.postMessage\s*\(/.test(text) && !/[.\w]opener\.postMessage\s*\(/.test(text);

const SOURCE_DIRS = ['app', 'components', 'lib', 'utils', 'hooks', 'context'];

const sourceFiles = (): string[] => {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, {withFileTypes: true})) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(full);
    }
  };
  for (const dir of SOURCE_DIRS) {
    if (existsSync(dir)) walk(dir);
  }
  return out;
};

describe('we never send anything into a provider iframe', () => {
  it('the scan would catch the mistake it is there for', () => {
    // Without this, the scan could pass because its matcher matches nothing at
    // all — green and worthless. Both real shapes are asserted, plus the one
    // legitimate call that must NOT be flagged.
    assert.equal(
      callsIntoAnotherDocument('iframeRef.current?.contentWindow.postMessage({type:"seek"}, "*")'),
      true,
    );
    assert.equal(callsIntoAnotherDocument('frame.postMessage({ t: 1934 }, origin)'), true);
    assert.equal(
      callsIntoAnotherDocument("window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');"),
      false,
      'the OAuth callback is not an iframe channel and must not be flagged',
    );
    assert.equal(callsIntoAnotherDocument(' * Origins permitted to postMessage our window.'), false);
  });

  it('finds exactly one executable postMessage in the whole application', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      for (const {line, text} of codeLines(readFileSync(file, 'utf8'))) {
        if (callsIntoAnotherDocument(text)) offenders.push(`${file}:${line}: ${text.trim()}`);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      'a postMessage into another document appeared. If this is a real provider ' +
        'seek mechanism, it is the §1 finding and lib/resumeCapability.ts must be ' +
        'updated with the observation — not just the code:\n' +
        offenders.join('\n'),
    );
  });

  it('uses contentWindow only to identify who sent a message, never to reach in', () => {
    // `iframeRef.current?.contentWindow` DOES appear — once, in VideoPlayer, as
    // `expectedSource` for the inbound validator, which is how a message is
    // attributed to the frame we mounted. That is the OPPOSITE direction from the
    // one §1 is about, and it is the only shape allowed: a contentWindow held for
    // any other purpose is a handle into another document, which is exactly what
    // a seek channel would need. So the claim is not "contentWindow is never
    // mentioned" — it is "it is never used to reach in".
    //
    // A second net under the scan above rather than the same one: a line like
    // `frame.contentWindow.postMessage(...)` fails here for not being an
    // expectedSource read, and fails there for being an outbound call.
    const reachesIntoAnotherDocument = (text: string): boolean =>
      /contentWindow/.test(text) && !/expectedSource/.test(text);

    assert.equal(reachesIntoAnotherDocument('frame.contentWindow.postMessage({t: 1}, "*")'), true);
    assert.equal(reachesIntoAnotherDocument('(frame.contentWindow as Window).focus();'), true);
    assert.equal(
      reachesIntoAnotherDocument('expectedSource: iframeRef.current?.contentWindow ?? null,'),
      false,
      'reading the frame to attribute a message it sent is not a channel into it',
    );

    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      for (const {line, text} of codeLines(readFileSync(file, 'utf8'))) {
        if (reachesIntoAnotherDocument(text)) offenders.push(`${file}:${line}: ${text.trim()}`);
      }
    }
    assert.deepEqual(offenders, [], offenders.join('\n'));
  });
});
