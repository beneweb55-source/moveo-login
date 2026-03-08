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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
