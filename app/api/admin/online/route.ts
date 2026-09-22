import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { checkAdminAccess } from '@/lib/adminAuth';

/**
 * "Online" has to be defined by the read, not by a delete that happens to run
 * just before it.
 *
 * This route used to answer "who is online?" with whatever rows were left in
 * `online_users`, and the only thing that ever removed a stale row was a
 * `DELETE` issued on the next line. So a GET — which HTTP requires to be safe,
 * and which a prefetch, a retry, a second admin tab or two admins watching at
 * once can all issue — was the sole authority on who counted as online. If that
 * write was skipped, slow, or overlapping another instance's, rows hours old
 * were presented as current. And because nothing else ever reaped the table, if
 * no admin opened the panel, stale rows were never removed at all.
 *
 * The SELECT below now carries the predicate, so the list is correct whether or
 * not the housekeeping ran. That makes the DELETE genuinely optional, which is
 * what lets it be throttled.
 */
const STALE_AFTER = `2 minutes`;

// In-process throttle for the housekeeping DELETE. Module-level state is per
// server instance and resets on deploy, which is deliberate and now harmless:
// with the predicate in the query, the worst case of a missed window is a few
// stale rows that are already filtered out of the response.
const REAP_INTERVAL_MS = 60_000;
let lastReapAt = 0;

export async function GET() {
  const adminUser = await checkAdminAccess('access_admin_panel');
  if (!adminUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // Housekeeping, throttled. Worth still doing — the table would otherwise
    // grow without bound — but it no longer needs to run, and take row locks,
    // on every 10-second poll of every open panel.
    const now = Date.now();
    if (now - lastReapAt > REAP_INTERVAL_MS) {
      lastReapAt = now;
      await pool.query(`DELETE FROM online_users WHERE last_ping < NOW() - INTERVAL '${STALE_AFTER}'`);
    }

    // Get online users. The predicate is what makes the answer correct; the
    // DELETE above is only there to keep the table small.
    const onlineUsersRes = await pool.query(`
      SELECT o.*, u.name, u.email, u.avatar_url, r.name as role_name, r.color as role_color,
             COALESCE((SELECT SUM(minutes_watched) FROM watch_history WHERE user_id = u.id), 0) as total_watch_time
      FROM online_users o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE o.last_ping >= NOW() - INTERVAL '${STALE_AFTER}'
      ORDER BY o.last_ping DESC
    `);

    const onlineUsers = onlineUsersRes.rows;
    const registeredUsers = onlineUsers.filter((u: any) => u.user_id);
    const anonymousUsers = onlineUsers.filter((u: any) => !u.user_id);

    return NextResponse.json({
      totalOnline: onlineUsers.length,
      registeredCount: registeredUsers.length,
      anonymousCount: anonymousUsers.length,
      registeredUsers,
      anonymousUsers
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
