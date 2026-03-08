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
      LEFT JOIN roles r ON u.role_id = r.id 
      WHERE u.id = $1
    `, [decoded.userId]);
    
    console.log("lib/adminAuth.ts - Résultat de la requête DB:", userRes.rows[0]);

    if (userRes.rows.length === 0) return null;
    
    const user = userRes.rows[0];
    const permissions = user.permissions || [];
    
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
