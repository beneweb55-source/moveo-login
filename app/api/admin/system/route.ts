import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { checkAdminAccess } from '@/lib/adminAuth';
import { getJwtSecret } from '@/lib/jwtSecret';

/**
 * Health checks and the admin action log, for the system panel.
 *
 * WHAT WAS WRONG WITH THE PREVIOUS VERSION
 *
 * 1. It reported a fabricated measurement as a real one. The `auth` check was:
 *
 *      const authStart = Date.now();
 *      try {
 *        // If we got this far, auth is working (checkAdminAccess succeeded)
 *        healthChecks.auth = { status: 'online', latency: Date.now() - authStart };
 *      } catch (e: any) {
 *        healthChecks.auth = { status: 'offline', error: e.message };
 *      }
 *
 *    The `try` block contains no operation that can fail, so the `catch` was
 *    unreachable and the row read "online" unconditionally — including on a
 *    deployment with no JWT_SECRET, where nobody can sign in at all. The latency
 *    was the time to call `Date.now()` twice, so it always read 0ms. An operator
 *    looking at this panel during an incident would have been told, in green,
 *    that the one dependency whose absence disables every login was fine.
 *
 *    The check below is real and can actually fail: it resolves the signing
 *    secret through the same accessor every sign and verify path uses, so an
 *    unconfigured deployment is reported as offline. It is a configuration
 *    check, and it is labelled as one — it does not claim to have proven that
 *    sign-in works end to end, because a request that reached this handler has
 *    already been authenticated, and "the request I am answering was authorized"
 *    is not evidence about anything else.
 *
 * 2. It reported "no logs" and "I could not read the logs" as the same thing. The
 *    read was wrapped in a `catch` that set `logs = []`, so a missing
 *    `admin_logs` table rendered as "Aucun journal trouvé." — the panel asserting
 *    an empty history it had not actually observed. §21 asks for exactly this
 *    distinction: a source that cannot be observed is not a source that is known
 *    to be empty.
 *
 * 3. It had a maintenance-mode toggle that enforced nothing. `maintenance_mode`
 *    was written to `content_settings` and read back by this route and by no one
 *    else — a repository-wide search finds no middleware, page or route that
 *    consults it. The panel nonetheless displayed "Mode Maintenance: ON", which
 *    is a false safety control: the state an operator is most likely to reach for
 *    during an incident was the state that did nothing. It is removed rather
 *    than implemented, because implementing it means gating every request in
 *    `middleware.ts` plus an exemption list and a recovery path, none of which
 *    can be exercised from this checkout — and §26 says a function whose
 *    reliability has not been demonstrated does not get activated. A real
 *    maintenance mode is specified in the audit report as a follow-up, not
 *    half-shipped here.
 *
 *    Consequence of the removal: `POST` had exactly one action, the toggle, so
 *    the handler is gone with it. The `maintenance_mode` row already stored in
 *    `content_settings` is left untouched — reading a flag that nothing enforces
 *    is the same decoration in a different place.
 *
 * 4. Its only `admin_logs` writer was that POST, and it did not wrap the insert,
 *    so on a database without the log table the maintenance update committed and
 *    then the request failed with a 500 — the admin was shown an error for a
 *    change that had in fact been applied. `app/api/admin/watch-time/route.ts`
 *    already wraps its log insert for exactly this reason.
 */

export async function GET(req: Request) {
  const adminUser = await checkAdminAccess('access_admin_panel');
  if (!adminUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action') || 'full';

  try {
    const result: any = {};

    if (action === 'full' || action === 'health') {
      const healthChecks: Record<string, { status: string; latency?: number; error?: string }> = {};

      // 1. Database — a real round trip to the database this instance is
      // configured to use. If this fails, nothing else on the panel matters.
      const dbStart = Date.now();
      try {
        await pool.query('SELECT 1');
        healthChecks.database = { status: 'online', latency: Date.now() - dbStart };
      } catch (e: any) {
        healthChecks.database = { status: 'offline', error: e.message };
      }

      // 2. Session signing — is the secret resolvable at all? This is the check
      // the previous version only pretended to make. `getJwtSecret()` throws a
      // MissingJwtSecretError whose message names the variable and carries no
      // value, so the reason is safe to show to the admin who is asking.
      try {
        getJwtSecret();
        healthChecks.session_signing = { status: 'online' };
      } catch (e: any) {
        healthChecks.session_signing = {
          status: 'offline',
          error: 'JWT_SECRET is not set: sign-in and session verification are disabled',
        };
      }

      // 3. TMDB — the metadata every catalogue page reads. Measured, with a
      // timeout, so a hanging upstream is reported as offline rather than left
      // to hold the panel open.
      const tmdbStart = Date.now();
      try {
        const tmdbRes = await fetch('https://api.themoviedb.org/3/configuration', {
          headers: {
            Authorization: `Bearer ${process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY}`
          },
          signal: AbortSignal.timeout(5000)
        });
        if (tmdbRes.ok) {
          healthChecks.tmdb = { status: 'online', latency: Date.now() - tmdbStart };
        } else {
          healthChecks.tmdb = { status: 'offline', error: `HTTP ${tmdbRes.status}` };
        }
      } catch (e: any) {
        healthChecks.tmdb = { status: 'offline', latency: Date.now() - tmdbStart, error: e.message };
      }

      result.healthChecks = healthChecks;
    }

    if (action === 'full' || action === 'logs') {
      try {
        const logsRes = await pool.query(`
          SELECT id, admin_name, action, target_type, target_id, metadata, status, created_at
          FROM admin_logs
          ORDER BY created_at DESC
          LIMIT 20
        `);
        result.logs = logsRes.rows;
      } catch (e: any) {
        // Kept distinct from an empty log on purpose. `logs: []` alone told the
        // panel "there is no history"; `logsError` lets it say "the history could
        // not be read", which is the true statement and the actionable one — it
        // is how the admin learns the logging table is missing.
        result.logs = [];
        result.logsError = e.message || 'Could not read admin_logs';
        console.error('[admin/system] admin_logs read failed:', e);
      }
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
