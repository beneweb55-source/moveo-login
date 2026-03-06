import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://neondb_owner:npg_htHL3N0DKzTA@ep-ancient-forest-ai8bpw82-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require",
  ssl: {
    rejectUnauthorized: false
  }
});

async function migrate() {
  try {
    console.log('Running migration...');
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE;
      ALTER TABLE users ALTER COLUMN password DROP NOT NULL;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires TIMESTAMP WITH TIME ZONE;
      ALTER TABLE users ALTER COLUMN avatar_url TYPE TEXT;
      ALTER TABLE users ALTER COLUMN banner_url TYPE TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS twitter_url VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS instagram_url VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS website_url VARCHAR(255);
    `);
    console.log('Migration successful');
  } catch (error) {
    console.error('Migration error:', error);
  } finally {
    await pool.end();
  }
}

migrate();
