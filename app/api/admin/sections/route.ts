import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { checkAdminAccess } from '@/lib/adminAuth';

/**
 * Bootstrap for `pinned_sections` — run at most once per server process.
 *
 * This work used to run inside GET, on every request, without authentication:
 * two `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE` statements and a 12-row seed,
 * on the endpoint the home page calls on every single load.
 *
 * Idempotent is not the same as free. `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
 * still takes an ACCESS EXCLUSIVE lock even when it has nothing to add, so every
 * home page load briefly locked a table the page then reads. The seed's
 * "is the table empty?" check also raced: two concurrent first requests both saw
 * zero rows and both inserted, giving 24 sections instead of 12.
 *
 * Memoising the whole thing fixes both, and is a smaller change than it looks —
 * GET still bootstraps on a fresh deployment, because the first request runs it.
 *
 * It is deliberately NOT a `let done = false` flag: a promise that REJECTED must
 * not be cached, or one transient database error would leave the endpoint broken
 * for the entire life of the process. The catch clears the memo before rethrowing
 * so the next request tries again.
 *
 * The proper long-term home is a migration — scripts/init-new-db.ts already
 * bootstraps every other table. It is left here for now because deleting it
 * outright would leave a fresh database with no `pinned_sections` at all, and no
 * migration has been written or run to cover it.
 */
let bootstrapPromise: Promise<void> | null = null;

const createPinnedSections = async (): Promise<void> => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pinned_sections (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      endpoint VARCHAR(255) NOT NULL,
      priority INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Ensure title and endpoint columns exist for older tables
  await pool.query(`
    ALTER TABLE pinned_sections ADD COLUMN IF NOT EXISTS title VARCHAR(255) NOT NULL DEFAULT '';
    ALTER TABLE pinned_sections ADD COLUMN IF NOT EXISTS endpoint VARCHAR(255) NOT NULL DEFAULT '/';
  `);

  const existing = await pool.query('SELECT 1 FROM pinned_sections LIMIT 1');
  if (existing.rows.length > 0) return;

  // Seed default sections. Reached only on a genuinely empty table.
  const defaultSections = [
    { title: 'Tendances', endpoint: '/trending/all/day', priority: 1 },
    { title: 'Top 10 en France', endpoint: '/movie/popular?region=FR', priority: 2 },
    { title: 'Films Populaires', endpoint: '/movie/popular', priority: 3 },
    { title: 'Séries Populaires', endpoint: '/tv/popular', priority: 4 },
    { title: 'Animes', endpoint: '/discover/tv?with_genres=16&with_original_language=ja', priority: 5 },
    { title: 'K-Dramas', endpoint: '/discover/tv?with_original_language=ko', priority: 6 },
    { title: 'Action', endpoint: '/discover/movie?with_genres=28', priority: 7 },
    { title: 'Comédie', endpoint: '/discover/movie?with_genres=35', priority: 8 },
    { title: 'Horreur', endpoint: '/discover/movie?with_genres=27', priority: 9 },
    { title: 'Science-Fiction', endpoint: '/discover/movie?with_genres=878', priority: 10 },
    { title: 'Mieux Notés', endpoint: '/movie/top_rated', priority: 11 },
    { title: 'Nouveautés', endpoint: '/movie/now_playing', priority: 12 },
  ];

  for (const section of defaultSections) {
    await pool.query(
      'INSERT INTO pinned_sections (title, endpoint, priority) VALUES ($1, $2, $3)',
      [section.title, section.endpoint, section.priority]
    );
  }
};

const ensurePinnedSections = (): Promise<void> => {
  if (!bootstrapPromise) {
    bootstrapPromise = createPinnedSections().catch((error) => {
      // Do not cache a failure: the next request must be free to retry.
      bootstrapPromise = null;
      throw error;
    });
  }
  return bootstrapPromise;
};

export async function GET() {
  try {
    await ensurePinnedSections();
    const res = await pool.query('SELECT * FROM pinned_sections ORDER BY priority ASC');
    return NextResponse.json(res.rows);
  } catch (error) {
    // The message stays in the server log. Returning it to the caller exposed
    // database and schema detail on an unauthenticated endpoint.
    console.error('[admin/sections] GET failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const adminUser = await checkAdminAccess('pin_sections');
  if (!adminUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { title, endpoint, priority } = await req.json();
    const res = await pool.query(
      'INSERT INTO pinned_sections (title, endpoint, priority) VALUES ($1, $2, $3) RETURNING *',
      [title, endpoint, priority || 0]
    );
    return NextResponse.json(res.rows[0]);
  } catch (error) {
    console.error('[admin/sections] POST failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const adminUser = await checkAdminAccess('pin_sections');
  if (!adminUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    await pool.query('DELETE FROM pinned_sections WHERE id = $1', [id]);
    return NextResponse.json({ message: 'Section deleted' });
  } catch (error) {
    console.error('[admin/sections] DELETE failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
