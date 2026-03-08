import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { checkAdminAccess } from '@/lib/adminAuth';

export async function GET() {
  try {
    const res = await pool.query('SELECT * FROM pinned_sections ORDER BY display_order ASC');
    return NextResponse.json(res.rows);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const adminUser = await checkAdminAccess('pin_sections');
  if (!adminUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { sections } = await req.json();
    for (const section of sections) {
      await pool.query(`
        INSERT INTO pinned_sections (section_key, is_pinned, display_order)
        VALUES ($1, $2, $3)
        ON CONFLICT (section_key) DO UPDATE SET is_pinned = EXCLUDED.is_pinned, display_order = EXCLUDED.display_order
      `, [section.section_key, section.is_pinned, section.display_order]);
    }
    return NextResponse.json({ message: 'Sections updated successfully' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
