import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET() {
  try {
    const res = await pool.query('SELECT setting_key, setting_value FROM content_settings');
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
