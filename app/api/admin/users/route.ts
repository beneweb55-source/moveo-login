import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { checkAdminAccess } from '@/lib/adminAuth';

export async function GET(req: Request) {
  const adminUser = await checkAdminAccess('view_users');
  if (!adminUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search') || '';
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');
  const sort = searchParams.get('sort') || 'created_at';
  const offset = (page - 1) * limit;

  try {
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
    const totalUsers = parseInt(countRes.rows[0].count);

    return NextResponse.json({
      users: usersRes.rows,
      totalPages: Math.ceil(totalUsers / limit),
      currentPage: page
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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
    if (targetPriority >= adminUser.priority && adminUser.id !== userId) {
      return NextResponse.json({ error: 'Cannot modify user with higher or equal priority' }, { status: 403 });
    }

    // Cannot modify Admin role directly if you are not Admin
    if (targetRoleName === 'Admin' && adminUser.role_name !== 'Admin') {
      return NextResponse.json({ error: 'Cannot modify Admin user' }, { status: 403 });
    }

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (roleId !== undefined && (adminUser.permissions ?? []).includes('edit_roles')) {
      // Check if new role has higher priority than admin
      const newRoleRes = await pool.query(`SELECT priority, name FROM roles WHERE id = $1`, [roleId]);
      if (newRoleRes.rows.length > 0) {
        if (newRoleRes.rows[0].priority >= adminUser.priority && adminUser.role_name !== 'Admin') {
          return NextResponse.json({ error: 'Cannot assign role with higher or equal priority' }, { status: 403 });
        }
        updates.push(`role_id = $${paramIndex++}`);
        values.push(roleId);
      }
    }

    if (isBanned !== undefined && (adminUser.permissions ?? []).includes('ban_users')) {
      updates.push(`is_banned = $${paramIndex++}`);
      values.push(isBanned);
      updates.push(`ban_reason = $${paramIndex++}`);
      values.push(banReason || null);
    }

    if (updates.length === 0) {
      return NextResponse.json({ message: 'No updates provided or insufficient permissions' });
    }

    values.push(userId);
    await pool.query(`
      UPDATE users 
      SET ${updates.join(', ')} 
      WHERE id::text = $${paramIndex}
    `, values);

    return NextResponse.json({ message: 'User updated successfully' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
