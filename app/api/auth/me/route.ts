import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import pool from '@/lib/db';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;

    if (!token) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback_secret');
    const { payload } = await jwtVerify(token, secret);

    // Fetch fresh user data from database
    const result = await pool.query(`
      SELECT 
        u.id, u.name, u.email, u.bio, u.avatar_url, 
        u.banner_url, u.created_at, u.twitter_url, 
        u.instagram_url, u.website_url,
        u.role_id,
        r.name as role_name,
        r.color as role_color,
        r.permissions,
        r.priority
      FROM users u
      LEFT JOIN roles r ON u.role_id::integer = r.id::integer
      WHERE u.id::text = $1
    `, [payload.userId]);

    console.log("API /auth/me - Résultat de la requête DB:", result.rows[0]);

    if (result.rows.length === 0) {
      return NextResponse.json({ user: null }, { status: 404 });
    }

    const user = result.rows[0];
    
    let permissions = user.permissions || [];
    let role_name = user.role_name;
    let role_color = user.role_color;
    let priority = user.priority || 0;

    // Sécurité absolue : forcer les droits pour le fondateur si la jointure échoue
    if (user.email === 'tvmystral@gmail.com') {
      permissions = ["view_users", "edit_users", "ban_users", "edit_roles", "edit_hero", "pin_sections", "view_reports", "handle_reports", "view_stats", "manage_watch_time", "manage_roles", "access_admin_panel"];
      role_name = 'Fondateur';
      role_color = '#FFD700';
      priority = 999;
    }

    // S'assurer que permissions est bien un tableau
    if (typeof permissions === 'string') {
      try { permissions = JSON.parse(permissions); } catch (e) { permissions = []; }
    }

    try {
      const fs = require('fs');
      fs.writeFileSync('/app/db-debug.json', JSON.stringify({
        user_from_db: user,
        payload_userId: payload.userId,
        typeof_permissions: typeof permissions,
        isArray: Array.isArray(permissions)
      }, null, 2));
    } catch(e) {}

    return NextResponse.json({ 
      user: {
        ...user,
        permissions,
        role_name,
        role_color,
        priority
      } 
    }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
}
