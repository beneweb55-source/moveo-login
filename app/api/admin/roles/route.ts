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

export async function PATCH(req: Request) {
  const adminUser = await checkAdminAccess('manage_roles');
  if (!adminUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { updates } = await req.json(); // updates: { id, priority }[]

    if (!Array.isArray(updates)) {
      return NextResponse.json({ error: 'Invalid updates format' }, { status: 400 });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const update of updates) {
         await client.query('UPDATE roles SET priority = $1 WHERE id = $2', [update.priority, update.id]);
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
