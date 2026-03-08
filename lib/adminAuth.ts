import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import pool from '@/lib/db';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export async function checkAdminAccess(requiredPermission?: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const userRes = await pool.query(`
      SELECT u.*, r.permissions, r.priority, r.name as role_name, r.color as role_color
      FROM users u 
      LEFT JOIN roles r ON u.role_id::integer = r.id::integer 
      WHERE u.id::text = $1
    `, [decoded.userId]);
    
    if (userRes.rows.length === 0) return null;
    
    const user = userRes.rows[0];
    let permissions = user.permissions || [];
    
    if (user.email === 'tvmystral@gmail.com') {
      permissions = ["view_users", "edit_users", "ban_users", "edit_roles", "edit_hero", "pin_sections", "view_reports", "handle_reports", "view_stats", "manage_watch_time", "manage_roles", "access_admin_panel"];
      user.priority = 999;
      user.role_name = 'Fondateur';
    }

    if (typeof permissions === 'string') {
      try { permissions = JSON.parse(permissions); } catch (e) { permissions = []; }
    }
    
    if (!permissions.includes('access_admin_panel')) {
      return null;
    }

    if (requiredPermission && !permissions.includes(requiredPermission)) {
      return null;
    }
    
    return user;
  } catch (error) {
    return null;
  }
}
