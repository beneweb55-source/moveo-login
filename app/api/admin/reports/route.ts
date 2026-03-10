import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { checkAdminAccess } from '@/lib/adminAuth';

export async function GET(req: Request) {
  const adminUser = await checkAdminAccess('view_reports');
  if (!adminUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') || 'pending';
  const page = parseInt(searchParams.get('page') || '1');
  const limit = 20;
  const offset = (page - 1) * limit;

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reports (
        id SERIAL PRIMARY KEY,
        reporter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        content_type VARCHAR(50) NOT NULL,
        content_id INTEGER NOT NULL,
        reason VARCHAR(255) NOT NULL,
        details TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const query = `
      SELECT r.*, u.name as reporter_name, u.email as reporter_email
      FROM reports r
      LEFT JOIN users u ON r.reporter_id = u.id
      WHERE r.status = $1
      ORDER BY r.created_at DESC
      LIMIT $2 OFFSET $3
    `;
    const reportsRes = await pool.query(query, [status, limit, offset]);
    
    const countRes = await pool.query(`SELECT COUNT(*) FROM reports WHERE status = $1`, [status]);
    const totalReports = parseInt(countRes.rows[0].count);

    return NextResponse.json({
      reports: reportsRes.rows,
      totalPages: Math.ceil(totalReports / limit),
      currentPage: page
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const adminUser = await checkAdminAccess('handle_reports');
  if (!adminUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { reportId, status } = await req.json();

    if (!reportId || !status) {
      return NextResponse.json({ error: 'Report ID and status required' }, { status: 400 });
    }

    await pool.query(`
      UPDATE reports 
      SET status = $1 
      WHERE id = $2
    `, [status, reportId]);

    return NextResponse.json({ message: 'Report updated successfully' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
