import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { checkAdminAccess } from '@/lib/adminAuth';

/**
 * THE THREE STATES A REPORT HAS, named once.
 *
 * `status` is a free-form `VARCHAR(50)` and the PUT below used to write whatever
 * string it was handed. The UI only ever sends two of these, but the endpoint is
 * the thing that has to protect the action — and the list renders any status that
 * is not `resolved` as "Rejeté", so a value written through the API by anything
 * else would display as a decision no admin made.
 */
const REPORT_STATUSES = ['pending', 'resolved', 'rejected'] as const;
type ReportStatus = (typeof REPORT_STATUSES)[number];

/** Rows per page. Fixed, because the UI has no control for it. */
const PAGE_SIZE = 20;

export async function GET(req: Request) {
  const adminUser = await checkAdminAccess('view_reports');
  if (!adminUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') || 'pending';
  if (!REPORT_STATUSES.includes(status as ReportStatus)) {
    return NextResponse.json({ error: 'Unknown status' }, { status: 400 });
  }

  // `?page=abc` gave `NaN`, and `(NaN - 1) * 20` reached Postgres as an OFFSET of
  // `NaN` — a failed query and a 500 on a moderation screen, from a URL. `?page=0`
  // and `?page=-5` produced a NEGATIVE offset, which Postgres rejects with
  // "OFFSET must not be negative". A page number is a positive integer or it is
  // page one; there is no third reading, and 400 would be a worse answer than the
  // queue's first page for an admin who mistyped a link.
  const requestedPage = Number.parseInt(searchParams.get('page') || '1', 10);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const offset = (page - 1) * PAGE_SIZE;

  try {
    // ─── THIS DEFINITION MUST MATCH scripts/init-new-db.ts ───────────────────
    //
    // It did not. This bootstrap declared `content_type`, `content_id` and a
    // `reason VARCHAR(255)`, while scripts/init-new-db.ts and
    // scripts/run-migration.ts declare `reported_item_type`, `reported_item_id`
    // and `reason TEXT`, with a `TIMESTAMP WITH TIME ZONE`. `CREATE TABLE IF NOT
    // EXISTS` means the FIRST one to run wins and the other is a silent no-op, so
    // the schema of this table depended on which request happened to arrive first
    // on a fresh database — and the script's version is the one the operator runs
    // and the one every other table already follows.
    //
    // It is kept as a fallback rather than deleted, for the same reason the
    // pinned-sections bootstrap is: if no migration has been run, removing it
    // leaves the endpoint reading a table that does not exist. What it may not do
    // is disagree. There is currently no writer for this table anywhere in the
    // codebase, so nothing inserts into it yet — which is exactly why the columns
    // matter now, while the divergence is still free to fix.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reports (
        id SERIAL PRIMARY KEY,
        reporter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        reported_item_type VARCHAR(50) NOT NULL,
        reported_item_id INTEGER NOT NULL,
        reason TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
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
    const reportsRes = await pool.query(query, [status, PAGE_SIZE, offset]);

    const countRes = await pool.query(`SELECT COUNT(*) FROM reports WHERE status = $1`, [status]);
    const totalReports = Number.parseInt(String(countRes.rows[0].count ?? '0'), 10) || 0;

    return NextResponse.json({
      reports: reportsRes.rows,
      totalPages: Math.max(1, Math.ceil(totalReports / PAGE_SIZE)),
      currentPage: page
    });
  } catch (error) {
    console.error('[admin/reports] GET failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
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

    // The endpoint protects the action, not the button that happens to call it.
    // "UI cachée ≠ sécurité" — and here the visible consequence is worse than an
    // unauthorised write: the list prints "Rejeté" for any status that is not
    // `resolved`, so an unrecognised value renders as a moderation decision.
    if (!REPORT_STATUSES.includes(status as ReportStatus)) {
      return NextResponse.json({ error: 'Unknown status' }, { status: 400 });
    }

    const result = await pool.query(`
      UPDATE reports
      SET status = $1
      WHERE id = $2
    `, [status, reportId]);

    // A PUT against an id that does not exist used to answer "updated
    // successfully". The UI refetches either way so nothing breaks visibly, but
    // an endpoint that reports success for a write that touched no row is the
    // reason a moderation action can look applied and not be.
    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Report updated successfully' });
  } catch (error) {
    console.error('[admin/reports] PUT failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
