import { getJwtSecret } from '@/lib/jwtSecret';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import pool from '@/lib/db';

const FOUNDER_EMAIL = process.env.FOUNDER_EMAIL || '';

export async function checkAdminAccess(requiredPermission?: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  if (!token) return null;

  try {
    const secret = getJwtSecret();
    const { payload: decoded } = await jwtVerify(token, secret);

    // `users.id` is an integer PRIMARY KEY, and the query below compared it as
    // `id::text = $1`. Casting the indexed column makes the predicate
    // non-sargable — Postgres cannot use the primary-key index — so the lookup
    // scanned the whole users table. This is the hottest authenticated path in
    // the app: middleware.ts self-fetches /api/auth/me for every matched request
    // from a signed-in user, and every admin route arrives here too.
    // The claim is validated rather than trusted: a token whose userId is not an
    // integer identifies no user, and fails closed exactly as an unreadable
    // token does above.
    const userId = Number(decoded.userId);
    if (!Number.isInteger(userId)) return null;
    
    const userRes = await pool.query(`
      SELECT u.*, r.permissions, r.priority, r.name as role_name, r.color as role_color
      FROM users u 
      LEFT JOIN roles r ON u.role_id::integer = r.id::integer 
      WHERE u.id = $1
    `, [userId]);
    
    if (userRes.rows.length === 0) return null;
    
    const user = userRes.rows[0];
    let permissions = user.permissions || [];
    
    // Founder override — centralized via FOUNDER_EMAIL env var
    if (FOUNDER_EMAIL && user.email === FOUNDER_EMAIL) {
      permissions = ["view_users", "edit_users", "ban_users", "edit_roles", "edit_hero", "pin_sections", "view_reports", "handle_reports", "view_stats", "manage_watch_time", "manage_roles", "access_admin_panel"];
      user.priority = 999;
      user.role_name = 'Fondateur';
      user.is_founder = true;
    }

    if (typeof permissions === 'string') {
      try { permissions = JSON.parse(permissions); } catch (e) { permissions = []; }
    }

    user.permissions = permissions;
    
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
