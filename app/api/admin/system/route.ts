import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { checkAdminAccess } from '@/lib/adminAuth';

// GET — health checks + recent logs + maintenance status
export async function GET(req: Request) {
  const adminUser = await checkAdminAccess('access_admin_panel');
  if (!adminUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action') || 'full';

  try {
    const result: any = {};

    if (action === 'full' || action === 'health') {
      // Real health checks
      const healthChecks: Record<string, { status: string; latency?: number; error?: string }> = {};

      // 1. Database check
      const dbStart = Date.now();
      try {
        await pool.query('SELECT 1');
        healthChecks.database = { status: 'online', latency: Date.now() - dbStart };
      } catch (e: any) {
        healthChecks.database = { status: 'offline', error: e.message };
      }

      // 2. Auth check (verify JWT infrastructure works)
      const authStart = Date.now();
      try {
        // If we got this far, auth is working (checkAdminAccess succeeded)
        healthChecks.auth = { status: 'online', latency: Date.now() - authStart };
      } catch (e: any) {
        healthChecks.auth = { status: 'offline', error: e.message };
      }

      // 3. TMDB check
      const tmdbStart = Date.now();
      try {
        const tmdbRes = await fetch('https://api.themoviedb.org/3/configuration', {
          headers: {
            Authorization: `Bearer ${process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY}`
          },
          signal: AbortSignal.timeout(5000)
        });
        if (tmdbRes.ok) {
          healthChecks.tmdb = { status: 'online', latency: Date.now() - tmdbStart };
        } else {
          healthChecks.tmdb = { status: 'offline', error: `HTTP ${tmdbRes.status}` };
        }
      } catch (e: any) {
        healthChecks.tmdb = { status: 'offline', latency: Date.now() - tmdbStart, error: e.message };
      }

      result.healthChecks = healthChecks;
    }

    if (action === 'full' || action === 'logs') {
      // Fetch real admin logs
      try {
        const logsRes = await pool.query(`
          SELECT id, admin_name, action, target_type, target_id, metadata, status, created_at
          FROM admin_logs
          ORDER BY created_at DESC
          LIMIT 20
        `);
        result.logs = logsRes.rows;
      } catch (e) {
        // Table might not exist yet
        result.logs = [];
      }
    }

    if (action === 'full' || action === 'maintenance') {
      // Get maintenance mode status
      try {
        const maintenanceRes = await pool.query(`
          SELECT setting_value FROM content_settings WHERE setting_key = 'maintenance_mode'
        `);
        result.maintenance = maintenanceRes.rows[0]?.setting_value || { enabled: false };
      } catch (e) {
        result.maintenance = { enabled: false };
      }
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST — toggle maintenance, log admin actions
export async function POST(req: Request) {
  const adminUser = await checkAdminAccess('access_admin_panel');
  if (!adminUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { action, data } = await req.json();

    if (action === 'toggle_maintenance') {
      const enabled = !!data?.enabled;
      const message = data?.message || 'Site en maintenance. Nous revenons bientôt.';

      await pool.query(`
        INSERT INTO content_settings (setting_key, setting_value, updated_at)
        VALUES ('maintenance_mode', $1, CURRENT_TIMESTAMP)
        ON CONFLICT (setting_key) 
        DO UPDATE SET setting_value = $1, updated_at = CURRENT_TIMESTAMP
      `, [JSON.stringify({ enabled, message })]);

      // Log the action
      await pool.query(`
        INSERT INTO admin_logs (admin_id, admin_name, action, metadata)
        VALUES ($1, $2, $3, $4)
      `, [adminUser.id, adminUser.name || adminUser.email, enabled ? 'maintenance_enabled' : 'maintenance_disabled', JSON.stringify({ message })]);

      return NextResponse.json({ success: true, maintenance: { enabled, message } });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
