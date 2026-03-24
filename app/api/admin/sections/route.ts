import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { checkAdminAccess } from '@/lib/adminAuth';

export async function GET() {
  try {
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

    const res = await pool.query('SELECT * FROM pinned_sections ORDER BY priority ASC');
    
    if (res.rows.length === 0) {
      // Seed default sections
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
        { title: 'Nouveautés', endpoint: '/movie/now_playing', priority: 12 }
      ];
      
      for (const section of defaultSections) {
        await pool.query(
          'INSERT INTO pinned_sections (title, endpoint, priority) VALUES ($1, $2, $3)',
          [section.title, section.endpoint, section.priority]
        );
      }
      
      const newRes = await pool.query('SELECT * FROM pinned_sections ORDER BY priority ASC');
      return NextResponse.json(newRes.rows);
    }
    
    return NextResponse.json(res.rows);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
