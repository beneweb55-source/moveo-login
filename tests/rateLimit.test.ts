/**
 * Pins the boundary of the per-key limiter, because the boundary is the only
 * part of a limiter that can be wrong in a way nobody notices: a limiter that
 * never refuses is invisible, and one that refuses the first request looks like
 * an outage of whatever route it guards.
 *
 * The cases below are the ones that fail silently — an off-by-one at the
 * allowance, a window that never resets, keys that leak into each other, and a
 * key extraction that lets a request escape bucketing entirely.
 *
 * Run: node --import tsx --test tests/rateLimit.test.ts
 */

import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {clientKeyFrom, createRateLimiter} from '../lib/rateLimit';

describe('createRateLimiter — the allowance boundary', () => {
  it('allows exactly maxRequests, then refuses the next one', () => {
    const limiter = createRateLimiter({windowMs: 60_000, maxRequests: 3});

    assert.equal(limiter.isRateLimited('a'), false); // 1
    assert.equal(limiter.isRateLimited('a'), false); // 2
    assert.equal(limiter.isRateLimited('a'), false); // 3
    assert.equal(limiter.isRateLimited('a'), true); // 4 — over
  });

  it('buckets each key independently', () => {
    const limiter = createRateLimiter({windowMs: 60_000, maxRequests: 1});

    assert.equal(limiter.isRateLimited('a'), false);
    assert.equal(limiter.isRateLimited('a'), true);
    // A different caller must be unaffected by 'a' being exhausted.
    assert.equal(limiter.isRateLimited('b'), false);
  });

  it('starts a fresh window once the old one expires', async () => {
    const limiter = createRateLimiter({windowMs: 20, maxRequests: 1});

    assert.equal(limiter.isRateLimited('a'), false);
    assert.equal(limiter.isRateLimited('a'), true);

    await new Promise((resolve) => setTimeout(resolve, 30));

    // Not merely "allowed again" — the counter restarted at 1, so the next
    // request in the new window is still within the allowance.
    assert.equal(limiter.isRateLimited('a'), false);
    assert.equal(limiter.isRateLimited('a'), true);
  });
});

describe('clientKeyFrom — what a request is bucketed by', () => {
  const withHeader = (value?: string): Request =>
    new Request('https://www.moveo.blog/api/ai-search?q=film', {
      headers: value === undefined ? {} : {'x-forwarded-for': value},
    });

  it('takes the first entry of a forwarded chain, which is the original client', () => {
    assert.equal(clientKeyFrom(withHeader('203.0.113.7, 70.41.3.18, 150.172.238.178')), '203.0.113.7');
  });

  it('trims the padding an edge may leave around the entry', () => {
    assert.equal(clientKeyFrom(withHeader('  203.0.113.7  , 10.0.0.1')), '203.0.113.7');
  });

  it('falls back to one shared bucket when the header is absent', () => {
    assert.equal(clientKeyFrom(withHeader()), 'unknown');
  });

  it('falls back rather than bucketing on an empty first entry', () => {
    // A header of ", ," has a first entry that trims to ''; using it would put
    // every such request in a bucket keyed by the empty string, which is fine,
    // but 'unknown' keeps that case legible in a log.
    assert.equal(clientKeyFrom(withHeader(', ,')), 'unknown');
  });
});
