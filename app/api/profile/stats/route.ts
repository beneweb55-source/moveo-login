import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import pool from '@/lib/db';

async function getUserFromToken() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;
    if (!token) return null;
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback_secret');
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch (error) {
    return null;
  }
}

export async function GET(req: Request) {
  try {
    const user = await getUserFromToken();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await pool.query(
      `SELECT list_type, COUNT(*) as count 
       FROM user_list 
       WHERE user_id = $1 
       GROUP BY list_type`,
      [user.userId]
    );

    const stats = {
      watchlist: 0,
      favorites: 0,
      watched: 0
    };

    result.rows.forEach(row => {
      if (row.list_type === 'watchlist') stats.watchlist = parseInt(row.count);
      if (row.list_type === 'favorites') stats.favorites = parseInt(row.count);
      if (row.list_type === 'watched') stats.watched = parseInt(row.count);
    });

    return NextResponse.json({ stats }, { status: 200 });
  } catch (error: any) {
    console.error('Error fetching stats:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
