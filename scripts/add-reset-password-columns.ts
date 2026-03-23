import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import pool from '../lib/db';

async function migrate() {
  try {
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS reset_password_token VARCHAR(255),
      ADD COLUMN IF NOT EXISTS reset_password_expires TIMESTAMP WITH TIME ZONE;
    `);
    console.log('Migration successful');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    process.exit(0);
  }
}

migrate();
