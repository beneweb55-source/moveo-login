/**
 * robots.txt and sitemap.xml are read by machines, so a mistake in either is
 * invisible in a browser: a crawler that cannot parse the sitemap simply
 * ignores it, and a disallow rule that never matches looks like nothing at all.
 * The assertions below cover the failures that produce silence rather than an
 * error — a relative URL (invalid in the sitemap protocol) and a missing API
 * exclusion.
 *
 * Run: node --import tsx --test tests/seo.test.ts
 */

import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import robots from '../app/robots';
import sitemap from '../app/sitemap';

const ORIGIN = 'https://www.moveo.blog';

describe('robots', () => {
  it('points crawlers at the sitemap, on the canonical origin', () => {
    assert.equal(robots().sitemap, `${ORIGIN}/sitemap.xml`);
  });

  it('keeps crawlers out of the API surface', () => {
    const rules = robots().rules;
    const disallow = Array.isArray(rules) ? rules[0].disallow : rules.disallow;
    assert.ok(disallow?.includes('/api/'));
  });
});

describe('sitemap', () => {
  it('lists absolute URLs, as the sitemap protocol requires', () => {
    const entries = sitemap();
    assert.ok(entries.length > 0);
    for (const entry of entries) {
      assert.ok(
        entry.url.startsWith(`${ORIGIN}/`),
        `${entry.url} is not on the canonical origin`,
      );
      assert.doesNotThrow(() => new URL(entry.url));
    }
  });

  it('includes the home page and the catalogue hubs', () => {
    const urls = sitemap().map((entry) => entry.url);
    assert.equal(urls[0], `${ORIGIN}/`);
    for (const path of ['/films', '/series', '/animes', '/kdrama']) {
      assert.ok(urls.includes(`${ORIGIN}${path}`), `${path} missing from sitemap`);
    }
  });
});
