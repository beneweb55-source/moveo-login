import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { checkAdminAccess } from '@/lib/adminAuth';

export async function GET() {
  const adminUser = await checkAdminAccess('access_admin_panel');
  if (!adminUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // ─── THIS DEFINITION MUST MATCH scripts/run-migration.ts ─────────────────
    //
    // It did not, and the divergence was not cosmetic: this bootstrap declared
    // `setting_value TEXT` while the script declares `setting_value JSONB`. The
    // PUT writes `JSON.stringify(value)`, and node-postgres PARSES a jsonb column
    // on the way out and does not parse a text one — so the SAME request returned
    // a string on a database bootstrapped here and an object on a database
    // migrated by the script, decided by which CREATE TABLE ran first on a fresh
    // installation. Both consumers happened to defend against it
    // (`typeof data.hero_movie === 'string' ? JSON.parse(...)`), which is how it
    // survived: the bug was absorbed twice rather than fixed once.
    //
    // The script's version wins because it is the one an operator runs, and every
    // other table in the schema follows it.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS content_settings (
        id SERIAL PRIMARY KEY,
        setting_key VARCHAR(255) UNIQUE NOT NULL,
        setting_value JSONB NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const res = await pool.query('SELECT setting_key, setting_value FROM content_settings');
    const settings = res.rows.reduce((acc: any, row: any) => {
      acc[row.setting_key] = row.setting_value;
      return acc;
    }, {});
    return NextResponse.json(settings);
  } catch (error) {
    console.error('[admin/content] GET failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const adminUser = await checkAdminAccess('edit_hero'); // Or pin_sections
  if (!adminUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { key, value } = await req.json();

    if (!key || value === undefined) {
      return NextResponse.json({ error: 'Key and value required' }, { status: 400 });
    }

    // `JSON.stringify` is required by the column: `setting_value` is JSONB, and a
    // parameter is sent as text, so a bare object would be a parameter-type
    // error. `updated_at` is deliberately NOT quoted — unlike the `current_time`
    // column in watch_history it is not a reserved word, and `CURRENT_TIMESTAMP`
    // in a SET clause is the server's clock, which is what it should be.
    await pool.query(`
      INSERT INTO content_settings (setting_key, setting_value)
      VALUES ($1, $2)
      ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = CURRENT_TIMESTAMP
    `, [key, JSON.stringify(value)]);

    return NextResponse.json({ message: 'Setting updated successfully' });
  } catch (error) {
    console.error('[admin/content] PUT failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
