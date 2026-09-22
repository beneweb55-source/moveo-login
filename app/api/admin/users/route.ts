import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { checkAdminAccess } from '@/lib/adminAuth';

export async function GET(req: Request) {
  const adminUser = await checkAdminAccess('view_users');
  if (!adminUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search') || '';

  // `?page=abc` parsed to `NaN`, and `(NaN - 1) * 20` reached Postgres as an
  // OFFSET of NaN — a failed query and a 500 on the user list, from a URL. A
  // bare `parseInt` also carries no radix. The same values are read defensively
  // on the reports endpoint for the same reason.
  const requestedPage = Number.parseInt(searchParams.get('page') || '1', 10);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  // `?limit=0` made `Math.ceil(total / 0)` an infinity that JSON-serialised to
  // `null`, and `?limit=-5` made `totalPages` negative, which left the "Next"
  // button enabled forever: clicking it computed a `NaN` page and the following
  // request 500'd. The cap keeps one request from being asked for the whole
  // user table.
  const requestedLimit = Number.parseInt(searchParams.get('limit') || '20', 10);
  const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 100) : 20;
  const sort = searchParams.get('sort') || 'created_at';
  const offset = (page - 1) * limit;

  try {
    // ─── THIS DEFINITION MUST MATCH scripts/migrate-progression.ts ───────────
    //
    // It did not, and this is the drift that broke a WRITE path rather than a
    // displayed number. This bootstrap declared `media_type` and `media_id`
    // NULLABLE, `TIMESTAMP` without a time zone, and — the part that matters —
    // NO `UNIQUE(session_id, media_type, media_id)`.
    //
    // app/api/watch-time/route.ts:158 upserts guest viewing with
    // `ON CONFLICT (session_id, media_type, media_id)`, and Postgres resolves
    // that clause ONLY against a real unique index or constraint. Without one it
    // fails with 42P10, "there is no unique or exclusion constraint matching the
    // ON CONFLICT specification" — a 500 on every guest watch-time write.
    //
    // `CREATE TABLE IF NOT EXISTS` means the FIRST definition to run wins and the
    // other is a silent no-op, so which table a database ended up with depended
    // on whether an admin opened the user list (`GET /api/admin/users`, the
    // endpoint this route serves) before a signed-out visitor first saved
    // progress. On that ordering, guest history was not merely unsynced: no guest
    // write could succeed at all, and nothing in the UI would have said why. The
    // NULL columns were a quieter version of the same bug — `media_type <> $1` is
    // NULL for a NULL media_type, so such a row is excluded from every
    // aggregation that filters, silently dropping the minutes it holds.
    //
    // It is kept as a fallback rather than deleted, for the same reason the
    // pinned-sections bootstrap is: if no migration has been run, removing it
    // leaves this endpoint reading a table that does not exist. What it may not
    // do is disagree.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS anonymous_watch_history (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(255) NOT NULL,
        media_type VARCHAR(50) NOT NULL,
        media_id INTEGER NOT NULL,
        minutes_watched INTEGER DEFAULT 0,
        last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(session_id, media_type, media_id)
      );
    `);

    let query = `
      SELECT u.id, u.name, u.email, u.avatar_url, u.created_at, u.is_banned, u.ban_reason, u.role_id,
             (SELECT COUNT(*) FROM user_list WHERE user_id = u.id AND list_type = 'watched') as watched_count,
             r.name as role_name, r.color as role_color, r.priority as role_priority,
             COALESCE((SELECT SUM(minutes_watched) FROM watch_history WHERE user_id = u.id), 0) as total_watch_time
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
    `;
    const queryParams: any[] = [];
    let paramIndex = 1;

    if (search) {
      query += ` WHERE u.name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex}`;
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    if (sort === 'total_watch_time') {
      query += ` ORDER BY total_watch_time DESC`;
    } else {
      query += ` ORDER BY u.created_at DESC`;
    }

    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(limit, offset);

    const usersRes = await pool.query(query, queryParams);
    
    // Get total count for pagination
    let countQuery = `SELECT COUNT(*) FROM users`;
    const countParams: any[] = [];
    if (search) {
      countQuery += ` WHERE name ILIKE $1 OR email ILIKE $1`;
      countParams.push(`%${search}%`);
    }
    const countRes = await pool.query(countQuery, countParams);
    const totalUsers = Number.parseInt(String(countRes.rows[0].count ?? '0'), 10) || 0;

    return NextResponse.json({
      users: usersRes.rows,
      // `Math.max(1, …)` so an empty search result is "page 1 of 1" rather than
      // "page 1 of 0", which the pagination row printed as a real page count.
      totalPages: Math.max(1, Math.ceil(totalUsers / limit)),
      currentPage: page
    });
  } catch (error) {
    // The database's own message was returned to the caller. It names tables,
    // columns and constraints, and it is not the UI's to show.
    console.error('[admin/users] GET failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const adminUser = await checkAdminAccess('edit_users');
  if (!adminUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { userId, roleId, isBanned, banReason } = await req.json();

    // Check target user's role priority
    const targetUserRes = await pool.query(`
      SELECT r.priority, r.name as role_name 
      FROM users u 
      LEFT JOIN roles r ON u.role_id = r.id 
      WHERE u.id::text = $1
    `, [userId]);

    if (targetUserRes.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const targetPriority = targetUserRes.rows[0].priority || 0;
    const targetRoleName = targetUserRes.rows[0].role_name;

    // Cannot modify someone with higher or equal priority, unless it's yourself (maybe?)
    // Actually, cannot modify someone with higher or equal priority.
    if (targetPriority >= adminUser.priority && adminUser.id !== userId && !adminUser.is_founder) {
      return NextResponse.json({ error: 'Cannot modify user with higher or equal priority' }, { status: 403 });
    }

    // Cannot modify Admin role directly if you are not Admin
    if (targetRoleName === 'Admin' && adminUser.role_name !== 'Admin' && !adminUser.is_founder) {
      return NextResponse.json({ error: 'Cannot modify Admin user' }, { status: 403 });
    }

    const updates = [];
    const values = [];
    let paramIndex = 1;

    // A missing permission used to be indistinguishable from a successful
    // no-op. Both cases fell through to the `updates.length === 0` branch below,
    // which answered
    //   200 { message: 'No updates provided or insufficient permissions' }
    // and components/admin/UsersManager.tsx treats any `res.ok` as success: it
    // refetched the list and re-rendered the user's OLD role, with no error
    // shown. An admin without `edit_roles` would change a role, watch it
    // silently snap back, and have no way to tell a permission problem from a
    // bug — the "insufficient permissions" text was in the body and nothing
    // read it.
    //
    // Each requested field is now authorised before it is applied, and a
    // caller who is not permitted to make the change they asked for is refused
    // outright rather than getting a half-applied mutation behind a 200.
    if (roleId !== undefined) {
      if (!(adminUser.permissions ?? []).includes('edit_roles')) {
        return NextResponse.json({ error: 'Missing permission: edit_roles' }, { status: 403 });
      }
      // Check if new role has higher priority than admin
      const newRoleRes = await pool.query(`SELECT priority, name FROM roles WHERE id = $1`, [roleId]);
      if (newRoleRes.rows.length === 0) {
        return NextResponse.json({ error: 'Role not found' }, { status: 400 });
      }
      if (newRoleRes.rows[0].priority >= adminUser.priority && adminUser.role_name !== 'Admin' && !adminUser.is_founder) {
        return NextResponse.json({ error: 'Cannot assign role with higher or equal priority' }, { status: 403 });
      }
      updates.push(`role_id = $${paramIndex++}`);
      values.push(roleId);
    }

    if (isBanned !== undefined) {
      if (!(adminUser.permissions ?? []).includes('ban_users')) {
        return NextResponse.json({ error: 'Missing permission: ban_users' }, { status: 403 });
      }
      updates.push(`is_banned = $${paramIndex++}`);
      values.push(isBanned);
      updates.push(`ban_reason = $${paramIndex++}`);
      values.push(banReason || null);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    values.push(userId);
    await pool.query(`
      UPDATE users
      SET ${updates.join(', ')}
      WHERE id::text = $${paramIndex}
    `, values);

    // Trace the change. Until now /api/admin/watch-time was the only writer to
    // admin_logs, so "Journaux d'Activité Récents" on the system panel showed
    // watch-time adjustments and nothing else — the least security-relevant
    // mutation on the whole panel was the only one with a trace, while a role
    // change (which grants permissions) and a ban left none at all. That made
    // the activity log read as "nothing else ever happens".
    //
    // Same non-critical pattern as that route: a logging failure must not fail
    // the mutation the admin actually asked for, and must not report a failure
    // for an action that did succeed.
    try {
      const actions: string[] = [];
      if (roleId !== undefined) actions.push('role_change');
      if (isBanned !== undefined) actions.push(isBanned ? 'user_ban' : 'user_unban');
      await pool.query(`
        INSERT INTO admin_logs (admin_id, admin_name, action, target_type, target_id, metadata)
        VALUES ($1, $2, $3, 'user', $4, $5)
      `, [
        adminUser.id,
        adminUser.name || adminUser.email,
        actions.join('+'),
        String(userId),
        JSON.stringify({
          role_id: roleId ?? null,
          is_banned: isBanned ?? null,
          ban_reason: banReason ?? null,
        }),
      ]);
    } catch (logError) {
      console.error('Failed to log admin action:', logError);
    }

    return NextResponse.json({ message: 'User updated successfully' });
  } catch (error) {
    console.error('[admin/users] PUT failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
