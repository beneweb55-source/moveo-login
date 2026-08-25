import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import pool from '@/lib/db';

const FOUNDER_EMAIL = process.env.FOUNDER_EMAIL || '';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;

    if (!token) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback_secret');
    const { payload } = await jwtVerify(token, secret);

    const result = await pool.query(`
      SELECT 
        u.id, u.name, u.email, u.bio, u.avatar_url, 
        u.banner_url, u.created_at, u.twitter_url, 
        u.instagram_url, u.website_url, u.is_banned, u.ban_reason,
        (SELECT COUNT(*) FROM user_list WHERE user_id = u.id AND list_type = 'watched') as watched_count,
        COALESCE((SELECT SUM(minutes_watched) FROM watch_history WHERE user_id = u.id), 0) as total_watch_time,
        u.role_id,
        r.name as role_name,
        r.color as role_color,
        r.permissions,
        r.priority
      FROM users u
      LEFT JOIN roles r ON u.role_id::integer = r.id::integer
      WHERE u.id::text = $1
    `, [payload.userId]);

    if (result.rows.length === 0) {
      return NextResponse.json({ user: null }, { status: 404 });
    }

    const user = result.rows[0];
    
    // Check if user is banned
    if (user.is_banned) {
      const response = NextResponse.json(
        { user: null, banned: true, ban_reason: user.ban_reason },
        { status: 403 }
      );
      response.cookies.delete('auth_token');
      return response;
    }

    let permissions = user.permissions || [];
    let role_name = user.role_name;
    let role_color = user.role_color;
    let priority = user.priority || 0;

    // Founder override — centralized via FOUNDER_EMAIL env var
    if (FOUNDER_EMAIL && user.email === FOUNDER_EMAIL) {
      permissions = ["view_users", "edit_users", "ban_users", "edit_roles", "edit_hero", "pin_sections", "view_reports", "handle_reports", "view_stats", "manage_watch_time", "manage_roles", "access_admin_panel"];
      role_name = 'Fondateur';
      role_color = '#FFD700';
      priority = 999;
    }

    // Ensure permissions is always an array
    if (typeof permissions === 'string') {
      try { permissions = JSON.parse(permissions); } catch (e) { permissions = []; }
    }

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
