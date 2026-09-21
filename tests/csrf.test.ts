/**
 * Pins the cross-site forgery rule that middleware.ts applies.
 *
 * WHY A TEST RATHER THAN A COMMENT: the rule is three conditions deep, and both
 * ways of getting it wrong fail silently — one lets a forged request through,
 * the other refuses a legitimate one and looks like an unrelated bug. The cases
 * below are the combinations that are easy to invert, not a restatement of the
 * implementation.
 *
 * The two load-bearing ones: an ABSENT Origin must be allowed (a browser always
 * sends the header on a non-GET request, so its absence means a non-browser
 * caller), and a PRESENT but matching Origin must be allowed (every ordinary
 * same-origin POST looks like this, so refusing it breaks the whole site).
 *
 * Run: node --import tsx --test tests/csrf.test.ts
 */

import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {STATE_CHANGING_METHODS, isCrossSiteRequest} from '../lib/csrf';

const SELF = 'https://www.moveo.blog';
const EVIL = 'https://evil.example';

const decide = (method: string, origin: string | null): boolean =>
  isCrossSiteRequest({method, origin, selfOrigin: SELF});

describe('isCrossSiteRequest — the methods it governs', () => {
  for (const method of STATE_CHANGING_METHODS) {
    it(`refuses a cross-site ${method}`, () => {
      assert.equal(decide(method, EVIL), true);
    });
  }

  for (const method of ['GET', 'HEAD', 'OPTIONS']) {
    it(`never refuses ${method}, which changes nothing`, () => {
      assert.equal(decide(method, EVIL), false);
    });
  }
});

describe('isCrossSiteRequest — the decisions that are easy to invert', () => {
  it('allows an absent Origin, because a browser would have sent one', () => {
    assert.equal(decide('POST', null), false);
  });

  it('allows a matching Origin — this is every ordinary same-origin POST', () => {
    assert.equal(decide('POST', SELF), false);
  });

  it('refuses a different host on the same registrable domain', () => {
    assert.equal(decide('POST', 'https://moveo.blog'), true);
  });

  it('refuses the string "null", which a sandboxed document sends', () => {
    assert.equal(decide('POST', 'null'), true);
  });

  it('is not fooled by a matching prefix', () => {
    assert.equal(decide('POST', `${SELF}.evil.example`), true);
  });

  it('treats the method case-insensitively', () => {
    assert.equal(decide('post', EVIL), true);
  });
});
