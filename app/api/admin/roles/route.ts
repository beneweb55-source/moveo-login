import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { checkAdminAccess } from '@/lib/adminAuth';

export async function GET() {
  const adminUser = await checkAdminAccess('manage_roles');
  if (!adminUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const rolesRes = await pool.query('SELECT * FROM roles ORDER BY priority DESC');
    return NextResponse.json(rolesRes.rows);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const adminUser = await checkAdminAccess('manage_roles');
  if (!adminUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { name, color, permissions, priority } = await req.json();
    
    if (priority >= adminUser.priority && adminUser.role_name !== 'Admin' && !adminUser.is_founder) {
      return NextResponse.json({ error: 'Cannot create role with higher or equal priority' }, { status: 403 });
    }

    const res = await pool.query(`
      INSERT INTO roles (name, color, permissions, priority, created_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [name, color, JSON.stringify(permissions), priority, adminUser.id]);

    return NextResponse.json(res.rows[0]);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const adminUser = await checkAdminAccess('manage_roles');
  if (!adminUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id, name, color, permissions, priority } = await req.json();

    const roleRes = await pool.query('SELECT * FROM roles WHERE id = $1', [id]);
    if (roleRes.rows.length === 0) return NextResponse.json({ error: 'Role not found' }, { status: 404 });

    const role = roleRes.rows[0];

    if (role.name === 'Admin') {
      return NextResponse.json({ error: 'Cannot modify Admin role' }, { status: 403 });
    }

    if (priority >= adminUser.priority && adminUser.role_name !== 'Admin' && !adminUser.is_founder) {
      return NextResponse.json({ error: 'Cannot update role to higher or equal priority' }, { status: 403 });
    }

    const res = await pool.query(`
      UPDATE roles 
      SET name = $1, color = $2, permissions = $3, priority = $4
      WHERE id = $5
      RETURNING *
    `, [name, color, JSON.stringify(permissions), priority, id]);

    return NextResponse.json(res.rows[0]);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const adminUser = await checkAdminAccess('manage_roles');
  if (!adminUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'Role ID required' }, { status: 400 });

    const roleRes = await pool.query('SELECT * FROM roles WHERE id = $1', [id]);
    if (roleRes.rows.length === 0) return NextResponse.json({ error: 'Role not found' }, { status: 404 });

    const role = roleRes.rows[0];

    if (role.name === 'Admin') {
      return NextResponse.json({ error: 'Cannot delete Admin role' }, { status: 403 });
    }

    if (role.priority >= adminUser.priority && adminUser.role_name !== 'Admin' && !adminUser.is_founder) {
      return NextResponse.json({ error: 'Cannot delete role with higher or equal priority' }, { status: 403 });
    }

    // Get default User role
    const userRoleRes = await pool.query(`SELECT id FROM roles WHERE name = 'User'`);
    const defaultRoleId = userRoleRes.rows.length > 0 ? userRoleRes.rows[0].id : null;

    // Update users with this role to default role
    await pool.query(`UPDATE users SET role_id = $1 WHERE role_id = $2`, [defaultRoleId, id]);

    // Delete role
    await pool.query(`DELETE FROM roles WHERE id = $1`, [id]);

    return NextResponse.json({ message: 'Role deleted successfully' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * Reorder roles. Called by the drag-and-drop list in RolesManager.
 *
 * WHY THIS VALIDATES ANYTHING AT ALL
 *
 * `priority` is not a display order — it is the rank the rest of this file
 * enforces access with. POST, PUT and DELETE all refuse to create, modify or
 * delete a role at or above the caller's own priority. This handler did not:
 * it wrote every submitted priority straight through. So a manager whose own
 * role sat at rank 50 could send `[{id: <their own role>, priority: 999}]` and
 * become the highest-ranked role in the table, after which the guards in the
 * other three handlers no longer applied to them at all. The panel's own drag
 * list made no such request — it only ever sends the sortable roles, at
 * `80 - index` — but the endpoint cannot rely on the panel being the caller.
 *
 * The rules below are the ones already in force elsewhere in this file, applied
 * to the one handler that skipped them:
 *
 *   - an integer priority per entry, because `priority` is an integer column and
 *     a float or a string is a malformed request rather than a reorder;
 *   - the Admin and Fondateur roles may not appear in `updates` at all. The panel
 *     already excludes both from its sortable list — `lockedRoles` filters on
 *     exactly these two names — so this only refuses what the UI never sends;
 *   - unless the caller is an Admin or the founder, nothing may be raised to the
 *     caller's own rank or above.
 *
 * The last rule has a visible consequence worth stating: a manager whose rank is
 * the highest among the sortable roles can no longer drag at all, because every
 * priority recomputed by the panel would meet or exceed their own. That is the
 * correct boundary, not a regression — moving one's own role above another IS
 * the self-granted promotion this guard exists to stop — and it now fails with a
 * 403 and a message instead of succeeding silently.
 */
export async function PATCH(req: Request) {
  const adminUser = await checkAdminAccess('manage_roles');
  if (!adminUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { updates } = await req.json(); // updates: { id, priority }[]

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ error: 'Invalid updates format' }, { status: 400 });
    }

    const entries: Array<{id: number; priority: number}> = [];
    for (const update of updates) {
      const id = Number(update?.id);
      const priority = Number(update?.priority);
      if (!Number.isInteger(id) || !Number.isInteger(priority)) {
        return NextResponse.json(
          { error: 'Each update needs an integer id and an integer priority' },
          { status: 400 },
        );
      }
      entries.push({id, priority});
    }

    // `is_founder` is only ever set by the founder override in lib/adminAuth.ts,
    // and both bypasses mirror the condition the other three handlers use.
    const isUnrestricted = adminUser.role_name === 'Admin' || adminUser.is_founder === true;
    const actorPriority = Number(adminUser.priority);

    if (!isUnrestricted && !Number.isFinite(actorPriority)) {
      // A caller whose role carries no rank has no position from which to rank
      // others. Refusing is the fail-closed reading; letting `>= null` coerce to
      // `>= 0` and decide it by accident is not.
      return NextResponse.json(
        { error: 'Your role has no priority, so it cannot reorder roles' },
        { status: 403 },
      );
    }

    const targetIds = entries.map((entry) => entry.id);
    const targetRes = await pool.query(
      'SELECT id, name, priority FROM roles WHERE id = ANY($1::int[])',
      [targetIds],
    );

    // Every id must name a real role. Without this, a typo or a stale panel
    // writes nothing and reports success, which is the failure mode that makes
    // an admin distrust the whole screen.
    if (targetRes.rows.length !== new Set(targetIds).size) {
      return NextResponse.json({ error: 'One or more roles were not found' }, { status: 404 });
    }

    for (const role of targetRes.rows) {
      if (role.name === 'Admin' || role.name === 'Fondateur') {
        return NextResponse.json(
          { error: `The ${role.name} role is locked and cannot be reordered` },
          { status: 403 },
        );
      }
    }

    if (!isUnrestricted) {
      for (const entry of entries) {
        if (entry.priority >= actorPriority) {
          return NextResponse.json(
            { error: 'Cannot move a role to your own rank or higher' },
            { status: 403 },
          );
        }
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const entry of entries) {
        await client.query('UPDATE roles SET priority = $1 WHERE id = $2', [
          entry.priority,
          entry.id,
        ]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    return NextResponse.json({ message: 'Roles reordered successfully' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
