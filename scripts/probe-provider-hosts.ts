/**
 * Live host-rotation probe for the embedded providers in lib/providers.ts.
 *
 * WHY THIS EXISTS
 *
 * On 2026-11-13 the Frembed player showed Chromium's *« Ce contenu est bloqué.
 * Pour résoudre le problème, contactez le propriétaire du site. »* The provider
 * had moved its embed host from `frembed.surf` to `frembed.uno` and turned the
 * old host into a 302. We were still framing the old host, so the browser
 * followed the redirect and re-checked OUR `frame-src` against the NEW origin —
 * which was not listed — and blocked the frame. Every unit test was green,
 * because they assert agreements BETWEEN files (registry ↔ CSP), and both files
 * held the same stale fact.
 *
 * A unit test cannot catch that: it would have to reach the internet, which a
 * hermetic suite must not do. So the check lives here, as a separate, explicitly
 * opt-in script. It answers ONE question per provider: "does the entry URL still
 * commit on the origin we declared, or does it now redirect somewhere we have not
 * permitted?"
 *
 * WHAT IT DOES NOT CLAIM
 *
 * An HTTP 200 here is NOT playback, and not even "frameable" on its own — it is
 * only "the host still answers where the registry says it does". It deliberately
 * does not follow redirects into a success verdict: a hop to an undeclared origin
 * is the exact failure it reports. Read it the way the rest of this project reads
 * measurements: as one observation, dated, not a property.
 *
 * USAGE
 *
 *   node --import tsx scripts/probe-provider-hosts.ts
 *   node --import tsx scripts/probe-provider-hosts.ts Frembed
 *
 * Exit code 0 = every declared entry origin answers directly.
 * Exit code 1 = at least one provider redirects to an origin we do not declare,
 *               or failed to answer — i.e. the registry needs re-measuring.
 *
 * READING A FAILURE — the distinction this project has already got wrong once
 * (docs/provider-matrix.md, "the difference between 'the provider is down' and
 * 'this vantage point cannot reach the provider'"). If EVERY provider fails with
 * `fetch failed`, the sandbox running this has no egress and the report says
 * nothing about the providers. If exactly one fails, or one redirects somewhere
 * undeclared, that is a real finding. Run it from a host with ordinary outbound
 * HTTPS before concluding anything about a provider.
 */

import {
  PROVIDERS,
  PROVIDER_FRAME_ORIGINS,
  buildProviderUrl,
  type ProviderDefinition,
} from '../lib/providers';

/** Bound on each request: a hung host must not hang the report. */
const TIMEOUT_MS = 15_000;

interface ProbeResult {
  provider: string;
  entryUrl: string;
  status: number | null;
  /** Location header, following the browser's rule: the frame would land here. */
  location: string | null;
  /** Origin of the URL a browser would actually commit, or null if unknown. */
  committedOrigin: string | null;
  /** True when the frame's final origin is covered by our own CSP list. */
  allowedByCsp: boolean;
  error: string | null;
}

/**
 * Mirrors how a browser matches an expression: `'self'` is not relevant here
 * (these are all absolute cross-origin URLs), an exact origin matches, and a
 * `https://*.host` wildcard covers subdomains but NOT the bare host.
 */
const originAllowed = (origin: string): boolean => {
  if (PROVIDER_FRAME_ORIGINS.includes(origin)) return true;
  const {protocol, hostname} = new URL(origin);
  return PROVIDER_FRAME_ORIGINS.some((entry) => {
    if (!entry.startsWith('https://*.')) return false;
    const suffix = entry.slice('https://*.'.length);
    return protocol === 'https:' && hostname.endsWith(`.${suffix}`);
  });
};

/**
 * One request, no redirect following. `redirect: 'manual'` is the whole point:
 * the interesting fact is the hop, not the document at the end of it.
 */
const probe = async (provider: ProviderDefinition): Promise<ProbeResult> => {
  const entryUrl =
    buildProviderUrl(provider.name, {type: 'movie', id: '550'}) ?? '(no URL)';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(entryUrl, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        // Some providers serve an error shell to obvious bots; this is the
        // ordinary browser shape, not an attempt to defeat a challenge.
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      },
    });

    const location = response.headers.get('location');
    const committedOrigin = new URL(location ?? entryUrl, entryUrl).origin;

    return {
      provider: provider.name,
      entryUrl,
      status: response.status,
      location,
      committedOrigin,
      allowedByCsp: originAllowed(committedOrigin),
      error: null,
    };
  } catch (error) {
    return {
      provider: provider.name,
      entryUrl,
      status: null,
      location: null,
      committedOrigin: null,
      allowedByCsp: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
};

const pad = (value: string, width: number): string =>
  value.length >= width ? value : value + ' '.repeat(width - value.length);

const main = async (): Promise<void> => {
  const requested = process.argv.slice(2);
  const targets =
    requested.length > 0
      ? PROVIDERS.filter((p) => requested.includes(p.name))
      : PROVIDERS;

  if (targets.length === 0) {
    console.error(`No provider matched: ${requested.join(', ')}`);
    console.error(`Known: ${PROVIDERS.map((p) => p.name).join(', ')}`);
    process.exitCode = 2;
    return;
  }

  const results: ProbeResult[] = [];
  for (const provider of targets) {
    // Sequential, not parallel: some of these hosts rate-limit a burst, and a
    // false failure is worse than a slow report.
    results.push(await probe(provider));
  }

  console.log(`frame-src allowlist: ${PROVIDER_FRAME_ORIGINS.join(' ')}\n`);
  console.log(
    `${pad('PROVIDER', 14)} ${pad('STATUS', 7)} ${pad('COMMITS ON', 26)} CSP  DETAIL`,
  );
  console.log('-'.repeat(100));

  let failed = false;
  for (const result of results) {
    const ok = result.allowedByCsp && result.status !== null && result.status < 400;
    if (!ok) failed = true;

    const detail = result.error
      ? result.error
      : result.location
        ? `redirect -> ${result.location}`
        : result.status !== null && result.status >= 400
          ? `HTTP ${result.status} from ${result.entryUrl}`
          : result.entryUrl;

    console.log(
      `${pad(result.provider, 14)} ${pad(String(result.status ?? 'ERR'), 7)} ` +
        `${pad(result.committedOrigin ?? '-', 26)} ${result.allowedByCsp ? 'ok ' : 'NO '} ${detail}`,
    );
  }

  console.log('');

  // An all-`fetch failed` report is about THIS vantage point, not the providers.
  // Naming it here stops the next reader repeating the mistake the matrix
  // document spent a section correcting.
  const unreachable = results.filter((r) => r.error !== null).length;
  const allUnreachable = unreachable === results.length && results.length > 1;

  if (failed) {
    if (allUnreachable) {
      console.log(
        'RESULT: INCONCLUSIVE — every request failed at the network layer, which\n' +
          '        describes this machine, not the providers. No egress to these hosts\n' +
          '        (or a proxy/firewall) is the likely cause. Re-run from a host with\n' +
          '        ordinary outbound HTTPS before treating anything here as a finding.',
      );
      process.exitCode = 1;
      return;
    }
    console.log(
      'RESULT: at least one provider no longer commits where the registry says.\n' +
        '        Re-measure the host, then update BOTH lib/providers.ts (frameOrigins,\n' +
        '        and buildUrl if the path changed) and next.config.ts (frame-src).\n' +
        '        tests/csp.test.ts will keep them in step once the registry is right.',
    );
    process.exitCode = 1;
  } else {
    console.log(
      'RESULT: every entry origin answered where declared. That is a host check, ' +
        'not a playback check.',
    );
  }
};

void main();
