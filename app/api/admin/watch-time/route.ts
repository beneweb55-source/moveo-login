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

    // Add a special entry to watch_history to adjust the total watch time
    await pool.query(`
      INSERT INTO watch_history (user_id, media_type, media_id, minutes_watched)
      VALUES ($1, 'admin_adjustment', 0, $2)
      ON CONFLICT (user_id, media_type, media_id) 
      DO UPDATE SET minutes_watched = watch_history.minutes_watched + EXCLUDED.minutes_watched, last_updated = CURRENT_TIMESTAMP
    `, [userId, minutesToAdd]);

    // Log the admin action
    try {
      await pool.query(`
        INSERT INTO admin_logs (admin_id, admin_name, action, target_type, target_id, metadata)
        VALUES ($1, $2, 'watch_time_adjustment', 'user', $3, $4)
      `, [adminUser.id, adminUser.name || adminUser.email, String(userId), JSON.stringify({ minutes_added: minutesToAdd })]);
    } catch (logError) {
      // Non-critical: don't fail the main action if logging fails
      console.error('Failed to log admin action:', logError);
    }

    return NextResponse.json({ message: 'Watch time adjusted successfully' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
