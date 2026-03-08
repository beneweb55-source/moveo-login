import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { checkAdminAccess } from '@/lib/adminAuth';

export async function GET() {
  const adminUser = await checkAdminAccess('access_admin_panel');
  if (!adminUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // Delete stale sessions (> 2 minutes)
    await pool.query(`DELETE FROM online_users WHERE last_ping < NOW() - INTERVAL '2 minutes'`);

    // Get online users
    const onlineUsersRes = await pool.query(`
      SELECT o.*, u.name, u.email, u.avatar_url, r.name as role_name, r.color as role_color,
             COALESCE((SELECT SUM(minutes_watched) FROM watch_history WHERE user_id = u.id), 0) as total_watch_time
      FROM online_users o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN roles r ON u.role_id = r.id
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
