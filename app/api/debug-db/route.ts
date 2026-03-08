import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET(req: Request) {
  try {
    // First, remove duplicates to allow adding the constraint
    await pool.query(`
      DELETE FROM online_users a USING online_users b
      WHERE a.id < b.id AND a.user_id = b.user_id AND a.user_id IS NOT NULL;
    `);

    // Add the constraint
    await pool.query(`
      ALTER TABLE online_users 
      DROP CONSTRAINT IF EXISTS unique_user_id;
      
      ALTER TABLE online_users 
      ADD CONSTRAINT unique_user_id UNIQUE (user_id);
    `);
    
    return NextResponse.json({ message: 'Constraint added successfully' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message });
  }
}
