import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { checkAdminAccess } from '@/lib/adminAuth';

export async function POST(req: Request) {
  const adminUser = await checkAdminAccess('manage_watch_time');
  if (!adminUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { userId, minutesToAdd } = await req.json();

    if (!userId || minutesToAdd === undefined) {
      return NextResponse.json({ error: 'User ID and minutesToAdd required' }, { status: 400 });
    }

    // Add a dummy entry to watch_history to adjust the total watch time
    // We can use a special media_type like 'admin_adjustment'
    await pool.query(`
      ALTER TABLE watch_history ADD CONSTRAINT IF NOT EXISTS watch_history_unique 
      UNIQUE (user_id, media_type, media_id);
    `);

    await pool.query(`
      INSERT INTO watch_history (user_id, media_type, media_id, minutes_watched)
      VALUES ($1, 'admin_adjustment', $2, $3)
      ON CONFLICT (user_id, media_type, media_id) 
      DO UPDATE SET minutes_watched = watch_history.minutes_watched + EXCLUDED.minutes_watched, last_updated = CURRENT_TIMESTAMP
    `, [userId, 0, minutesToAdd]);

    return NextResponse.json({ message: 'Watch time adjusted successfully' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
