import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { checkAdminAccess } from '@/lib/adminAuth';

export async function GET() {
  try {
    const res = await pool.query('SELECT * FROM pinned_sections ORDER BY priority ASC');
    
    if (res.rows.length === 0) {
      // Seed default sections
      const defaultSections = [
        { title: 'Tendances', endpoint: '/trending/all/day', priority: 1 },
        { title: 'Films Populaires', endpoint: '/movie/popular', priority: 2 },
        { title: 'Séries Populaires', endpoint: '/tv/popular', priority: 3 },
        { title: 'Mieux Notés', endpoint: '/movie/top_rated', priority: 4 },
        { title: 'Nouveautés', endpoint: '/movie/now_playing', priority: 5 }
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
