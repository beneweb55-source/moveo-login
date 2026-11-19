import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PROVIDERS_PATH = path.join(ROOT, 'lib/providers.ts');
const NEXT_CONFIG_PATH = path.join(ROOT, 'next.config.ts');
const CSP_TEST_PATH = path.join(ROOT, 'tests/csp.test.ts');
const PROVIDERS_TEST_PATH = path.join(ROOT, 'tests/providers.test.ts');

const PROBE_PATH = '/embed/movie/27205';
const TIMEOUT_MS = 15_000;

function extractOrigin(source: string, constName: string): string {
  const match = source.match(new RegExp(`const ${constName} = ["']([^"']+)["']`));
  if (!match) {
    throw new Error(`Could not find ${constName} in lib/providers.ts`);
  }
  return match[1];
}

async function resolveFinalOrigin(entryUrl: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(entryUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
    });
    if (!res.ok) {
      console.warn(`[frembed-watcher] Probe ${entryUrl} returned HTTP ${res.status}`);
      return null;
    }
    return new URL(res.url).origin;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[frembed-watcher] Probe ${entryUrl} failed: ${msg}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const providersSrc = fs.readFileSync(PROVIDERS_PATH, 'utf8');
  const currentOrigin = extractOrigin(providersSrc, 'FREMBED_ORIGIN');
  const previousRedirectOrigin = extractOrigin(providersSrc, 'FREMBED_REDIRECT_ORIGIN');

  const finalOrigin = await resolveFinalOrigin(`${currentOrigin}${PROBE_PATH}`);
  if (!finalOrigin) {
    console.log('[frembed-watcher] Skipping update due to probe failure.');
    return;
  }

  if (finalOrigin === currentOrigin) {
    console.log(`[frembed-watcher] Unchanged: ${currentOrigin}`);
    return;
  }

  console.log(`[frembed-watcher] Rotation detected: ${currentOrigin} -> ${finalOrigin}`);

  // 1. lib/providers.ts
  let nextProviders = providersSrc
    .replace(
      `const FREMBED_ORIGIN = "${currentOrigin}";`,
      `const FREMBED_ORIGIN = "${finalOrigin}";`,
    )
    .replace(
      `const FREMBED_REDIRECT_ORIGIN = "${previousRedirectOrigin}";`,
      `const FREMBED_REDIRECT_ORIGIN = "${currentOrigin}";`,
    );
  fs.writeFileSync(PROVIDERS_PATH, nextProviders);

  // 2. next.config.ts
  let nextConfig = fs.readFileSync(NEXT_CONFIG_PATH, 'utf8');
  nextConfig = nextConfig
    .replace(`'${currentOrigin}',`, `'${finalOrigin}',`)
    .replace(`'${previousRedirectOrigin}',`, `'${currentOrigin}',`);
  fs.writeFileSync(NEXT_CONFIG_PATH, nextConfig);

  // 3. tests/csp.test.ts
  let cspTest = fs.readFileSync(CSP_TEST_PATH, 'utf8');
  cspTest = cspTest
    .replaceAll(`'${currentOrigin}'`, `'${finalOrigin}'`)
    .replaceAll(`'${previousRedirectOrigin}'`, `'${currentOrigin}'`);
  // Fix entry/hops order in MEASURED_CHAINS where entry was replaced first
  cspTest = cspTest.replace(
    `entry: '${finalOrigin}',\n      hops: ['${finalOrigin}']`,
    `entry: '${finalOrigin}',\n      hops: ['${currentOrigin}']`,
  );
  fs.writeFileSync(CSP_TEST_PATH, cspTest);

  // 4. tests/providers.test.ts
  let providersTest = fs.readFileSync(PROVIDERS_TEST_PATH, 'utf8');
  providersTest = providersTest.replaceAll(currentOrigin, finalOrigin);
  fs.writeFileSync(PROVIDERS_TEST_PATH, providersTest);

  console.log(`[frembed-watcher] Updated files for ${finalOrigin}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
