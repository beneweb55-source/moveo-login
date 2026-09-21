import { NextResponse } from 'next/server';
import pool from '@/lib/db';

// The only keys the storefront may read. This endpoint has no authentication,
// and content_settings is shared with admin-only concerns — app/api/admin/system
// stores `maintenance_mode` in the same table — so it returns an allowlist
// rather than every row. A setting added later for admin use must not become
// public by default merely because it was stored alongside the hero.
const PUBLIC_SETTING_KEYS = ['hero_movie'];

export async function GET() {
  try {
    const res = await pool.query(
      'SELECT setting_key, setting_value FROM content_settings WHERE setting_key = ANY($1::text[])',
      [PUBLIC_SETTING_KEYS]
    );
    const settings = res.rows.reduce((acc: any, row: any) => {
      acc[row.setting_key] = row.setting_value;
      return acc;
    }, {});
    return NextResponse.json(settings);
  } catch (error: any) {
    // The message stays in the server log. This endpoint has no authentication,
    // and a Postgres error string carries table, column and constraint detail.
    console.error('[settings] GET failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
