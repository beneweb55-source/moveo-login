import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    console.log('Removing duplicates...');
    await pool.query(`
      DELETE FROM online_users a USING online_users b
      WHERE a.id < b.id AND a.user_id = b.user_id AND a.user_id IS NOT NULL;
    `);

    console.log('Adding constraint...');
    await pool.query(`
      ALTER TABLE online_users 
      DROP CONSTRAINT IF EXISTS unique_user_id;
      
      ALTER TABLE online_users 
      ADD CONSTRAINT unique_user_id UNIQUE (user_id);
    `);
    
    console.log('Done!');
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}

run();
