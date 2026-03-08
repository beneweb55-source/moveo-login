import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email') || 'tvmystral@gmail.com';
  
  try {
    const userRes = await pool.query('SELECT id, email, role_id FROM users WHERE email = $1', [email]);
    const rolesRes = await pool.query('SELECT id, name, permissions FROM roles');
    
    let joinRes = null;
    if (userRes.rows.length > 0) {
      joinRes = await pool.query(`
        SELECT u.id, u.email, u.role_id, r.id as r_id, r.name, r.permissions
        FROM users u
        LEFT JOIN roles r ON u.role_id = r.id
        WHERE u.email = $1
      `, [email]);
    }
    
    return NextResponse.json({
      user: userRes.rows[0],
      roles: rolesRes.rows,
      join: joinRes ? joinRes.rows[0] : null
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message });
  }
}
