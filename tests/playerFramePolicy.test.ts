/**
 * The player frame's permissions, and the two UI paths that used to bypass them.
 *
 * WHY A TEST AND NOT JUST A COMMENT. Every assertion below is a decision that can
 * be undone by adding one word to one string, and none of them fails loudly when
 * it is undone: a granted `allow-popups` produces a working player and an extra
 * tab, and a granted `allow-top-navigation` produces a working player and a page
 * the viewer loses. The first of those is exactly what the sandbox was added to
 * close, and it was measured before being closed
 * (docs/player-validation-2026-09-21.md §4.2).
 *
 * THE OTHER HALF, AND IT IS NOT DECORATION: the same attribute can break a
 * player. A sandbox that drops `allow-scripts` or `allow-same-origin`, or an
 * iframe that loses `allowFullScreen`, produces a black box — so the tokens the
 * frame KEEPS are asserted here too, with the reason each one is kept.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';

import {
  PLAYER_IFRAME_ALLOW,
  PLAYER_IFRAME_SANDBOX,
  PLAYER_SANDBOX_TOKENS,
  PLAYER_SANDBOX_WITHHELD,
} from '../lib/playerFramePolicy';

const read = (relative: string): string =>
  readFileSync(path.join(process.cwd(), relative), 'utf8');

const sandboxTokens = PLAYER_IFRAME_SANDBOX.split(/\s+/).filter(Boolean);

describe('the player frame keeps every capability that acts inside it', () => {
  it('grants scripts, its own origin, forms, casting and both locks', () => {
    // Each of these is kept for a stated reason, not by default:
    //   allow-scripts            — without it the provider's player never runs.
    //   allow-same-origin        — without it the frame posts from a null origin
    //                             and lib/providers.ts's messageOrigins allowlist
    //                             drops every measured position message.
    //   allow-forms              — a provider's own server list is a form.
    //   allow-presentation       — casting.
    //   allow-pointer-lock       — 360°/mouse-driven players.
    //   allow-orientation-lock   — mobile fullscreen orientation.
    for (const token of [
      'allow-scripts',
      'allow-same-origin',
      'allow-forms',
      'allow-presentation',
      'allow-pointer-lock',
      'allow-orientation-lock',
    ]) {
      assert.ok(
        sandboxTokens.includes(token),
        `the player frame must keep ${token}, or a capability that does not leave ` +
          `the frame is removed along with the ones that do`,
      );
    }
  });

  it('is exactly the declared list — no token is granted by accident', () => {
    assert.deepEqual(
      [...sandboxTokens].sort(),
      [...PLAYER_SANDBOX_TOKENS].sort(),
      'the sandbox string and the declared token list must not drift apart: the ' +
        'string is what the browser reads, the list is what this test checks',
    );
  });

  it('delegates the two player controls, which sandbox does not cover', () => {
    // fullscreen and picture-in-picture are Permissions Policy, not sandbox, so a
    // token list that is correct still leaves the player without its controls if
    // these are dropped.
    assert.match(PLAYER_IFRAME_ALLOW, /fullscreen/);
    assert.match(PLAYER_IFRAME_ALLOW, /picture-in-picture/);
    assert.match(PLAYER_IFRAME_ALLOW, /autoplay/);
  });

  it('still does not delegate encrypted-media', () => {
    // Not a regression guard for the sandbox: this was already withheld, because
    // no reachable player page uses EME. Widening it is a separate decision.
    assert.equal(
      /encrypted-media/.test(PLAYER_IFRAME_ALLOW),
      false,
      'encrypted-media is delegated but was never shown to be needed',
    );
  });
});

describe('the player frame loses every capability that acts outside it', () => {
  it('withholds each escape hatch, by token and as a substring', () => {
    for (const {token, reason} of PLAYER_SANDBOX_WITHHELD) {
      assert.equal(
        sandboxTokens.includes(token),
        false,
        `${token} is granted back. Why it was withheld: ${reason}`,
      );
      // The substring check is the one that catches the near-miss: "allow-popups"
      // is a prefix of "allow-popups-to-escape-sandbox", so a set check alone
      // would pass while the sandbox was reopened by the longer token.
      assert.equal(
        PLAYER_IFRAME_SANDBOX.includes(token),
        false,
        `${token} appears inside the sandbox string`,
      );
      assert.ok(
        reason.trim().length > 40,
        `${token} is withheld without a reason worth reading — that is how a ` +
          `policy becomes a token list nobody can review`,
      );
    }
  });

  it('names the two tokens that would each reopen a measured ad path', () => {
    // Named explicitly rather than left to the loop above, because these two are
    // the whole point of the change and a reviewer should be able to see them in
    // the test output if they ever come back.
    assert.equal(
      PLAYER_IFRAME_SANDBOX.includes('allow-popups'),
      false,
      'allow-popups lets a provider frame open a window; that was measured and ' +
        "id-matched to the frame's own ad request (docs/player-validation-2026-09-21.md §4.2)",
    );
    assert.equal(
      PLAYER_IFRAME_SANDBOX.includes('allow-top-navigation'),
      false,
      "allow-top-navigation lets a provider frame replace Moveo's own page",
    );
  });
});

describe('the component is wired to this policy, and to nothing else', () => {
  const player = read('components/VideoPlayer.tsx');

  it('renders the policy rather than an inline literal', () => {
    assert.match(
      player,
      /sandbox=\{PLAYER_IFRAME_SANDBOX\}/,
      'the player iframe must take its sandbox from lib/playerFramePolicy',
    );
    assert.match(
      player,
      /allow=\{PLAYER_IFRAME_ALLOW\}/,
      'the player iframe must take its allow value from lib/playerFramePolicy',
    );
    assert.equal(
      /allow="autoplay;/.test(player),
      false,
      'an inline allow value is back — two sources of truth for one permission set',
    );
  });

  it('keeps fullscreen, without which the sandboxed frame has no fullscreen control', () => {
    // Asserted here, next to the sandbox, because these two attributes are read
    // together by the browser and by a reviewer, and dropping this one is exactly
    // the "protection that breaks the player" case the brief says to revert.
    assert.match(player, /allowFullScreen/);
  });

  it('never opens the provider page itself', () => {
    assert.equal(
      /target="_blank"/.test(player),
      false,
      'the player must not open a new tab: the two links that did pointed at the ' +
        'raw provider URL, outside the sandbox, where its popups are uncontained',
    );
    assert.equal(
      /window\.open\(/.test(player),
      false,
      'the player must not open windows of its own',
    );
    assert.equal(
      /t\.details\.openInNewTab/.test(player),
      false,
      'the "open in a new tab" label is back in the player UI',
    );
  });
});

describe('the interface does not claim a provider is ad-free', () => {
  it('has no "sans pub" / "no ads" claim in either locale', () => {
    const translations = read('lib/translations.ts');
    for (const claim of [
      /sans pub/i,
      /zéro pub/i,
      /no ads\b/i,
      /no advertisements/i,
      /ad-?free/i,
      /100%/,
    ]) {
      assert.equal(
        claim.test(translations),
        false,
        `a translation promises ${claim} — §4: no such claim may be made unless it ` +
          `is demonstrated, and no provider here has been measured ad-free`,
      );
    }
  });

  it('no longer carries the removed tab label', () => {
    const translations = read('lib/translations.ts');
    assert.equal(
      /openInNewTab/.test(translations),
      false,
      'openInNewTab is an orphan key: the two links that rendered it are gone',
    );
  });
});
